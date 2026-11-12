"use strict";

const dynalite = require("dynalite");
const {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const CUSTOMERS_TABLE = "Customers";
const ACCOUNTS_TABLE = "Accounts";
const SEEDED_AT = "2026-01-01T00:00:00.000Z";

const SEED_CUSTOMERS = [
  {
    customerId: "cust_001",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    status: "ACTIVE",
    createdAt: SEEDED_AT,
  },
  {
    customerId: "cust_002",
    fullName: "Alan Turing",
    email: "alan@example.com",
    status: "ACTIVE",
    createdAt: SEEDED_AT,
  },
];

const SEED_ACCOUNTS = [
  {
    accountId: "acct_001",
    customerId: "cust_001",
    type: "CHECKING",
    currency: "CAD",
    balance: 250,
    status: "OPEN",
    createdAt: SEEDED_AT,
  },
  {
    accountId: "acct_002",
    customerId: "cust_001",
    type: "SAVINGS",
    currency: "CAD",
    balance: 1000,
    status: "OPEN",
    createdAt: SEEDED_AT,
  },
  {
    accountId: "acct_003",
    customerId: "cust_002",
    type: "CHECKING",
    currency: "USD",
    balance: 75.5,
    status: "OPEN",
    createdAt: SEEDED_AT,
  },
];

function listTables(client) {
  return [
    {
      TableName: CUSTOMERS_TABLE,
      AttributeDefinitions: [{ AttributeName: "customerId", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    },
    {
      TableName: ACCOUNTS_TABLE,
      AttributeDefinitions: [
        { AttributeName: "accountId", AttributeType: "S" },
        { AttributeName: "customerId", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "accountId", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "CustomerIdIndex",
          KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    },
  ];
}

/**
 * Starts an isolated in-memory DynamoDB (dynalite) on a random port and points
 * the app's env vars at it. Handlers must be required *after* this resolves.
 */
async function startDynamo() {
  const server = dynalite({ createTableMs: 0, updateTableMs: 0, deleteTableMs: 0 });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}`;

  process.env.DYNAMODB_ENDPOINT = endpoint;
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "local";
  process.env.AWS_SECRET_ACCESS_KEY = "local";
  process.env.CUSTOMERS_TABLE = CUSTOMERS_TABLE;
  process.env.ACCOUNTS_TABLE = ACCOUNTS_TABLE;

  const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  });
  const doc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  async function createTables() {
    for (const definition of listTables(client)) {
      await client.send(new CreateTableCommand(definition));
    }
  }

  async function dropTables() {
    for (const definition of listTables(client)) {
      try {
        await client.send(new DeleteTableCommand({ TableName: definition.TableName }));
      } catch (err) {
        if (err.name !== "ResourceNotFoundException") {
          throw err;
        }
      }
    }
  }

  async function seed() {
    for (const customer of SEED_CUSTOMERS) {
      await doc.send(new PutCommand({ TableName: CUSTOMERS_TABLE, Item: customer }));
    }
    for (const account of SEED_ACCOUNTS) {
      await doc.send(new PutCommand({ TableName: ACCOUNTS_TABLE, Item: account }));
    }
  }

  async function reset() {
    await dropTables();
    await createTables();
    await seed();
  }

  async function close() {
    client.destroy();
    await new Promise((resolve) => server.close(resolve));
  }

  return {
    endpoint,
    client,
    doc,
    createTables,
    dropTables,
    seed,
    reset,
    close,
  };
}

module.exports = {
  ACCOUNTS_TABLE,
  CUSTOMERS_TABLE,
  SEED_ACCOUNTS,
  SEED_CUSTOMERS,
  SEEDED_AT,
  startDynamo,
};
