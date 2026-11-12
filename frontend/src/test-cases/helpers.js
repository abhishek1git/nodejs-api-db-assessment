import { bankingApi } from "../api/banking";
import { assertEqual, assertStatus, fail } from "./assert";

let counter = 0;
const runTag = `${Date.now().toString(36).slice(-4)}${Math.random()
  .toString(36)
  .slice(2, 6)}`;

export function uniqueTag() {
  counter += 1;
  return `${runTag}${counter}`;
}

export function uniqueEmail() {
  return `qa.${uniqueTag()}@example.com`;
}

export async function createCustomer(overrides = {}) {
  const response = await bankingApi.createCustomer({
    fullName: "Frontend QA Customer",
    email: uniqueEmail(),
    ...overrides,
  });
  const customer = assertStatus(response, 201, "setup: POST /customers");
  if (!customer?.customerId) {
    fail("setup: POST /customers returned no customerId", customer, response.status);
  }
  return customer;
}

export async function createAccount(customerId, overrides = {}) {
  const response = await bankingApi.createAccount(customerId, {
    type: "CHECKING",
    currency: "CAD",
    initialBalance: 100,
    ...overrides,
  });
  const account = assertStatus(
    response,
    201,
    `setup: POST /customers/${customerId}/accounts`
  );
  if (!account?.accountId) {
    fail("setup: create account returned no accountId", account, response.status);
  }
  return account;
}

export async function freshAccount(overrides = {}) {
  const customer = await createCustomer();
  return createAccount(customer.customerId, overrides);
}

export async function expectBalance(accountId, expected) {
  const response = await bankingApi.getAccount(accountId);
  const account = assertStatus(response, 200, `GET /accounts/${accountId}`);
  assertEqual(
    account.balance,
    expected,
    `persisted balance of ${accountId}`,
    account
  );
  return account;
}
