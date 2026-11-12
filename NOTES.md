# Implementation notes

## DynamoDB access patterns

| Operation | Access pattern |
|-----------|----------------|
| Create customer | `PutItem` on `Customers` (PK `customerId`) |
| Get customer | `GetItem` on `Customers` |
| Create account | `GetItem` on `Customers` to verify the owner, then `PutItem` on `Accounts` |
| List accounts | `Query` on the `CustomerIdIndex` GSI (`customerId = :customerId`) — no `Scan` |
| Get account | `GetItem` on `Accounts` |
| Deposit / withdraw / transfer | `UpdateItem` with an atomic balance expression |

Ids are generated with `crypto.randomUUID()` and prefixed (`cust_…`, `acct_…`).

The account list currently reads a single `Query` page. If a customer could ever
own more than 1 MB of account records, the handler should follow
`LastEvaluatedKey`; the seeded data and contract do not require it.

## Balances

Balances are DynamoDB numbers updated with atomic expressions
(`SET balance = balance + :amount`), so:

- arithmetic is decimal-exact (no JavaScript float drift),
- concurrent writers never read-modify-write,
- withdrawals and transfer debits carry
  `ConditionExpression: attribute_exists(accountId) AND balance >= :amount`,
  which makes it impossible to drive a balance negative. A failed condition is
  mapped to `409 Insufficient funds`.

## Transfers and partial failure

The transfer is a two-step saga:

1. Debit the source account with the `balance >= amount` condition (`409` if it fails).
2. Credit the destination account.
3. If the credit fails, credit the source back (compensation) and return `500`.

DynamoDB Local is run without transaction support in this assessment, so
`TransactWriteItems` is not used. The trade-off is:

- **Chosen:** conditional updates + compensation, fully exercised by the test suite
  (`refunds the debit when the credit fails`).
- **Known gap:** compensation itself is best-effort; if it fails the error is
  logged as `CRITICAL` and the money needs reconciliation. On real DynamoDB,
  replace the saga with `TransactWriteItems` (or add an outbox/reconciliation job)
  for atomicity.
- **Known gap:** transfers are not idempotent. A retried HTTP request can move
  funds twice; production would require an `Idempotency-Key` stored alongside
  the transfer.

## Validation

- JSON body errors and validation failures return `400 { error, message }`.
- Enums (`CHECKING|SAVINGS`, `CAD|USD`) are case-sensitive, per the OpenAPI contract.
- `initialBalance` defaults to `0` and must be finite and `>= 0`.
- `amount` must be finite and `> 0`; currency must match the account.
- Emails use a pragmatic `local@domain.tld` check.
- Expected DynamoDB failures surface as `404`/`409`; unexpected ones become
  `500 INTERNAL_SERVER_ERROR` via a shared wrapper.

## Testing

`npm test` runs the whole suite **without Docker**. Tests use
[`dynalite`](https://www.npmjs.com/package/dynalite), an in-memory
DynamoDB-compatible server, so they also work on machines where Docker is not
available.

| Command | What it runs |
|---------|--------------|
| `npm test` | Everything (102 tests) |
| `npm run test:handlers` | 86 handler tests with API Gateway-shaped events |
| `npm run test:e2e` | 16 tests that boot `serverless-offline` and call the API over HTTP |

Coverage includes every endpoint's happy path plus: missing/malformed bodies,
missing and mistyped fields, invalid enums, negative balances, currency
mismatches, unknown customers/accounts, insufficient funds (including the exact
balance boundary and repeated withdrawals), decimal arithmetic, base64 bodies,
GSI listing isolation, transfer compensation, and concurrent withdrawals /
transfers proving the conditional debits cannot overdraw an account.
