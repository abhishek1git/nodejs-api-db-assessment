"use strict";

const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { startDynamo } = require("../support/dynamo");
const { startApi } = require("../support/server");

let db;
let api;

before(async () => {
  db = await startDynamo();
  await db.reset();
  api = await startApi();
});

after(async () => {
  if (api) {
    await api.stop();
  }
  if (db) {
    await db.close();
  }
});

async function http(pathname, { method = "GET", body, rawBody, headers } = {}) {
  const options = { method };
  const requestHeaders = { ...headers };
  if (body !== undefined || rawBody !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    options.body = rawBody !== undefined ? rawBody : JSON.stringify(body);
  }
  if (Object.keys(requestHeaders).length > 0) {
    options.headers = requestHeaders;
  }

  const res = await fetch(`${api.baseUrl}${pathname}`, options);
  const text = await res.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // /docs and /openapi.yaml are not JSON.
  }

  return {
    status: res.status,
    headers: res.headers,
    text,
    json,
  };
}

async function createCustomer(overrides = {}) {
  const res = await http("/customers", {
    method: "POST",
    body: { fullName: "Grace Hopper", email: "grace@example.com", ...overrides },
  });
  assert.equal(res.status, 201);
  return res.json;
}

async function createAccount(customerId, body) {
  const res = await http(`/customers/${customerId}/accounts`, {
    method: "POST",
    body: { type: "CHECKING", currency: "CAD", ...body },
  });
  assert.equal(res.status, 201);
  return res.json;
}

describe("service documentation", () => {
  it("serves the Swagger UI", async () => {
    const res = await http("/docs");

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(res.text, /swagger-ui/);
  });

  it("serves the OpenAPI document", async () => {
    const res = await http("/openapi.yaml");

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /yaml/);
    assert.match(res.text, /openapi: 3\.0\.3/);
    assert.match(res.text, /\/customers\/\{customerId\}\/accounts/);
  });
});

describe("core endpoints over HTTP", () => {
  it("returns a seeded customer", async () => {
    // serverless-offline mirrors the request Origin when the event has CORS
    // configured; API Gateway itself returns the handler's "*" header.
    const res = await http("/customers/cust_001", {
      headers: { Origin: "http://localhost:5173" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.customerId, "cust_001");
    assert.equal(res.json.email, "ada@example.com");
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      "http://localhost:5173"
    );
  });

  it("returns 404 for an unknown customer", async () => {
    const res = await http("/customers/does_not_exist");

    assert.equal(res.status, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Customer does_not_exist not found",
    });
  });

  it("creates a customer and reads it back", async () => {
    const created = await createCustomer({
      fullName: "Katherine Johnson",
      email: "katherine@example.com",
    });

    assert.ok(created.customerId);
    const res = await http(`/customers/${created.customerId}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, created);
  });

  it("creates an account, reads it, and lists it for the customer", async () => {
    const customer = await createCustomer();
    const account = await createAccount(customer.customerId, {
      type: "SAVINGS",
      initialBalance: 40,
    });

    assert.equal(account.balance, 40);

    const fetched = await http(`/accounts/${account.accountId}`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.json, account);

    const list = await http(`/customers/${customer.customerId}/accounts`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.items, [account]);
  });

  it("returns 404 when listing accounts for an unknown customer", async () => {
    const res = await http("/customers/does_not_exist/accounts");

    assert.equal(res.status, 404);
    assert.equal(res.json.error, "NOT_FOUND");
  });

  it("returns 404 for an unknown account", async () => {
    const res = await http("/accounts/acct_missing");

    assert.equal(res.status, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Account acct_missing not found",
    });
  });
});

describe("transaction endpoints over HTTP", () => {
  it("deposits, withdraws, and transfers between two accounts", async () => {
    const customer = await createCustomer();
    const source = await createAccount(customer.customerId, { initialBalance: 100 });
    const target = await createAccount(customer.customerId, {
      type: "SAVINGS",
      initialBalance: 0,
    });

    const deposit = await http(`/accounts/${source.accountId}/deposits`, {
      method: "POST",
      body: { amount: 50, currency: "CAD" },
    });
    assert.equal(deposit.status, 200);
    assert.equal(deposit.json.balance, 150);

    const withdrawal = await http(`/accounts/${source.accountId}/withdrawals`, {
      method: "POST",
      body: { amount: 25, currency: "CAD" },
    });
    assert.equal(withdrawal.status, 200);
    assert.equal(withdrawal.json.balance, 125);

    const transfer = await http("/transfers", {
      method: "POST",
      body: {
        fromAccountId: source.accountId,
        toAccountId: target.accountId,
        amount: 25,
        currency: "CAD",
      },
    });
    assert.equal(transfer.status, 200);
    assert.equal(transfer.json.fromAccount.balance, 100);
    assert.equal(transfer.json.toAccount.balance, 25);

    const sourceAfter = await http(`/accounts/${source.accountId}`);
    const targetAfter = await http(`/accounts/${target.accountId}`);
    assert.equal(sourceAfter.json.balance, 100);
    assert.equal(targetAfter.json.balance, 25);
  });

  it("returns 409 when withdrawing more than the balance", async () => {
    const customer = await createCustomer();
    const account = await createAccount(customer.customerId, { initialBalance: 10 });

    const res = await http(`/accounts/${account.accountId}/withdrawals`, {
      method: "POST",
      body: { amount: 11, currency: "CAD" },
    });

    assert.equal(res.status, 409);
    assert.deepEqual(res.json, { error: "CONFLICT", message: "Insufficient funds" });

    const after = await http(`/accounts/${account.accountId}`);
    assert.equal(after.json.balance, 10);
  });

  it("returns 409 when a transfer exceeds the source balance", async () => {
    const customer = await createCustomer();
    const source = await createAccount(customer.customerId, { initialBalance: 5 });
    const target = await createAccount(customer.customerId, { initialBalance: 5 });

    const res = await http("/transfers", {
      method: "POST",
      body: {
        fromAccountId: source.accountId,
        toAccountId: target.accountId,
        amount: 6,
        currency: "CAD",
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.json.error, "CONFLICT");
  });

  it("returns 400 when the currency does not match", async () => {
    const customer = await createCustomer();
    const account = await createAccount(customer.customerId);

    const res = await http(`/accounts/${account.accountId}/deposits`, {
      method: "POST",
      body: { amount: 1, currency: "USD" },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.error, "BAD_REQUEST");
  });
});

describe("request validation over HTTP", () => {
  it("returns 400 for malformed JSON", async () => {
    const res = await http("/customers", { method: "POST", rawBody: "{not json" });

    assert.equal(res.status, 400);
    assert.deepEqual(res.json, {
      error: "BAD_REQUEST",
      message: "Request body must be valid JSON",
    });
  });

  it("returns 400 when a required customer field is missing", async () => {
    const res = await http("/customers", {
      method: "POST",
      body: { fullName: "No Email" },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.message, "email is required");
  });

  it("returns 400 for an invalid account type", async () => {
    const customer = await createCustomer();
    const res = await http(`/customers/${customer.customerId}/accounts`, {
      method: "POST",
      body: { type: "CREDIT", currency: "CAD" },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.message, "type must be one of: CHECKING, SAVINGS");
  });

  it("returns 400 when a transfer targets the same account", async () => {
    const customer = await createCustomer();
    const account = await createAccount(customer.customerId, { initialBalance: 10 });

    const res = await http("/transfers", {
      method: "POST",
      body: {
        fromAccountId: account.accountId,
        toAccountId: account.accountId,
        amount: 1,
        currency: "CAD",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.message, "fromAccountId and toAccountId must be different");
  });
});
