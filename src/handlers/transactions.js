"use strict";

const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient, TABLES } = require("../lib/dynamodb");
const { wrapHandler } = require("../lib/handler");
const {
  badRequest,
  conflict,
  notFound,
  ok,
  parseJsonBody,
} = require("../lib/response");
const {
  CURRENCIES,
  isNonEmptyString,
  isPlainObject,
  isPositiveNumber,
} = require("../lib/validation");

async function findAccount(accountId) {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLES.accounts, Key: { accountId } })
  );
  return result.Item;
}

function isConditionalCheckFailed(err) {
  return err?.name === "ConditionalCheckFailedException";
}

/** Atomic credit; DynamoDB does the decimal arithmetic, so no float drift. */
async function credit(accountId, amount) {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.accounts,
      Key: { accountId },
      UpdateExpression: "SET balance = balance + :amount",
      ConditionExpression: "attribute_exists(accountId)",
      ExpressionAttributeValues: { ":amount": amount },
      ReturnValues: "ALL_NEW",
    })
  );
  return result.Attributes;
}

/**
 * Atomic debit. The balance condition makes concurrent withdrawals safe:
 * the update fails instead of ever producing a negative balance.
 */
async function debit(accountId, amount) {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.accounts,
      Key: { accountId },
      UpdateExpression: "SET balance = balance - :amount",
      ConditionExpression: "attribute_exists(accountId) AND balance >= :amount",
      ExpressionAttributeValues: { ":amount": amount },
      ReturnValues: "ALL_NEW",
    })
  );
  return result.Attributes;
}

function parseAmountBody(body) {
  if (!isPlainObject(body)) {
    return { error: "Request body must be a JSON object" };
  }
  if (body.amount === undefined) {
    return { error: "amount is required" };
  }
  if (!isPositiveNumber(body.amount)) {
    return { error: "amount must be a number greater than 0" };
  }
  if (body.currency === undefined) {
    return { error: "currency is required" };
  }
  if (!CURRENCIES.includes(body.currency)) {
    return { error: "currency must be one of: CAD, USD" };
  }
  return { amount: body.amount, currency: body.currency };
}

/**
 * POST /accounts/{accountId}/deposits
 * Credit the account balance.
 */
async function deposit(event) {
  const accountId = event.pathParameters?.accountId;
  if (!accountId) {
    return badRequest("accountId path parameter is required");
  }

  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return parsed.response;
  }

  const input = parseAmountBody(parsed.data);
  if (input.error) {
    return badRequest(input.error);
  }

  const account = await findAccount(accountId);
  if (!account) {
    return notFound(`Account ${accountId} not found`);
  }
  if (account.currency !== input.currency) {
    return badRequest(
      `currency ${input.currency} does not match account currency ${account.currency}`
    );
  }

  return ok(await credit(accountId, input.amount));
}

/**
 * POST /accounts/{accountId}/withdrawals
 * Debit the account balance; 409 when funds are insufficient.
 */
async function withdraw(event) {
  const accountId = event.pathParameters?.accountId;
  if (!accountId) {
    return badRequest("accountId path parameter is required");
  }

  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return parsed.response;
  }

  const input = parseAmountBody(parsed.data);
  if (input.error) {
    return badRequest(input.error);
  }

  const account = await findAccount(accountId);
  if (!account) {
    return notFound(`Account ${accountId} not found`);
  }
  if (account.currency !== input.currency) {
    return badRequest(
      `currency ${input.currency} does not match account currency ${account.currency}`
    );
  }

  try {
    return ok(await debit(accountId, input.amount));
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return conflict("Insufficient funds");
    }
    throw err;
  }
}

/**
 * POST /transfers
 * Move funds between two accounts.
 *
 * Consistency: DynamoDB Local has no transactions in this setup, so the
 * transfer is a two-step saga — debit with a "balance >= amount" condition,
 * then credit, and refund the debit if the credit fails. See NOTES.md.
 */
async function transfer(event) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data;
  if (!isPlainObject(body)) {
    return badRequest("Request body must be a JSON object");
  }
  if (!isNonEmptyString(body.fromAccountId)) {
    return badRequest("fromAccountId is required");
  }
  if (!isNonEmptyString(body.toAccountId)) {
    return badRequest("toAccountId is required");
  }

  const input = parseAmountBody(body);
  if (input.error) {
    return badRequest(input.error);
  }

  if (body.fromAccountId === body.toAccountId) {
    return badRequest("fromAccountId and toAccountId must be different");
  }

  const [fromAccount, toAccount] = await Promise.all([
    findAccount(body.fromAccountId),
    findAccount(body.toAccountId),
  ]);

  if (!fromAccount) {
    return notFound(`Account ${body.fromAccountId} not found`);
  }
  if (!toAccount) {
    return notFound(`Account ${body.toAccountId} not found`);
  }
  if (fromAccount.currency !== toAccount.currency) {
    return badRequest("Accounts must have the same currency");
  }
  if (input.currency !== fromAccount.currency) {
    return badRequest(
      `currency ${input.currency} does not match account currency ${fromAccount.currency}`
    );
  }

  let debited;
  try {
    debited = await debit(fromAccount.accountId, input.amount);
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return conflict("Insufficient funds");
    }
    throw err;
  }

  try {
    const credited = await credit(toAccount.accountId, input.amount);
    return ok({ fromAccount: debited, toAccount: credited });
  } catch (err) {
    // Best-effort compensation so a failed credit does not destroy the debit.
    try {
      await credit(fromAccount.accountId, input.amount);
    } catch (refundErr) {
      console.error("CRITICAL: transfer compensation failed", {
        fromAccountId: fromAccount.accountId,
        toAccountId: toAccount.accountId,
        amount: input.amount,
        refundErr,
      });
    }
    throw err;
  }
}

module.exports = {
  deposit: wrapHandler(deposit),
  withdraw: wrapHandler(withdraw),
  transfer: wrapHandler(transfer),
};
