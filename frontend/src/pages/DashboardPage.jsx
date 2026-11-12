import { useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { bankingApi } from "../api/banking";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import Pill from "../components/Pill";
import useAsyncAction from "../hooks/useAsyncAction";
import { allTestCases, testGroups } from "../test-cases";

const SETUP_COMMANDS = `# Option A — Docker
npm run setup

# Option B — no Docker, in-memory DynamoDB
npx dynalite --port 8000        # terminal 1
npm run db:reset                # terminal 2 (create + seed tables)
npm start                       # terminal 2 (API on :3000)

# Then the UI
cd frontend && npm run dev      # http://localhost:5173`;

export default function DashboardPage() {
  const probe = useAsyncAction();
  const runProbe = probe.run;

  const probeBackend = useCallback(
    () =>
      runProbe(async () => {
        const [customerResponse, accountsResponse] = await Promise.all([
          bankingApi.getCustomer("cust_001"),
          bankingApi.listAccounts("cust_001"),
        ]);
        if (customerResponse.status !== 200) {
          throw new Error(
            `GET /customers/cust_001 returned HTTP ${customerResponse.status}. Is the database seeded?`
          );
        }
        if (accountsResponse.status !== 200) {
          throw new Error(
            `GET /customers/cust_001/accounts returned HTTP ${accountsResponse.status}.`
          );
        }
        return {
          customer: customerResponse.data,
          accounts: accountsResponse.data.items ?? [],
        };
      }),
    [runProbe]
  );

  useEffect(() => {
    probeBackend();
  }, [probeBackend]);
  const probeResult = probe.result;

  return (
    <>
      <PageHeader
        title="Banking API Console"
        subtitle="React front-end for the Node.js / DynamoDB assessment. Exercise every endpoint by hand, or run the full HTTP test suite in one click."
        actions={
          <>
            <button type="button" className="button" onClick={() => probe.reset()} disabled={probe.busy}>
              Clear
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={probeBackend}
              disabled={probe.busy}
            >
              {probe.busy ? "Checking…" : "Re-check API"}
            </button>
          </>
        }
      />

      <Card
        title="Backend status"
        subtitle="Probes the API through the Vite proxy at /api (rewritten to http://localhost:3000)."
        actions={
          probe.busy ? (
            <Pill tone="info">Checking</Pill>
          ) : probe.error ? (
            <Pill tone="danger">Offline</Pill>
          ) : probeResult ? (
            <Pill tone="success">Connected</Pill>
          ) : (
            <Pill>Unknown</Pill>
          )
        }
      >
        {probe.busy && (
          <p className="inline-status">
            <span className="spinner" aria-hidden="true" /> Contacting the API…
          </p>
        )}

        {probe.error && (
          <>
            <div className="alert alert-danger">{probe.error}</div>
            <p className="muted">
              Start the backend first, then reload this page. The API must be listening on port
              3000 and DynamoDB Local (or dynalite) on port 8000 with seeded tables.
            </p>
            <pre className="command-block">{SETUP_COMMANDS}</pre>
          </>
        )}

        {probeResult && (
          <div className="status-detail">
            <p className="alert alert-success">
              API reachable — cust_001 resolved with {probeResult.accounts.length} account
              {probeResult.accounts.length === 1 ? "" : "s"}.
            </p>
            <dl className="detail-list">
              <div>
                <dt>Customer</dt>
                <dd>
                  {probeResult.customer.fullName} <code>{probeResult.customer.customerId}</code>
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{probeResult.customer.email}</dd>
              </div>
              <div>
                <dt>Accounts</dt>
                <dd>
                  {probeResult.accounts.map((account) => (
                    <code key={account.accountId} className="code-chip">
                      {account.accountId} · {account.currency} {account.balance.toFixed(2)}
                    </code>
                  ))}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Card>

      <div className="grid three-columns">
        <Link to="/customers" className="link-card">
          <h2>Customers</h2>
          <p>Create customers and fetch them by id; see 400 and 404 bodies live.</p>
          <span className="link-card-cta">Open customers →</span>
        </Link>
        <Link to="/accounts" className="link-card">
          <h2>Accounts</h2>
          <p>Open accounts, query a customer's accounts, and inspect balances.</p>
          <span className="link-card-cta">Open accounts →</span>
        </Link>
        <Link to="/transactions" className="link-card">
          <h2>Transactions</h2>
          <p>Deposit, withdraw, and transfer funds with real atomic updates.</p>
          <span className="link-card-cta">Open transactions →</span>
        </Link>
      </div>

      <Card
        title="Seeded fixtures"
        subtitle="The seed script creates these so the core endpoints have data on a fresh database."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Owner</th>
                <th>Type</th>
                <th>Currency</th>
                <th className="align-right">Seeded balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>cust_001</code></td>
                <td>Ada Lovelace</td>
                <td>—</td>
                <td>—</td>
                <td className="align-right">—</td>
              </tr>
              <tr>
                <td><code>acct_001</code></td>
                <td>cust_001</td>
                <td>CHECKING</td>
                <td>CAD</td>
                <td className="align-right">250.00</td>
              </tr>
              <tr>
                <td><code>acct_002</code></td>
                <td>cust_001</td>
                <td>SAVINGS</td>
                <td>CAD</td>
                <td className="align-right">1000.00</td>
              </tr>
              <tr>
                <td><code>cust_002</code></td>
                <td>Alan Turing</td>
                <td>—</td>
                <td>—</td>
                <td className="align-right">—</td>
              </tr>
              <tr>
                <td><code>acct_003</code></td>
                <td>cust_002</td>
                <td>CHECKING</td>
                <td>USD</td>
                <td className="align-right">75.50</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">
          Re-seed at any time with <code>npm run db:reset</code>. Manual transactions mutate these
          balances; the test suite avoids them by creating fresh customers and accounts.
        </p>
      </Card>

      <Card
        title="Test suite"
        subtitle={`${allTestCases.length} HTTP cases across ${testGroups.length} groups — service contract, customers, accounts, transactions, and concurrency.`}
        actions={
          <Link to="/tests" className="button button-primary">
            Open test suite
          </Link>
        }
      >
        <ul className="group-list">
          {testGroups.map((group) => (
            <li key={group.id}>
              <span>{group.title}</span>
              <span className="muted">{group.cases.length} cases</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
