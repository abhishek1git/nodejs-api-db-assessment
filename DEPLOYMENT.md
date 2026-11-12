# Deploying the Banking API and React console

This walks through deploying:

- **Backend** — Lambda + API Gateway (REST) + DynamoDB, provisioned by Serverless Framework.
- **Frontend** — the React console as a static site on S3 + CloudFront (or Netlify/Vercel).

Everything below assumes you are in the repository root unless a step says otherwise.

| Resource | Name |
|----------|------|
| CloudFormation stack | `banking-api-assessment-prod` |
| Lambda runtime | `nodejs20.x` |
| DynamoDB tables | `banking-api-assessment-prod-Customers`, `banking-api-assessment-prod-Accounts` |
| API base URL | `https://<api-id>.execute-api.<region>.amazonaws.com/prod` |
| Frontend build output | `frontend/dist/` |

Only the `local` and `prod` stages are defined in [`serverless.yml`](serverless.yml). Adding a
new stage means adding an entry under `custom.stageConfig` with its own endpoint and table names.

---

## 0. Prerequisites

1. **AWS account** with permission to create CloudFormation stacks, IAM roles/policies, Lambda
   functions, API Gateway APIs, DynamoDB tables, S3 buckets and CloudWatch log groups.
2. **AWS CLI v2** — not installed on this machine yet:
   - Windows: `winget install -e --id Amazon.AWSCLI`
   - Other platforms: <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
3. **Node.js 18+** and npm (this repo is tested on Node 24).
4. Dependencies installed:

```bash
npm install
npm install --prefix frontend
```

---

## 1. Configure AWS credentials (once)

```bash
aws --version
aws configure          # region: us-east-1, output: json
aws sts get-caller-identity
```

If you use SSO instead, run `aws configure sso` and then `export AWS_PROFILE=<profile-name>`.

> **Never commit credentials.** `.env` is gitignored and none are needed in the repository.
> Serverless and the AWS SDK read the standard credential chain (env vars, shared config/SSO, or
> the Lambda execution role at runtime). If you use a named profile, append
> `--aws-profile <profile-name>` to the Serverless commands below.

---

## 2. Review the production configuration

These commands do not deploy anything:

```bash
npx serverless print --stage prod
npx serverless package --stage prod
```

Confirm that `DYNAMODB_ENDPOINT` is empty (real DynamoDB), the table names are prefixed with
`banking-api-assessment-prod-`, the runtime is `nodejs20.x`, and every HTTP event has
`cors: true`. The package step proves the artifact builds; it excludes `frontend/`, `test/`,
`scripts/`, `graders/` and `dist/`.

---

## 3. Deploy the backend

```bash
npx serverless deploy --stage prod --region us-east-1
```

The first deploy takes a few minutes. It creates:

- both DynamoDB tables (with the `CustomerIdIndex` GSI),
- a scoped IAM role (only `GetItem`, `PutItem`, `UpdateItem`, `Query` on those tables and the GSI),
- all Lambda functions with API Gateway CORS enabled,
- a REST API at stage `prod`.

When it finishes, copy the endpoint from the output:

```
endpoints:
  POST - https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/customers
  ...
```

Save it for the next steps:

```bash
export API_BASE="https://<api-id>.execute-api.us-east-1.amazonaws.com/prod"
```

(PowerShell: `$env:API_BASE = "https://.../prod"`.)

---

## 4. Seed the AWS tables

CloudFormation owns the table lifecycle, so **only seed** — do not run `db:create` or `db:reset`
against AWS, because those scripts delete and recreate tables.

```bash
AWS_REGION=us-east-1 \
DYNAMODB_ENDPOINT=https://dynamodb.us-east-1.amazonaws.com \
CUSTOMERS_TABLE=banking-api-assessment-prod-Customers \
ACCOUNTS_TABLE=banking-api-assessment-prod-Accounts \
npm run db:seed
```

PowerShell equivalent:

```powershell
$env:AWS_REGION="us-east-1"
$env:DYNAMODB_ENDPOINT="https://dynamodb.us-east-1.amazonaws.com"
$env:CUSTOMERS_TABLE="banking-api-assessment-prod-Customers"
$env:ACCOUNTS_TABLE="banking-api-assessment-prod-Accounts"
npm run db:seed
```

The seed is idempotent (fixed IDs, `PutItem`), so it is safe to run again. Adjust the endpoint,
table names and region if you deployed elsewhere.

---

## 5. Verify the deployed backend

```bash
curl -s "$API_BASE/customers/cust_001"
# {"customerId":"cust_001","fullName":"Ada Lovelace",...,"status":"ACTIVE",...}

curl -s "$API_BASE/accounts/acct_001"
curl -s -o /dev/null -w "docs: %{http_code}\n"  "$API_BASE/docs"
curl -s -o /dev/null -w "spec: %{http_code}\n"  "$API_BASE/openapi.yaml"

curl -s -X POST "$API_BASE/customers" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Deploy Test","email":"deploy@example.com"}'
```

Check CORS preflight (the browser will send this before JSON POSTs):

```bash
curl -s -i -X OPTIONS "$API_BASE/customers" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" | head -20
```

Expect a 2xx response with `access-control-allow-origin`. If a request returns 500, read the logs:

```bash
npx serverless logs -f createCustomer --stage prod --tail
```

Swagger UI is available at `$API_BASE/docs`; it loads its assets from a CDN, so the browser needs
internet access. The spec uses a relative server URL, so “Try it out” targets the deployed stage.

---

