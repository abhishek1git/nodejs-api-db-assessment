import { useState } from "react";
import { bankingApi } from "../api/banking";
import ApiResult from "../components/ApiResult";
import Card from "../components/Card";
import Field from "../components/Field";
import JsonBlock from "../components/JsonBlock";
import PageHeader from "../components/PageHeader";
import Pill from "../components/Pill";
import useAsyncAction from "../hooks/useAsyncAction";

const TYPES = ["CHECKING", "SAVINGS"];
const CURRENCIES = ["CAD", "USD"];

function statusTone(status) {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "warning";
  return "danger";
}

export default function AccountsPage() {
  const [createForm, setCreateForm] = useState({
    customerId: "cust_001",
    type: "CHECKING",
    currency: "CAD",
    initialBalance: "40",
  });
  const [listId, setListId] = useState("cust_001");
  const [lookupId, setLookupId] = useState("acct_001");
  const [lastCreated, setLastCreated] = useState(null);

  const createAction = useAsyncAction();
  const listAction = useAsyncAction();
  const lookupAction = useAsyncAction();

  function update(field) {
    return (event) => setCreateForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    const { customerId, type, currency, initialBalance } = createForm;
    const result = await createAction.run(() =>
      bankingApi.createAccount(customerId.trim(), {
        type,
        currency,
        initialBalance: initialBalance.trim() === "" ? undefined : Number(initialBalance),
      })
    );
    if (result?.status === 201) {
      setLastCreated(result.data);
      setLookupId(result.data.accountId);
      setListId(result.data.customerId);
    }
  }

  async function handleList(event) {
    event.preventDefault();
    await listAction.run(() => bankingApi.listAccounts(listId.trim()));
  }

  async function handleLookup(event) {
    event.preventDefault();
    await lookupAction.run(() => bankingApi.getAccount(lookupId.trim()));
  }

  async function loadAccount(accountId) {
    setLookupId(accountId);
    await lookupAction.run(() => bankingApi.getAccount(accountId));
  }

  const listedAccounts =
    listAction.result?.status === 200 && Array.isArray(listAction.result.data?.items)
      ? listAction.result.data.items
      : null;

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Open accounts, list a customer's accounts through the CustomerIdIndex query, and inspect balances."
      />

      <div className="grid two-columns">
        <Card
          title="Create account"
          subtitle="POST /customers/{customerId}/accounts — returns 201 with a zero balance by default."
        >
          <form onSubmit={handleCreate} className="form">
            <Field label="Customer ID" htmlFor="account-customer" hint="Must already exist (404 otherwise).">
              <input
                id="account-customer"
                value={createForm.customerId}
                onChange={update("customerId")}
                autoComplete="off"
              />
            </Field>
            <div className="form-row">
              <Field label="Type" htmlFor="account-type">
                <select id="account-type" value={createForm.type} onChange={update("type")}>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency" htmlFor="account-currency">
                <select
                  id="account-currency"
                  value={createForm.currency}
                  onChange={update("currency")}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="Initial balance"
              htmlFor="account-balance"
              hint="Optional. Leave empty to use the 0 default."
            >
              <input
                id="account-balance"
                type="number"
                step="0.01"
                min="0"
                value={createForm.initialBalance}
                onChange={update("initialBalance")}
              />
            </Field>
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={createAction.busy}>
                {createAction.busy ? "Creating…" : "Create account"}
              </button>
              {lastCreated && (
                <button
                  type="button"
                  className="button"
                  onClick={() => loadAccount(lastCreated.accountId)}
                >
                  View last created
                </button>
              )}
            </div>
          </form>

          {lastCreated && (
            <p className="note">
              Last created: <code>{lastCreated.accountId}</code> for{" "}
              <code>{lastCreated.customerId}</code>
            </p>
          )}

          <ApiResult
            result={createAction.result}
            error={createAction.error}
            busy={createAction.busy}
            label="Created account"
          />
        </Card>

        <Card
          title="Get account"
          subtitle="GET /accounts/{accountId} — the balance is returned as a number."
        >
          <form onSubmit={handleLookup} className="form">
            <Field
              label="Account ID"
              htmlFor="account-id"
              hint="Try acct_001, acct_002, acct_003, or a missing id."
            >
              <input
                id="account-id"
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={lookupAction.busy}>
                {lookupAction.busy ? "Loading…" : "Get account"}
              </button>
              <button type="button" className="button" onClick={() => loadAccount("acct_001")}>
                acct_001
              </button>
              <button type="button" className="button" onClick={() => loadAccount("acct_003")}>
                acct_003
              </button>
            </div>
          </form>

          <ApiResult
            result={lookupAction.result}
            error={lookupAction.error}
            busy={lookupAction.busy}
            label="Account"
          />
        </Card>
      </div>

      <Card
        title="List accounts"
        subtitle="GET /customers/{customerId}/accounts — one DynamoDB Query on the CustomerIdIndex GSI."
        actions={
          listAction.result && (
            <Pill tone={statusTone(listAction.result.status)}>
              HTTP {listAction.result.status}
            </Pill>
          )
        }
      >
        <form onSubmit={handleList} className="form form-inline">
          <Field label="Customer ID" htmlFor="list-customer">
            <input
              id="list-customer"
              value={listId}
              onChange={(event) => setListId(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={listAction.busy}>
              {listAction.busy ? "Loading…" : "List accounts"}
            </button>
          </div>
        </form>

        {listAction.busy && (
          <p className="inline-status">
            <span className="spinner" aria-hidden="true" /> Loading accounts…
          </p>
        )}
        {listAction.error && <div className="alert alert-danger">{listAction.error}</div>}
        {listAction.result && listAction.result.status !== 200 && (
          <div className="alert alert-danger">
            HTTP {listAction.result.status}:{" "}
            {listAction.result.data?.message ?? "Unexpected response"}
          </div>
        )}

        {listedAccounts && (
          <>
            {listedAccounts.length === 0 ? (
              <p className="muted">This customer has no accounts yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account ID</th>
                      <th>Type</th>
                      <th>Currency</th>
                      <th className="align-right">Balance</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {listedAccounts.map((account) => (
                      <tr key={account.accountId}>
                        <td>
                          <code>{account.accountId}</code>
                        </td>
                        <td>{account.type}</td>
                        <td>{account.currency}</td>
                        <td className="align-right">{account.balance.toFixed(2)}</td>
                        <td>{account.status}</td>
                        <td className="align-right">
                          <button
                            type="button"
                            className="button button-ghost button-small"
                            onClick={() => loadAccount(account.accountId)}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details className="test-evidence">
              <summary>Raw response</summary>
              <JsonBlock value={listAction.result.data} label="GET accounts response" />
            </details>
          </>
        )}
      </Card>
    </>
  );
}
