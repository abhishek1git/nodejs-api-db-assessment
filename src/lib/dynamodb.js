"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const region = process.env.AWS_REGION || "us-east-1";

// Unset locally → DynamoDB Local. Set to "" in AWS stages → real DynamoDB
// with the default credential chain (the Lambda execution role).
const endpointVar = process.env.DYNAMODB_ENDPOINT;
const endpoint =
  endpointVar === undefined ? "http://localhost:8000" : endpointVar || undefined;

const isLocalEndpoint =
  typeof endpoint === "string" &&
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(endpoint);

const client = new DynamoDBClient({
  region,
  ...(endpoint ? { endpoint } : {}),
  ...(isLocalEndpoint
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
        },
      }
    : {}),
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLES = {
  customers: process.env.CUSTOMERS_TABLE || "Customers",
  accounts: process.env.ACCOUNTS_TABLE || "Accounts",
};

module.exports = {
  docClient,
  TABLES,
};
