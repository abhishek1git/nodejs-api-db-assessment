import { bankingApi } from "../../api/banking";
import {
  assert,
  assertAccountShape,
  assertCustomerShape,
  assertEqual,
  assertStatus,
} from "../assert";

const REQUIRED_PATHS = [
  "/customers",
  "/customers/{customerId}",
  "/customers/{customerId}/accounts",
  "/accounts/{accountId}",
  "/accounts/{accountId}/deposits",
  "/accounts/{accountId}/withdrawals",
  "/transfers",
];

export default {
  id: "service",
  title: "Service contract",
  description:
    "Checks that the API is reachable through the Vite proxy, serves its OpenAPI document, and has the seeded data.",
  cases: [
    {
      id: "service-openapi",
      name: "GET /openapi.yaml is served",
      description: "The OpenAPI document responds with 200 and YAML content.",
      async run() {
        const response = await bankingApi.getOpenApi();
        assertStatus(response, 200, "GET /openapi.yaml");
        const text = response.text || "";
        assert(
          text.includes("openapi:"),
          "response does not look like an OpenAPI document",
          text.slice(0, 400)
        );
        return { status: response.status, evidence: text.slice(0, 400) };
      },
    },
    {
      id: "service-documented-paths",
      name: "OpenAPI documents every endpoint",
      description:
        "All seven paths (three core resources, three transaction routes, transfers) are declared in the spec.",
      async run() {
        const response = await bankingApi.getOpenApi();
        assertStatus(response, 200, "GET /openapi.yaml");
        const text = response.text || "";
        const missing = REQUIRED_PATHS.filter((path) => !text.includes(path));
        assert(
          missing.length === 0,
          `spec is missing paths: ${missing.join(", ")}`,
          missing
        );
        return {
          status: response.status,
          evidence: { documentedPaths: REQUIRED_PATHS },
        };
      },
    },
    {
      id: "service-seed-data",
      name: "Seeded customer and accounts are present",
      description:
        "cust_001 exists and the CustomerIdIndex query returns its seeded accounts (acct_001, acct_002).",
      async run() {
        const customerResponse = await bankingApi.getCustomer("cust_001");
        const customer = assertStatus(customerResponse, 200, "GET /customers/cust_001");
        assertCustomerShape(customer);

        const accountsResponse = await bankingApi.listAccounts("cust_001");
        const body = assertStatus(
          accountsResponse,
          200,
          "GET /customers/cust_001/accounts"
        );
        assert(Array.isArray(body.items), "list response must contain an items array", body);
        assert(body.items.length >= 2, "expected at least two seeded accounts", body);
        body.items.forEach((account) => {
          assertAccountShape(account, body);
          assertEqual(
            account.customerId,
            "cust_001",
            "every listed account belongs to cust_001",
            body
          );
        });
        const ids = body.items.map((account) => account.accountId);
        assert(ids.includes("acct_001"), "acct_001 should be listed", ids);
        assert(ids.includes("acct_002"), "acct_002 should be listed", ids);

        return {
          status: accountsResponse.status,
          evidence: { customerId: customer.customerId, accountIds: ids },
        };
      },
    },
  ],
};
