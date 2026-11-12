"use strict";

const { after, before, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ACCOUNTS_TABLE, startDynamo } = require("../support/dynamo");
const { apiEvent, invoke } = require("../support/events");

let db;
let accounts;
let customers;

before(async () => {
  db = await startDynamo();
  accounts = require("../../src/handlers/accounts");
  customers = require("../../src/handlers/customers");
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
});

function accountPath(customerId = "cust_001") {
  return { pathParameters: { customerId } };
}

describe("POST /customers/{customerId}/accounts", () => {
  it("creates an account with 201 and defaults initialBalance to 0", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: { type: "CHECKING", currency: "CAD" } })
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.headers["Content-Type"], "application/json");
    assert.match(res.json.accountId, /^acct_/);
    assert.equal(res.json.customerId, "cust_001");
    assert.equal(res.json.type, "CHECKING");
    assert.equal(res.json.currency, "CAD");
    assert.equal(res.json.balance, 0);
    assert.equal(res.json.status, "OPEN");
    assert.ok(!Number.isNaN(Date.parse(res.json.createdAt)), "createdAt is an ISO date");
  });

  it("persists the account in DynamoDB", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: { type: "SAVINGS", currency: "USD" } })
    );

    const stored = await db.doc.send(
      new GetCommand({
        TableName: ACCOUNTS_TABLE,
        Key: { accountId: res.json.accountId },
      })
    );

    assert.deepEqual(stored.Item, res.json);
  });

  it("accepts an explicit initialBalance, including decimals", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({
        ...accountPath(),
        body: { type: "CHECKING", currency: "CAD", initialBalance: 12.34 },
      })
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.json.balance, 12.34);
  });

  it("accepts an initialBalance of exactly 0", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({
        ...accountPath(),
        body: { type: "CHECKING", currency: "CAD", initialBalance: 0 },
      })
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.json.balance, 0);
  });

  it("allows multiple accounts for the same customer", async () => {
    const first = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: { type: "CHECKING", currency: "CAD" } })
    );
    const second = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: { type: "SAVINGS", currency: "CAD" } })
    );

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.notEqual(first.json.accountId, second.json.accountId);

    const list = await invoke(accounts.list, apiEvent(accountPath()));
    assert.equal(list.json.items.length, 4);
  });

  it("returns 404 when the customer does not exist", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({ ...accountPath("cust_missing"), body: { type: "CHECKING", currency: "CAD" } })
    );

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Customer cust_missing not found",
    });
  });

  it("returns 400 when customerId is missing from the path", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({ body: { type: "CHECKING", currency: "CAD" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "customerId path parameter is required");
  });

  it("returns 400 when the body is missing", async () => {
    const res = await invoke(accounts.create, apiEvent(accountPath()));

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "Request body is required");
  });

  it("returns 400 when the body is not a JSON object", async () => {
    const array = await invoke(accounts.create, apiEvent({ ...accountPath(), body: [] }));
    assert.equal(array.statusCode, 400);
    assert.equal(array.json.message, "Request body must be a JSON object");

    const malformed = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: "{not json" })
    );
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json.message, "Request body must be valid JSON");
  });

  it("returns 400 when type is missing", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: { currency: "CAD" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "type is required");
  });

  it("returns 400 for an unsupported account type", async () => {
    for (const type of ["CREDIT", "checking", ""]) {
      const res = await invoke(
        accounts.create,
        apiEvent({ ...accountPath(), body: { type, currency: "CAD" } })
      );
      assert.equal(res.statusCode, 400, `type ${JSON.stringify(type)}`);
      assert.equal(res.json.message, "type must be one of: CHECKING, SAVINGS");
    }
  });

  it("returns 400 when currency is missing", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: { type: "CHECKING" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "currency is required");
  });

  it("returns 400 for an unsupported currency", async () => {
    for (const currency of ["EUR", "cad", ""]) {
      const res = await invoke(
        accounts.create,
        apiEvent({ ...accountPath(), body: { type: "CHECKING", currency } })
      );
      assert.equal(res.statusCode, 400, `currency ${JSON.stringify(currency)}`);
      assert.equal(res.json.message, "currency must be one of: CAD, USD");
    }
  });

  it("returns 400 for a negative initialBalance", async () => {
    const res = await invoke(
      accounts.create,
      apiEvent({
        ...accountPath(),
        body: { type: "CHECKING", currency: "CAD", initialBalance: -0.01 },
      })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "initialBalance must be greater than or equal to 0");
  });

  it("returns 400 when initialBalance is not a finite number", async () => {
    const cases = [
      JSON.stringify({ type: "CHECKING", currency: "CAD", initialBalance: "100" }),
      JSON.stringify({ type: "CHECKING", currency: "CAD", initialBalance: null }),
      '{"type":"CHECKING","currency":"CAD","initialBalance":1e999}',
    ];

    for (const body of cases) {
      const res = await invoke(accounts.create, apiEvent({ ...accountPath(), body }));
      assert.equal(res.statusCode, 400, `body ${body}`);
      assert.equal(res.json.message, "initialBalance must be a number");
    }
  });
});

