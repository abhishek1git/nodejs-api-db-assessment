"use strict";

const { randomUUID } = require("node:crypto");
const {
  GetCommand,
  PutCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { docClient, TABLES } = require("../lib/dynamodb");
const { wrapHandler } = require("../lib/handler");
const {
  badRequest,
  created,
  notFound,
  ok,
  parseJsonBody,
} = require("../lib/response");
const {
  ACCOUNT_TYPES,
  CURRENCIES,
  isPlainObject,
} = require("../lib/validation");

const CUSTOMER_ID_INDEX = "CustomerIdIndex";

async function findCustomer(customerId) {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLES.customers, Key: { customerId } })
  );
  return result.Item;
}

/**
 * POST /customers/{customerId}/accounts
 * Create an account for an existing customer.
 */
async function create(event) {
  const customerId = event.pathParameters?.customerId;
  if (!customerId) {
    return badRequest("customerId path parameter is required");
  }

  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data;
  if (!isPlainObject(body)) {
    return badRequest("Request body must be a JSON object");
  }
  if (body.type === undefined) {
    return badRequest("type is required");
  }
  if (!ACCOUNT_TYPES.includes(body.type)) {
    return badRequest("type must be one of: CHECKING, SAVINGS");
  }
  if (body.currency === undefined) {
    return badRequest("currency is required");
  }
  if (!CURRENCIES.includes(body.currency)) {
    return badRequest("currency must be one of: CAD, USD");
  }

  let initialBalance = 0;
  if (body.initialBalance !== undefined) {
    if (typeof body.initialBalance !== "number" || !Number.isFinite(body.initialBalance)) {
      return badRequest("initialBalance must be a number");
    }
    if (body.initialBalance < 0) {
      return badRequest("initialBalance must be greater than or equal to 0");
    }
    initialBalance = body.initialBalance;
  }

  const customer = await findCustomer(customerId);
  if (!customer) {
    return notFound(`Customer ${customerId} not found`);
  }

  const account = {
    accountId: `acct_${randomUUID()}`,
    customerId,
    type: body.type,
    currency: body.currency,
    balance: initialBalance,
    status: "OPEN",
    createdAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({ TableName: TABLES.accounts, Item: account })
  );

  return created(account);
}

/**
 * GET /customers/{customerId}/accounts
 * List accounts for a customer using the CustomerIdIndex GSI.
 */
async function list(event) {
  const customerId = event.pathParameters?.customerId;
  if (!customerId) {
    return badRequest("customerId path parameter is required");
  }

  const customer = await findCustomer(customerId);
  if (!customer) {
    return notFound(`Customer ${customerId} not found`);
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.accounts,
      IndexName: CUSTOMER_ID_INDEX,
      KeyConditionExpression: "customerId = :customerId",
      ExpressionAttributeValues: { ":customerId": customerId },
    })
  );

  return ok({ items: result.Items || [] });
}

/**
 * GET /accounts/{accountId}
 * Get a single account including its balance.
 */
async function get(event) {
  const accountId = event.pathParameters?.accountId;
  if (!accountId) {
    return badRequest("accountId path parameter is required");
  }

  const result = await docClient.send(
    new GetCommand({ TableName: TABLES.accounts, Key: { accountId } })
  );

  if (!result.Item) {
    return notFound(`Account ${accountId} not found`);
  }

  return ok(result.Item);
}

module.exports = {
  create: wrapHandler(create),
  list: wrapHandler(list),
  get: wrapHandler(get),
};