## 6. Build the frontend for the deployed API

The API base URL is compiled into the bundle at build time through `VITE_API_BASE_URL`.
Leaving it empty keeps the local dev proxy (`/api` → `http://localhost:3000`).

```bash
cd frontend
VITE_API_BASE_URL="$API_BASE" npm run build
```

PowerShell:

```powershell
cd frontend
$env:VITE_API_BASE_URL=$env:API_BASE
npm run build
```

Optional sanity check: `npm run preview` serves the production build at
`http://localhost:4173`, proxying `/api` to a local backend only (the baked absolute URL is used
instead when set).

> Rebuild whenever the API URL changes — Vite inlines the value, so editing it at runtime has no
> effect.

---

## 7. Host the frontend

### Option A — S3 + CloudFront (private bucket, recommended for AWS)

1. **Create a bucket** (e.g. `banking-console-<unique-suffix>`) in the same region. Keep
   *Block all public access* enabled — CloudFront will read it through an Origin Access Control.
2. **Create a CloudFront distribution**:
   - Origin: the S3 bucket; choose **Origin access control settings** and create a new OAC.
   - Viewer protocol policy: **Redirect HTTP to HTTPS**.
   - Default root object: `index.html`.
   - Custom error responses: map **403** and **404** to `/index.html` with response code **200**
     (this is the SPA fallback for client-side routes such as `/tests`).
   - Copy the bucket policy that the CloudFront console offers and apply it to the bucket.
3. **Upload the build**:

```bash
aws s3 sync frontend/dist/ s3://<bucket-name> --delete
```

4. **Invalidate the CDN** so users see the new files:

```bash
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

5. Open `https://<distribution-domain>.cloudfront.net`. Navigate to a sub-page and refresh it to
   confirm the SPA fallback works.

### Option B — Netlify or Vercel

Both work without AWS for the frontend:

- **Netlify**: base directory `frontend`, build command `npm run build`, publish directory `dist`,
  environment variable `VITE_API_BASE_URL=<API_BASE>`. Add a `frontend/public/_redirects` file
  containing `/* /index.html 200`.
- **Vercel**: project root `frontend`, framework preset **Vite**, output `dist`, environment
  variable `VITE_API_BASE_URL=<API_BASE>`. Add `frontend/vercel.json`:

  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```

CORS is already handled by API Gateway, so no proxy is required in production. If you later add a
custom frontend domain, no backend change is needed — the handler allows any origin. Tighten that
(`Access-Control-Allow-Origin`) if the API should only serve specific sites.

---

## 8. End-to-end verification

1. Open the deployed site. The **Dashboard** shows the configured API base and backend status.
2. Go to **Test suite → Run all**. All **54** HTTP cases should pass against the deployed stack.
   The concurrency group creates a few extra customers/accounts; that is expected.
3. Open **Customers**, create one, then fetch it by ID.
4. Check `$API_BASE/docs` for the live contract.

---

## 9. Deploying updates

Backend:

```bash
git pull
npm ci
npx serverless deploy --stage prod --region us-east-1
```

Frontend (after the backend URL is unchanged, `API_BASE` is the same):

```bash
cd frontend
npm ci
VITE_API_BASE_URL="$API_BASE" npm run build
aws s3 sync dist/ s3://<bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

Rollback the backend to a previous deployment:

```bash
npx serverless rollback --stage prod --timestamp <deployment-timestamp>
```

List timestamps with `npx serverless deploy list --stage prod`. For the frontend, enable S3
versioning and re-sync an older build, or redeploy the previous commit.

---

## 10. Cleanup

> This deletes the DynamoDB tables and all data.

```bash
npx serverless remove --stage prod
```

Then empty and delete the frontend bucket (`aws s3 rm s3://<bucket-name> --recursive` followed by
`aws s3 rb s3://<bucket-name>`), and disable/delete the CloudFront distribution in the console.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `AWS provider credentials not found` | Run `aws configure` / SSO, or pass `--aws-profile`. |
| `Cannot parse serverless.yml` | YAML syntax error — run `npx serverless print --stage prod`. |
| API returns 500 | Check `npx serverless logs -f <function> --stage prod`; usually a missing table or wrong region. |
| Browser shows a CORS error | Confirm the `OPTIONS` preflight returns 2xx and the frontend origin is allowed; redeploy so API Gateway picks up `cors: true`. |
| Blank page on refresh of `/tests` | SPA fallback missing — map CloudFront 403/404 to `/index.html` (200), or add the host's rewrite rule. |
| Frontend still calls `localhost:3000` | Rebuild with `VITE_API_BASE_URL` set; the value is baked in at build time. |
| `403 AccessDenied` opening the S3 URL directly | Expected: the bucket is private. Use the CloudFront domain. |
| `EADDRINUSE` when starting offline during tests | Another `serverless offline` is running; stop it or let the e2e harness pick free ports (already configured). |

## Security and cost notes

- The deployed API is **unauthenticated** — this mirrors the assessment brief. Add an authorizer
  (Cognito, JWT, or IAM) before using it for anything real.
- Lambda runs with a least-privilege role limited to the two tables and the GSI.
- DynamoDB tables use on-demand billing; Lambda, API Gateway and CloudFront have free tiers, so a
  demo deployment is inexpensive. Delete the stack when finished.
- No secrets are stored in the repository; `.env` remains gitignored.
- Swagger UI is served from the API and loads its JavaScript/CSS from `unpkg.com`. If your
  environment blocks CDNs, vendor those assets or disable the `/docs` route.
