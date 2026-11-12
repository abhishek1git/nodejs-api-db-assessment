"use strict";

const { randomUUID } = require("node:crypto");
const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
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
  isNonEmptyString,
  isPlainObject,
  isValidEmail,
} = require("../lib/validation");

/**
 * POST /customers
 * Create a customer in DynamoDB.
 */
async function create(event) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data;
  if (!isPlainObject(body)) {
    return badRequest("Request body must be a JSON object");
  }
  if (body.fullName === undefined) {
    return badRequest("fullName is required");
  }
  if (!isNonEmptyString(body.fullName)) {
    return badRequest("fullName must be a non-empty string");
  }
  if (body.email === undefined) {
    return badRequest("email is required");
  }
  if (!isNonEmptyString(body.email)) {
    return badRequest("email must be a non-empty string");
  }
  if (!isValidEmail(body.email)) {
    return badRequest("email must be a valid email address");
  }

  const customer = {
    customerId: `cust_${randomUUID()}`,
    fullName: body.fullName.trim(),
    email: body.email.trim(),
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({ TableName: TABLES.customers, Item: customer })
  );

  return created(customer);
}

/**
 * GET /customers/{customerId}
 * Load a customer by id from DynamoDB.
 */
async function get(event) {
  const customerId = event.pathParameters?.customerId;
  if (!customerId) {
    return badRequest("customerId path parameter is required");
  }

  const result = await docClient.send(
    new GetCommand({ TableName: TABLES.customers, Key: { customerId } })
  );

  if (!result.Item) {
    return notFound(`Customer ${customerId} not found`);
  }

  return ok(result.Item);
}

module.exports = {
  create: wrapHandler(create),
  get: wrapHandler(get),
};
