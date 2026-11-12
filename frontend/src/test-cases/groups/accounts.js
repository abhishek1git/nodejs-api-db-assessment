import { bankingApi } from "../../api/banking";
import {
  assert,
  assertAccountShape,
  assertDeepEqual,
  assertEqual,
  assertErrorShape,
  assertStatus,
} from "../assert";
import { createAccount, createCustomer } from "../helpers";

const VALID_ACCOUNT = { type: "CHECKING", currency: "CAD", initialBalance: 40 };

async function createForNewCustomer(overrides = {}) {
  const customer = await createCustomer();
  const response = await bankingApi.createAccount(customer.customerId, {
    ...VALID_ACCOUNT,
    ...overrides,
  });
  return { customer, response };
}

export default {
  id: "accounts",
  title: "Accounts",
  description:
    "Account creation, lookups, GSI-backed listing per customer, and validation failures.",
  cases: [
    {
      id: "accounts-list-seeded",
      name: "List seeded accounts for cust_001",
      description:
        "GET /customers/cust_001/accounts returns at least acct_001 and acct_002 via the CustomerIdIndex.",
      async run() {
        const response = await bankingApi.listAccounts("cust_001");
        const body = assertStatus(
          response,
          200,
          "GET /customers/cust_001/accounts"
        );
        assert(Array.isArray(body.items), "items must be an array", body);
        assert(body.items.length >= 2, "expected at least two accounts", body);
        body.items.forEach((account) => {
          assertAccountShape(account, body);
          assertEqual(account.customerId, "cust_001", "account.customerId", body);
        });
        const ids = body.items.map((account) => account.accountId);
        return { status: response.status, evidence: { accountIds: ids } };
      },
    },
    {
      id: "accounts-list-missing-customer",
      name: "List for unknown customer returns 404",
      description: "Listing accounts checks that the customer exists first.",
      async run() {
        const response = await bankingApi.listAccounts("cust_does_not_exist");
        const body = assertStatus(response, 404, "GET /customers/cust_does_not_exist/accounts");
        assertErrorShape(body, "NOT_FOUND", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-create",
      name: "Create account returns 201",
      description: "An account is created with the supplied type, currency, and opening balance.",
      async run() {
        const { customer, response } = await createForNewCustomer();
        const account = assertStatus(
          response,
          201,
          `POST /customers/${customer.customerId}/accounts`
        );
        assertAccountShape(account);
        assertEqual(account.customerId, customer.customerId, "account.customerId", account);
        assertEqual(account.type, "CHECKING", "account.type", account);
        assertEqual(account.currency, "CAD", "account.currency", account);
        assertEqual(account.balance, 40, "account.balance", account);
        return { status: response.status, evidence: account };
      },
    },
    {
      id: "accounts-create-default-balance",
      name: "initialBalance defaults to 0",
      description: "Omitting initialBalance creates the account with a zero balance.",
      async run() {
        const { customer, response } = await createForNewCustomer({
          initialBalance: undefined,
        });
        const account = assertStatus(
          response,
          201,
          `POST /customers/${customer.customerId}/accounts`
        );
        assertAccountShape(account);
        assertEqual(account.balance, 0, "default balance", account);
        return { status: response.status, evidence: account };
      },
    },
    {
      id: "accounts-create-missing-customer",
      name: "Create for unknown customer returns 404",
      description: "Accounts cannot be created for a customer that does not exist.",
      async run() {
        const response = await bankingApi.createAccount("cust_missing", VALID_ACCOUNT);
        const body = assertStatus(response, 404, "POST /customers/cust_missing/accounts");
        assertErrorShape(body, "NOT_FOUND", body);
        assert(
          body.message.includes("cust_missing"),
          "message should mention the customer id",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-create-missing-type",
      name: "Missing type returns 400",
      description: "The account type is required.",
      async run() {
        const customer = await createCustomer();
        const response = await bankingApi.createAccount(customer.customerId, {
          currency: "CAD",
          initialBalance: 10,
        });
        const body = assertStatus(response, 400, "POST accounts (missing type)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "type is required", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-create-invalid-type",
      name: "Invalid type returns 400",
      description: "Only CHECKING and SAVINGS are accepted.",
      async run() {
        const customer = await createCustomer();
        const response = await bankingApi.createAccount(customer.customerId, {
          type: "LOAN",
          currency: "CAD",
          initialBalance: 10,
        });
        const body = assertStatus(response, 400, "POST accounts (invalid type)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(
          body.message,
          "type must be one of: CHECKING, SAVINGS",
          "message",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-create-missing-currency",
      name: "Missing currency returns 400",
      description: "The account currency is required.",
      async run() {
        const customer = await createCustomer();
        const response = await bankingApi.createAccount(customer.customerId, {
          type: "CHECKING",
          initialBalance: 10,
        });
        const body = assertStatus(response, 400, "POST accounts (missing currency)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "currency is required", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-create-invalid-currency",
      name: "Invalid currency returns 400",
      description: "Only CAD and USD are accepted.",
      async run() {
        const customer = await createCustomer();
        const response = await bankingApi.createAccount(customer.customerId, {
          type: "CHECKING",
          currency: "EUR",
          initialBalance: 10,
        });
        const body = assertStatus(response, 400, "POST accounts (invalid currency)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "currency must be one of: CAD, USD", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-create-negative-balance",
      name: "Negative initialBalance returns 400",
      description: "Opening balances cannot be negative.",
      async run() {
        const customer = await createCustomer();
        const response = await bankingApi.createAccount(customer.customerId, {
          type: "CHECKING",
          currency: "CAD",
          initialBalance: -5,
        });
        const body = assertStatus(response, 400, "POST accounts (negative balance)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(
          body.message,
          "initialBalance must be greater than or equal to 0",
          "message",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-create-non-numeric-balance",
      name: "Non-numeric initialBalance returns 400",
      description: "A string balance is rejected rather than coerced.",
      async run() {
        const customer = await createCustomer();
        const response = await bankingApi.createAccount(customer.customerId, {
          type: "CHECKING",
          currency: "CAD",
          initialBalance: "100",
        });
        const body = assertStatus(response, 400, "POST accounts (string balance)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "initialBalance must be a number", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-list-contains-created",
      name: "New account appears in its customer's list",
      description: "The GSI query sees the freshly created account.",
      async run() {
        const customer = await createCustomer();
        const created = await createAccount(customer.customerId, {
          type: "SAVINGS",
          currency: "USD",
          initialBalance: 12.5,
        });

        const response = await bankingApi.listAccounts(customer.customerId);
        const body = assertStatus(response, 200, "GET accounts for new customer");
        const ids = (body.items || []).map((account) => account.accountId);
        assert(ids.includes(created.accountId), "created account is missing from the list", body);
        assertEqual(body.items.length, 1, "new customer has exactly one account", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-get",
      name: "Get an account with its balance",
      description: "GET /accounts/{accountId} returns the account including the numeric balance.",
      async run() {
        const customer = await createCustomer();
        const created = await createAccount(customer.customerId, {
          type: "SAVINGS",
          currency: "CAD",
          initialBalance: 87.25,
        });

        const response = await bankingApi.getAccount(created.accountId);
        const account = assertStatus(
          response,
          200,
          `GET /accounts/${created.accountId}`
        );
        assertAccountShape(account);
        assertDeepEqual(account, created, "fetched account matches the created one", account);
        assertEqual(account.balance, 87.25, "balance", account);
        return { status: response.status, evidence: account };
      },
    },
    {
      id: "accounts-get-missing",
      name: "Unknown account returns 404",
      description: "GET /accounts/{missing} returns 404 with the error shape.",
      async run() {
        const response = await bankingApi.getAccount("acct_does_not_exist");
        const body = assertStatus(response, 404, "GET /accounts/acct_does_not_exist");
        assertErrorShape(body, "NOT_FOUND", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "accounts-list-isolates-customers",
      name: "Listing is scoped to one customer",
      description:
        "Two fresh customers with one account each never see each other's accounts (GSI key condition).",
      async run() {
        const first = await createCustomer();
        const second = await createCustomer();
        const firstAccount = await createAccount(first.customerId);
        const secondAccount = await createAccount(second.customerId);

        const firstList = assertStatus(
          await bankingApi.listAccounts(first.customerId),
          200,
          "GET first customer's accounts"
        );
        const secondList = assertStatus(
          await bankingApi.listAccounts(second.customerId),
          200,
          "GET second customer's accounts"
        );

        const firstIds = firstList.items.map((account) => account.accountId);
        const secondIds = secondList.items.map((account) => account.accountId);

        assertEqual(firstList.items.length, 1, "first customer account count", firstList);
        assertEqual(secondList.items.length, 1, "second customer account count", secondList);
        assertEqual(firstIds[0], firstAccount.accountId, "first customer's account", firstList);
        assertEqual(secondIds[0], secondAccount.accountId, "second customer's account", secondList);
        assert(
          !firstIds.includes(secondAccount.accountId),
          "first customer must not see the second customer's account",
          firstList
        );

        return { status: 200, evidence: { firstIds, secondIds } };
      },
    },
  ],
};
