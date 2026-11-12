"use strict";

const { after, before, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ACCOUNTS_TABLE, startDynamo } = require("../support/dynamo");
const { apiEvent, invoke } = require("../support/events");

let db;
let transactions;
let accounts;
let docClient;

before(async () => {
  db = await startDynamo();
  transactions = require("../../src/handlers/transactions");
  accounts = require("../../src/handlers/accounts");
  docClient = require("../../src/lib/dynamodb").docClient;
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
});

async function getStoredAccount(accountId) {
  const res = await db.doc.send(
    new GetCommand({ TableName: ACCOUNTS_TABLE, Key: { accountId } })
  );
  return res.Item;
}

function accountPath(accountId = "acct_001") {
  return { pathParameters: { accountId } };
}

describe("POST /accounts/{accountId}/deposits", () => {
  it("credits the account and returns the updated Account with 200", async () => {
    const res = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 10, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Content-Type"], "application/json");
    assert.equal(res.json.accountId, "acct_001");
    assert.equal(res.json.balance, 260);
    assert.equal(res.json.currency, "CAD");
    assert.equal(res.json.status, "OPEN");
  });

  it("persists the new balance", async () => {
    await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 10, currency: "CAD" } })
    );

    const stored = await getStoredAccount("acct_001");
    assert.equal(stored.balance, 260);
  });

  it("accumulates multiple deposits", async () => {
    await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 10, currency: "CAD" } })
    );
    const res = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 2.5, currency: "CAD" } })
    );

    assert.equal(res.json.balance, 262.5);
  });

  it("keeps decimal arithmetic exact", async () => {
    await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 0.1, currency: "CAD" } })
    );
    const res = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 0.2, currency: "CAD" } })
    );

    assert.equal(res.json.balance, 250.3);
  });

  it("only affects the targeted account", async () => {
    await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 10, currency: "CAD" } })
    );

    const untouched = await getStoredAccount("acct_002");
    assert.equal(untouched.balance, 1000);
  });

  it("supports USD accounts", async () => {
    const res = await invoke(
      transactions.deposit,
      apiEvent({
        pathParameters: { accountId: "acct_003" },
        body: { amount: 24.5, currency: "USD" },
      })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.balance, 100);
  });

  it("returns 404 for an unknown account", async () => {
    const res = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath("acct_missing"), body: { amount: 10, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Account acct_missing not found",
    });
  });

  it("returns 400 when the currency does not match the account", async () => {
    const res = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 10, currency: "USD" } })
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json, {
      error: "BAD_REQUEST",
      message: "currency USD does not match account currency CAD",
    });
  });

  it("returns 400 for invalid amounts", async () => {
    const cases = [
      [{ currency: "CAD" }, "amount is required"],
      [{ amount: 0, currency: "CAD" }, "amount must be a number greater than 0"],
      [{ amount: -5, currency: "CAD" }, "amount must be a number greater than 0"],
      [{ amount: "10", currency: "CAD" }, "amount must be a number greater than 0"],
      [{ amount: null, currency: "CAD" }, "amount must be a number greater than 0"],
    ];

    for (const [body, message] of cases) {
      const res = await invoke(transactions.deposit, apiEvent({ ...accountPath(), body }));
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal(res.json.message, message);
    }
  });

  it("returns 400 for missing or invalid currency", async () => {
    const missing = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 10 } })
    );
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json.message, "currency is required");

    const invalid = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: { amount: 10, currency: "EUR" } })
    );
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json.message, "currency must be one of: CAD, USD");
  });

  it("returns 400 when the body is missing or not an object", async () => {
    const missing = await invoke(transactions.deposit, apiEvent(accountPath()));
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json.message, "Request body is required");

    const array = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: [] })
    );
    assert.equal(array.statusCode, 400);
    assert.equal(array.json.message, "Request body must be a JSON object");

    const malformed = await invoke(
      transactions.deposit,
      apiEvent({ ...accountPath(), body: "{not json" })
    );
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json.message, "Request body must be valid JSON");
  });

  it("returns 400 when accountId is missing from the path", async () => {
    const res = await invoke(
      transactions.deposit,
      apiEvent({ body: { amount: 10, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "accountId path parameter is required");
  });
});

describe("POST /accounts/{accountId}/withdrawals", () => {
  it("debits the account and returns the updated Account with 200", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 25, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.balance, 225);
    assert.equal((await getStoredAccount("acct_001")).balance, 225);
  });

  it("allows withdrawing the entire balance", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 250, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.balance, 0);
  });

  it("returns 409 and keeps the balance when funds are insufficient", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 250.01, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json, { error: "CONFLICT", message: "Insufficient funds" });
    assert.equal((await getStoredAccount("acct_001")).balance, 250);
  });

  it("rejects a huge overdraft with 409", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 999999, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 409);
  });

  it("cannot drive the balance negative across sequential withdrawals", async () => {
    const first = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 200, currency: "CAD" } })
    );
    const second = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 60, currency: "CAD" } })
    );

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 409);
    assert.equal((await getStoredAccount("acct_001")).balance, 50);
  });

  it("prevents overdrafts under concurrent withdrawals", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        invoke(
          transactions.withdraw,
          apiEvent({ ...accountPath(), body: { amount: 50, currency: "CAD" } })
        )
      )
    );

    const successes = results.filter((res) => res.statusCode === 200);
    const conflicts = results.filter((res) => res.statusCode === 409);

    assert.equal(successes.length, 5, "only five 50-unit withdrawals fit in 250");
    assert.equal(conflicts.length, 5);
    assert.equal((await getStoredAccount("acct_001")).balance, 0);
  });

  it("supports withdrawals from USD accounts", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({
        pathParameters: { accountId: "acct_003" },
        body: { amount: 25.5, currency: "USD" },
      })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.balance, 50);
  });

  it("returns 404 for an unknown account", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath("acct_missing"), body: { amount: 1, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.json.error, "NOT_FOUND");
  });

  it("returns 400 when the currency does not match the account", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 1, currency: "USD" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "currency USD does not match account currency CAD");
  });

  it("returns 400 for invalid amounts", async () => {
    for (const amount of [0, -1, "5", null]) {
      const res = await invoke(
        transactions.withdraw,
        apiEvent({ ...accountPath(), body: { amount, currency: "CAD" } })
      );
      assert.equal(res.statusCode, 400, `amount ${JSON.stringify(amount)}`);
      assert.equal(res.json.message, "amount must be a number greater than 0");
    }
  });

  it("returns 400 when currency is missing or invalid", async () => {
    const missing = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 5 } })
    );
    assert.equal(missing.json.message, "currency is required");

    const invalid = await invoke(
      transactions.withdraw,
      apiEvent({ ...accountPath(), body: { amount: 5, currency: "GBP" } })
    );
    assert.equal(invalid.json.message, "currency must be one of: CAD, USD");
  });

  it("returns 400 when accountId is missing from the path", async () => {
    const res = await invoke(
      transactions.withdraw,
      apiEvent({ body: { amount: 5, currency: "CAD" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "accountId path parameter is required");
  });
});

describe("POST /transfers", () => {
  function transferBody(overrides = {}) {
    return {
      fromAccountId: "acct_001",
      toAccountId: "acct_002",
      amount: 10,
      currency: "CAD",
      ...overrides,
    };
  }

  it("moves funds and returns both updated accounts with 200", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody() })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.fromAccount.accountId, "acct_001");
    assert.equal(res.json.fromAccount.balance, 240);
    assert.equal(res.json.toAccount.accountId, "acct_002");
    assert.equal(res.json.toAccount.balance, 1010);
  });

  it("persists both balances", async () => {
    await invoke(transactions.transfer, apiEvent({ body: transferBody() }));

    assert.equal((await getStoredAccount("acct_001")).balance, 240);
    assert.equal((await getStoredAccount("acct_002")).balance, 1010);
  });

  it("returns complete Account objects for both sides", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody() })
    );

    for (const account of [res.json.fromAccount, res.json.toAccount]) {
      assert.equal(typeof account.accountId, "string");
      assert.equal(typeof account.customerId, "string");
      assert.ok(["CHECKING", "SAVINGS"].includes(account.type));
      assert.equal(account.currency, "CAD");
      assert.equal(typeof account.balance, "number");
      assert.equal(account.status, "OPEN");
      assert.ok(!Number.isNaN(Date.parse(account.createdAt)));
    }
  });

  it("allows transferring the entire balance", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody({ amount: 250 }) })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.fromAccount.balance, 0);
    assert.equal(res.json.toAccount.balance, 1250);
  });

  it("handles decimal amounts exactly", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody({ amount: 0.1 }) })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.fromAccount.balance, 249.9);
    assert.equal(res.json.toAccount.balance, 1000.1);
  });

  it("works between accounts that belong to different customers when currencies match", async () => {
    const created = await invoke(
      accounts.create,
      apiEvent({
        pathParameters: { customerId: "cust_001" },
        body: { type: "CHECKING", currency: "USD", initialBalance: 5 },
      })
    );

    const res = await invoke(
      transactions.transfer,
      apiEvent({
        body: {
          fromAccountId: "acct_003",
          toAccountId: created.json.accountId,
          amount: 20,
          currency: "USD",
        },
      })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.fromAccount.balance, 55.5);
    assert.equal(res.json.toAccount.balance, 25);
    assert.equal(res.json.toAccount.customerId, "cust_001");
  });

  it("returns 400 when transferring to the same account", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody({ toAccountId: "acct_001" }) })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "fromAccountId and toAccountId must be different");
  });

  it("returns 404 when the source account does not exist", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody({ fromAccountId: "acct_missing" }) })
    );

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Account acct_missing not found",
    });
  });

  it("returns 404 when the destination account does not exist", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody({ toAccountId: "acct_missing" }) })
    );

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Account acct_missing not found",
    });
  });

  it("returns 400 when the two accounts use different currencies", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({
        body: transferBody({ toAccountId: "acct_003", currency: "CAD" }),
      })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "Accounts must have the same currency");
  });

  it("returns 400 when the request currency does not match the accounts", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody({ currency: "USD" }) })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "currency USD does not match account currency CAD");
  });

  it("returns 409 and moves no money when funds are insufficient", async () => {
    const res = await invoke(
      transactions.transfer,
      apiEvent({ body: transferBody({ amount: 250.01 }) })
    );

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json, { error: "CONFLICT", message: "Insufficient funds" });
    assert.equal((await getStoredAccount("acct_001")).balance, 250);
    assert.equal((await getStoredAccount("acct_002")).balance, 1000);
  });

  it("returns 400 for missing required fields", async () => {
    const cases = [
      [{ fromAccountId: undefined }, "fromAccountId is required"],
      [{ toAccountId: undefined }, "toAccountId is required"],
      [{ amount: undefined }, "amount is required"],
      [{ currency: undefined }, "currency is required"],
      [{ amount: 0 }, "amount must be a number greater than 0"],
      [{ amount: -1 }, "amount must be a number greater than 0"],
      [{ currency: "EUR" }, "currency must be one of: CAD, USD"],
    ];

    for (const [overrides, message] of cases) {
      const body = transferBody(overrides);
      const res = await invoke(transactions.transfer, apiEvent({ body }));
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal(res.json.message, message);
    }
  });

  it("returns 400 when the body is missing or not an object", async () => {
    const missing = await invoke(transactions.transfer, apiEvent());
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json.message, "Request body is required");

    const array = await invoke(transactions.transfer, apiEvent({ body: [] }));
    assert.equal(array.statusCode, 400);
    assert.equal(array.json.message, "Request body must be a JSON object");

    const malformed = await invoke(
      transactions.transfer,
      apiEvent({ body: "{not json" })
    );
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json.message, "Request body must be valid JSON");
  });

  it("allows only one of two concurrent full-balance transfers", async () => {
    const body = transferBody({ amount: 250 });
    const results = await Promise.all([
      invoke(transactions.transfer, apiEvent({ body })),
      invoke(transactions.transfer, apiEvent({ body })),
    ]);

    assert.deepEqual(
      results.map((res) => res.statusCode).sort(),
      [200, 409],
      "the conditional debit must let exactly one transfer through"
    );

    const from = await getStoredAccount("acct_001");
    const to = await getStoredAccount("acct_002");
    assert.equal(from.balance, 0);
    assert.equal(to.balance, 1250);
    assert.equal(from.balance + to.balance, 1250, "no money created or destroyed");
  });

  it("refunds the debit when the credit fails (compensation)", async () => {
    const originalSend = docClient.send.bind(docClient);
    const originalConsoleError = console.error;
    console.error = () => {};

    docClient.send = async (command) => {
      const input = command.input || {};
      if (
        input.UpdateExpression === "SET balance = balance + :amount" &&
        input.Key?.accountId === "acct_002"
      ) {
        throw new Error("simulated DynamoDB failure on credit");
      }
      return originalSend(command);
    };

    try {
      const res = await invoke(transactions.transfer, apiEvent({ body: transferBody() }));

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.json, {
        error: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error",
      });
      assert.equal((await getStoredAccount("acct_001")).balance, 250, "debit was refunded");
      assert.equal((await getStoredAccount("acct_002")).balance, 1000, "destination untouched");
    } finally {
      docClient.send = originalSend;
      console.error = originalConsoleError;
    }
  });
});