describe("GET /customers/{customerId}/accounts", () => {
  it("lists the seeded accounts for cust_001", async () => {
    const res = await invoke(accounts.list, apiEvent(accountPath()));

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json.items));
    assert.deepEqual(
      res.json.items.map((item) => item.accountId).sort(),
      ["acct_001", "acct_002"]
    );
  });

  it("lists only accounts belonging to the requested customer", async () => {
    const first = await invoke(accounts.list, apiEvent(accountPath("cust_001")));
    const second = await invoke(accounts.list, apiEvent(accountPath("cust_002")));

    assert.deepEqual(
      second.json.items.map((item) => item.accountId),
      ["acct_003"]
    );
    assert.ok(first.json.items.every((item) => item.customerId === "cust_001"));
    assert.ok(second.json.items.every((item) => item.customerId === "cust_002"));
  });

  it("returns an empty items array for a customer without accounts", async () => {
    const customer = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "Grace Hopper", email: "grace@example.com" } })
    );

    const res = await invoke(
      accounts.list,
      apiEvent(accountPath(customer.json.customerId))
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, { items: [] });
  });

  it("includes accounts created after the customer", async () => {
    const created = await invoke(
      accounts.create,
      apiEvent({ ...accountPath(), body: { type: "SAVINGS", currency: "USD" } })
    );

    const res = await invoke(accounts.list, apiEvent(accountPath()));

    const ids = res.json.items.map((item) => item.accountId);
    assert.ok(ids.includes(created.json.accountId));
    assert.ok(ids.includes("acct_001"));
  });

  it("returns full Account objects in the list", async () => {
    const res = await invoke(accounts.list, apiEvent(accountPath()));
    const account = res.json.items.find((item) => item.accountId === "acct_002");

    assert.deepEqual(account, {
      accountId: "acct_002",
      customerId: "cust_001",
      type: "SAVINGS",
      currency: "CAD",
      balance: 1000,
      status: "OPEN",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns 404 for an unknown customer", async () => {
    const res = await invoke(accounts.list, apiEvent(accountPath("cust_missing")));

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Customer cust_missing not found",
    });
  });

  it("returns 400 when customerId is missing from the path", async () => {
    const res = await invoke(accounts.list, apiEvent());

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "customerId path parameter is required");
  });
});

describe("GET /accounts/{accountId}", () => {
  it("returns a seeded account including its balance", async () => {
    const res = await invoke(
      accounts.get,
      apiEvent({ pathParameters: { accountId: "acct_001" } })
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, {
      accountId: "acct_001",
      customerId: "cust_001",
      type: "CHECKING",
      currency: "CAD",
      balance: 250,
      status: "OPEN",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns accounts with different currencies and balances", async () => {
    const res = await invoke(
      accounts.get,
      apiEvent({ pathParameters: { accountId: "acct_003" } })
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.currency, "USD");
    assert.equal(res.json.balance, 75.5);
  });

  it("returns a newly created account", async () => {
    const created = await invoke(
      accounts.create,
      apiEvent({
        ...accountPath(),
        body: { type: "SAVINGS", currency: "CAD", initialBalance: 99.5 },
      })
    );

    const res = await invoke(
      accounts.get,
      apiEvent({ pathParameters: { accountId: created.json.accountId } })
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, created.json);
  });

  it("returns 404 with the error shape for an unknown account", async () => {
    const res = await invoke(
      accounts.get,
      apiEvent({ pathParameters: { accountId: "acct_missing" } })
    );

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Account acct_missing not found",
    });
  });

  it("returns 400 when accountId is missing from the path", async () => {
    const res = await invoke(accounts.get, apiEvent());

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "accountId path parameter is required");
  });
});
