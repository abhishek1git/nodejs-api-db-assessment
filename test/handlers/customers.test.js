"use strict";

const { after, before, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { CUSTOMERS_TABLE, startDynamo } = require("../support/dynamo");
const { apiEvent, invoke } = require("../support/events");

let db;
let customers;

before(async () => {
  db = await startDynamo();
  // Required only after the harness has pointed the app at the in-memory DB.
  customers = require("../../src/handlers/customers");
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
});

describe("POST /customers", () => {
  it("creates a customer and returns 201 with the Customer shape", async () => {
    const res = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "Grace Hopper", email: "grace@example.com" } })
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.headers["Content-Type"], "application/json");
    assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
    assert.equal(typeof res.json.customerId, "string");
    assert.match(res.json.customerId, /^cust_/);
    assert.equal(res.json.fullName, "Grace Hopper");
    assert.equal(res.json.email, "grace@example.com");
    assert.equal(res.json.status, "ACTIVE");
    assert.ok(!Number.isNaN(Date.parse(res.json.createdAt)), "createdAt is an ISO date");
  });

  it("persists the customer in DynamoDB", async () => {
    const res = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "Grace Hopper", email: "grace@example.com" } })
    );

    const stored = await db.doc.send(
      new GetCommand({
        TableName: CUSTOMERS_TABLE,
        Key: { customerId: res.json.customerId },
      })
    );

    assert.deepEqual(stored.Item, res.json);
  });

  it("generates a unique customerId per request", async () => {
    const first = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "Grace Hopper", email: "grace@example.com" } })
    );
    const second = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "Katherine Johnson", email: "katherine@example.com" } })
    );

    assert.notEqual(first.json.customerId, second.json.customerId);
  });

  it("trims surrounding whitespace from fullName and email", async () => {
    const res = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "  Grace Hopper  ", email: "  grace@example.com  " } })
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.json.fullName, "Grace Hopper");
    assert.equal(res.json.email, "grace@example.com");
  });

  it("accepts a base64-encoded body", async () => {
    const raw = JSON.stringify({ fullName: "Grace Hopper", email: "grace@example.com" });
    const res = await invoke(
      customers.create,
      apiEvent({ body: Buffer.from(raw).toString("base64"), isBase64Encoded: true })
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.json.email, "grace@example.com");
  });

  it("returns 400 when the body is missing", async () => {
    const res = await invoke(customers.create, apiEvent());

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json, {
      error: "BAD_REQUEST",
      message: "Request body is required",
    });
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await invoke(customers.create, apiEvent({ body: "{not json" }));

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error, "BAD_REQUEST");
    assert.equal(res.json.message, "Request body must be valid JSON");
  });

  it("returns 400 when the body is a JSON array", async () => {
    const res = await invoke(customers.create, apiEvent({ body: [] }));

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "Request body must be a JSON object");
  });

  it("returns 400 when the body is JSON null", async () => {
    const res = await invoke(customers.create, apiEvent({ body: "null" }));

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "Request body must be a JSON object");
  });

  it("returns 400 when fullName is missing", async () => {
    const res = await invoke(
      customers.create,
      apiEvent({ body: { email: "no-name@example.com" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "fullName is required");
  });

  it("returns 400 when fullName is empty or whitespace", async () => {
    for (const fullName of ["", "   "]) {
      const res = await invoke(
        customers.create,
        apiEvent({ body: { fullName, email: "grace@example.com" } })
      );
      assert.equal(res.statusCode, 400, `fullName ${JSON.stringify(fullName)}`);
      assert.equal(res.json.message, "fullName must be a non-empty string");
    }
  });

  it("returns 400 when fullName is not a string", async () => {
    const res = await invoke(
      customers.create,
      apiEvent({ body: { fullName: 42, email: "grace@example.com" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "fullName must be a non-empty string");
  });

  it("returns 400 when email is missing", async () => {
    const res = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "No Email" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "email is required");
  });

  it("returns 400 when email is empty", async () => {
    const res = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "Grace Hopper", email: "" } })
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.json.message, "email must be a non-empty string");
  });

  it("returns 400 for malformed email addresses", async () => {
    for (const email of ["not-an-email", "grace@", "@example.com", "grace@example", "gra ce@example.com"]) {
      const res = await invoke(
        customers.create,
        apiEvent({ body: { fullName: "Grace Hopper", email } })
      );
      assert.equal(res.statusCode, 400, `email ${JSON.stringify(email)}`);
      assert.equal(res.json.message, "email must be a valid email address");
    }
  });
});

describe("GET /customers/{customerId}", () => {
  it("returns a seeded customer with 200", async () => {
    const res = await invoke(
      customers.get,
      apiEvent({ pathParameters: { customerId: "cust_001" } })
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, {
      customerId: "cust_001",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns a newly created customer", async () => {
    const created = await invoke(
      customers.create,
      apiEvent({ body: { fullName: "Grace Hopper", email: "grace@example.com" } })
    );

    const res = await invoke(
      customers.get,
      apiEvent({ pathParameters: { customerId: created.json.customerId } })
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, created.json);
  });

  it("returns 404 with the error shape for an unknown customer", async () => {
    const res = await invoke(
      customers.get,
      apiEvent({ pathParameters: { customerId: "does_not_exist" } })
    );

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, {
      error: "NOT_FOUND",
      message: "Customer does_not_exist not found",
    });
  });

  it("returns 400 when customerId is missing from the path", async () => {
    const res = await invoke(customers.get, apiEvent());

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json, {
      error: "BAD_REQUEST",
      message: "customerId path parameter is required",
    });
  });
});
