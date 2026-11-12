function show(value) {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function fail(message, evidence, status) {
  const err = new Error(message);
  err.evidence = evidence ?? null;
  if (status !== undefined) err.status = status;
  throw err;
}

export function assert(condition, message, evidence) {
  if (!condition) fail(message, evidence);
}

export function assertStatus(result, expected, context = "") {
  if (result.status !== expected) {
    fail(
      `${context ? `${context}: ` : ""}expected HTTP ${expected}, got ${result.status}`,
      { status: result.status, body: result.data },
      result.status
    );
  }
  return result.data;
}

export function assertEqual(actual, expected, label, evidence) {
  if (actual !== expected) {
    fail(`${label}: expected ${show(expected)}, got ${show(actual)}`, evidence);
  }
}

export function assertDeepEqual(actual, expected, label, evidence) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label}: expected ${show(expected)}, got ${show(actual)}`,
      evidence
    );
  }
}

export function assertTruthy(value, label, evidence) {
  if (!value) fail(`${label} should be truthy, got ${show(value)}`, evidence);
}

export function assertErrorShape(data, errorCode, evidence) {
  assert(data && typeof data === "object", "error body must be a JSON object", evidence);
  assertEqual(data.error, errorCode, "error code", evidence ?? data);
  assert(
    typeof data.message === "string" && data.message.length > 0,
    "error.message must be a non-empty string",
    evidence ?? data
  );
}

export function assertIsoDate(value, label, evidence) {
  const valid =
    typeof value === "string" &&
    value.includes("T") &&
    !Number.isNaN(Date.parse(value));
  assert(valid, `${label} must be an ISO timestamp, got ${show(value)}`, evidence);
}

export function assertCustomerShape(customer, evidence) {
  assert(customer && typeof customer === "object", "customer must be an object", evidence);
  assert(
    typeof customer.customerId === "string" && customer.customerId.startsWith("cust_"),
    "customer.customerId must be a string starting with cust_",
    evidence ?? customer
  );
  assert(
    typeof customer.fullName === "string" && customer.fullName.trim().length > 0,
    "customer.fullName must be a non-empty string",
    evidence ?? customer
  );
  assert(
    typeof customer.email === "string" && customer.email.includes("@"),
    "customer.email must be a valid-looking string",
    evidence ?? customer
  );
  assertEqual(customer.status, "ACTIVE", "customer.status", evidence ?? customer);
  assertIsoDate(customer.createdAt, "customer.createdAt", evidence ?? customer);
}

export function assertAccountShape(account, evidence) {
  assert(account && typeof account === "object", "account must be an object", evidence);
  assert(
    typeof account.accountId === "string" && account.accountId.startsWith("acct_"),
    "account.accountId must be a string starting with acct_",
    evidence ?? account
  );
  assert(
    typeof account.customerId === "string" && account.customerId.startsWith("cust_"),
    "account.customerId must be a string starting with cust_",
    evidence ?? account
  );
  assert(
    account.type === "CHECKING" || account.type === "SAVINGS",
    `account.type must be CHECKING or SAVINGS, got ${show(account.type)}`,
    evidence ?? account
  );
  assert(
    account.currency === "CAD" || account.currency === "USD",
    `account.currency must be CAD or USD, got ${show(account.currency)}`,
    evidence ?? account
  );
  assert(
    typeof account.balance === "number" && Number.isFinite(account.balance),
    "account.balance must be a finite number",
    evidence ?? account
  );
  assertEqual(account.status, "OPEN", "account.status", evidence ?? account);
  assertIsoDate(account.createdAt, "account.createdAt", evidence ?? account);
}
