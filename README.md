# nodejs-api-db-assessment

Take-home template for a Node.js REST API that mimics **API Gateway → Lambda → DynamoDB**.

Candidates implement banking endpoints (customers / accounts / balances) against a provided OpenAPI contract, using DynamoDB Local and serverless-offline.

## Quick start (candidates)

```bash
cp .env.example .env
npm install
npm run setup
npm start
npm test               # no Docker needed; uses an in-memory DynamoDB
```

- API: http://localhost:3000  
- Swagger UI: http://localhost:3000/docs  
- Contract: [`openapi/openapi.yaml`](openapi/openapi.yaml)  
- Instructions: [`ASSESSMENT.md`](ASSESSMENT.md)

## Deployment

[`DEPLOYMENT.md`](DEPLOYMENT.md) walks through deploying the backend to AWS (Lambda + API Gateway
+ DynamoDB via Serverless) and the React console as a static site (S3 + CloudFront, or
Netlify/Vercel). The frontend reads `VITE_API_BASE_URL` at build time; see
[`frontend/.env.example`](frontend/.env.example).

No Docker? Run an in-memory DynamoDB instead:

```bash
npx dynalite --port 8000     # terminal 1
npm run db:reset             # terminal 2: create + seed tables
npm start                    # terminal 2: API on :3000
```

## React console

An optional React + Vite front-end lives in [`frontend/`](frontend/). It exercises every
endpoint and runs the full HTTP test suite (54 cases) from the browser.

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` and `/openapi.yaml` to `http://localhost:3000`, so the API
must be running and seeded first. Pages:

- **Dashboard** — backend probe, seeded fixture reference, setup commands
- **Customers / Accounts / Transactions** — interactive forms with raw responses
- **Test suite** — run all cases, a single group, or one case; shows pass/fail, timings, and evidence

`npm run build` produces a static bundle in `frontend/dist/`.

## Stack

| Concern | Local stand-in |
|---------|----------------|
| API Gateway + Lambda | Serverless Framework + `serverless-offline` |
| DynamoDB | DynamoDB Local via Docker (`docker compose`) |
| SDK | AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`) |

## Project layout

```
openapi/openapi.yaml          API contract (source of truth)
serverless.yml                Function ↔ HTTP route mapping
src/handlers/                 Lambda-style handlers
src/lib/                      DynamoDB client, responses, validation, error wrapper
scripts/                      Create tables, seed data, wait-for-db
test/                         Handler + HTTP tests (node:test + in-memory DynamoDB)
frontend/                     React + Vite console (manual testing + HTTP test suite)
docker-compose.yml            DynamoDB Local
ASSESSMENT.md                 Candidate brief
NOTES.md                      Design decisions and testing notes
```

## Useful commands

| Command | Purpose |
|---------|---------|
| `npm run setup` | Start DB, create tables, seed |
| `npm start` | Run API locally (port 3000) |
| `npm test` | Run all tests (no Docker required) |
| `npm run test:handlers` | Handler tests only |
| `npm run test:e2e` | Serverless-offline HTTP tests only |
| `npm run db:reset` | Recreate tables + reseed |
| `npm run db:down` | Stop DynamoDB Local |

## For assessors

- **Candidate template:** this branch (`501` stubs)
- **Reference solution:** branch `cursor/reference-solution` (full handlers + smoke tests)
- **Grader assets:** [`graders/`](graders/) — Postman collection; smoke script lives on the reference branch

Keep the reference branch / grader materials private; do not share with candidates.
