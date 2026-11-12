import { bankingApi } from "../../api/banking";
import {
  assert,
  assertCustomerShape,
  assertDeepEqual,
  assertEqual,
  assertErrorShape,
  assertStatus,
} from "../assert";
import { uniqueEmail } from "../helpers";

export default {
  id: "customers",
  title: "Customers",
  description:
    "Create and look up customers: happy paths, 404s, validation failures, and malformed request bodies.",
  cases: [
    {
      id: "customers-get-seeded",
      name: "Get seeded customer",
      description: "GET /customers/cust_001 returns 200 with the expected shape.",
      async run() {
        const response = await bankingApi.getCustomer("cust_001");
        const customer = assertStatus(response, 200, "GET /customers/cust_001");
        assertCustomerShape(customer);
        assertEqual(customer.customerId, "cust_001", "customerId", customer);
        return { status: response.status, evidence: customer };
      },
    },
    {
      id: "customers-get-missing",
      name: "Unknown customer returns 404",
      description: "GET /customers/{missing} returns 404 with the { error, message } shape.",
      async run() {
        const response = await bankingApi.getCustomer("cust_does_not_exist");
        const body = assertStatus(response, 404, "GET /customers/cust_does_not_exist");
        assertErrorShape(body, "NOT_FOUND", body);
        assert(
          body.message.includes("cust_does_not_exist"),
          "message should mention the requested id",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "customers-create",
      name: "Create customer returns 201",
      description:
        "POST /customers creates a customer, trims input, and returns status ACTIVE with a timestamp.",
      async run() {
        const email = uniqueEmail();
        const response = await bankingApi.createCustomer({
          fullName: "  Grace Hopper  ",
          email: `  ${email}  `,
        });
        const customer = assertStatus(response, 201, "POST /customers");
        assertCustomerShape(customer);
        assertEqual(customer.fullName, "Grace Hopper", "trimmed fullName", customer);
        assertEqual(customer.email, email, "trimmed email", customer);
        return { status: response.status, evidence: customer };
      },
    },
    {
      id: "customers-roundtrip",
      name: "Created customer can be fetched",
      description: "A customer created through POST is returned unchanged by GET.",
      async run() {
        const createdResponse = await bankingApi.createCustomer({
          fullName: "Ada Roundtrip",
          email: uniqueEmail(),
        });
        const created = assertStatus(createdResponse, 201, "POST /customers");

        const fetchedResponse = await bankingApi.getCustomer(created.customerId);
        const fetched = assertStatus(
          fetchedResponse,
          200,
          `GET /customers/${created.customerId}`
        );
        assertDeepEqual(fetched, created, "stored customer matches the created body", fetched);
        return { status: fetchedResponse.status, evidence: fetched };
      },
    },
    {
      id: "customers-missing-email",
      name: "Missing email returns 400",
      description: "POST /customers without email is rejected.",
      async run() {
        const response = await bankingApi.createCustomer({ fullName: "No Email" });
        const body = assertStatus(response, 400, "POST /customers (missing email)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "email is required", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "customers-missing-fullname",
      name: "Missing fullName returns 400",
      description: "POST /customers without fullName is rejected.",
      async run() {
        const response = await bankingApi.createCustomer({ email: uniqueEmail() });
        const body = assertStatus(response, 400, "POST /customers (missing fullName)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "fullName is required", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "customers-blank-fullname",
      name: "Blank fullName returns 400",
      description: "Whitespace-only names fail the non-empty string check.",
      async run() {
        const response = await bankingApi.createCustomer({
          fullName: "   ",
          email: uniqueEmail(),
        });
        const body = assertStatus(response, 400, "POST /customers (blank fullName)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "fullName must be a non-empty string", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "customers-invalid-email",
      name: "Invalid email returns 400",
      description: "An address without a domain dot fails validation.",
      async run() {
        const response = await bankingApi.createCustomer({
          fullName: "Bad Email",
          email: "not-an-email",
        });
        const body = assertStatus(response, 400, "POST /customers (invalid email)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "email must be a valid email address", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "customers-array-body",
      name: "Non-object JSON body returns 400",
      description: "A JSON array is not accepted where an object is required.",
      async run() {
        const response = await bankingApi.createCustomerRaw("[1,2,3]");
        const body = assertStatus(response, 400, "POST /customers (array body)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "Request body must be a JSON object", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "customers-malformed-json",
      name: "Malformed JSON returns 400",
      description: "Unparseable request bodies are rejected before DynamoDB is touched.",
      async run() {
        const response = await bankingApi.createCustomerRaw('{"fullName": "broken"');
        const body = assertStatus(response, 400, "POST /customers (malformed JSON)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "Request body must be valid JSON", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "customers-empty-body",
      name: "Empty body returns 400",
      description: "POST /customers with no payload is rejected.",
      async run() {
        const response = await bankingApi.createCustomerRaw("");
        const body = assertStatus(response, 400, "POST /customers (empty body)");
        assertErrorShape(body, "BAD_REQUEST", body);
        return { status: response.status, evidence: body };
      },
    },
  ],
};
