# Grader assets

## Postman

Import [`postman/Banking-API.postman_collection.json`](postman/Banking-API.postman_collection.json).

1. Start the API (`npm run setup && npm start`)
2. Run **Core** folder for junior bar
3. Run **Stretch** folder for mid/senior

Assertions expect a completed implementation (not the stock `501` stubs).

## Smoke tests

The automated suites run against an in-memory DynamoDB (`dynalite`) and do not
require Docker:

- `npm test` — everything (handler + HTTP)
- `npm run test:handlers` — Lambda handlers invoked with API Gateway-shaped events
- `npm run test:e2e` — boots `serverless-offline` and calls the API over HTTP

See [`../NOTES.md`](../NOTES.md) for what the suites cover.
