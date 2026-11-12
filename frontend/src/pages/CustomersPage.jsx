import { useState } from "react";
import { bankingApi } from "../api/banking";
import ApiResult from "../components/ApiResult";
import Card from "../components/Card";
import Field from "../components/Field";
import PageHeader from "../components/PageHeader";
import useAsyncAction from "../hooks/useAsyncAction";

export default function CustomersPage() {
  const [form, setForm] = useState({ fullName: "Grace Hopper", email: "grace@example.com" });
  const [lookupId, setLookupId] = useState("cust_001");
  const [lastCreated, setLastCreated] = useState(null);
  const createAction = useAsyncAction();
  const lookupAction = useAsyncAction();

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    const result = await createAction.run(() =>
      bankingApi.createCustomer({ fullName: form.fullName, email: form.email })
    );
    if (result?.status === 201) {
      setLastCreated(result.data);
      setLookupId(result.data.customerId);
    }
  }

  async function handleLookup(event) {
    event.preventDefault();
    await lookupAction.run(() => bankingApi.getCustomer(lookupId.trim()));
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Create customers and look them up. Errors show the exact status and body returned by the API."
      />

      <div className="grid two-columns">
        <Card
          title="Create customer"
          subtitle="POST /customers — returns 201 with the stored customer."
        >
          <form onSubmit={handleCreate} className="form">
            <Field label="Full name" htmlFor="customer-name" hint="Required, trimmed by the API.">
              <input
                id="customer-name"
                value={form.fullName}
                onChange={update("fullName")}
                placeholder="Ada Lovelace"
                autoComplete="off"
              />
            </Field>
            <Field label="Email" htmlFor="customer-email" hint="Required and format-checked.">
              <input
                id="customer-email"
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="ada@example.com"
                autoComplete="off"
              />
            </Field>
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={createAction.busy}>
                {createAction.busy ? "Creating…" : "Create customer"}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => setForm({ fullName: "", email: "" })}
              >
                Clear
              </button>
            </div>
          </form>

          {lastCreated && (
            <p className="note">
              Last created: <code>{lastCreated.customerId}</code>{" "}
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => setLookupId(lastCreated.customerId)}
              >
                Load below
              </button>
            </p>
          )}

          <ApiResult
            result={createAction.result}
            error={createAction.error}
            busy={createAction.busy}
            label="Created customer"
          />
        </Card>

        <Card
          title="Get customer"
          subtitle="GET /customers/{customerId} — returns 200 or 404."
        >
          <form onSubmit={handleLookup} className="form">
            <Field
              label="Customer ID"
              htmlFor="customer-id"
              hint="Try cust_001, cust_002, or a missing id to see the 404 shape."
            >
              <input
                id="customer-id"
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value)}
                placeholder="cust_001"
                autoComplete="off"
              />
            </Field>
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={lookupAction.busy}>
                {lookupAction.busy ? "Loading…" : "Get customer"}
              </button>
              <button type="button" className="button" onClick={() => setLookupId("cust_001")}>
                cust_001
              </button>
              <button type="button" className="button" onClick={() => setLookupId("cust_002")}>
                cust_002
              </button>
            </div>
          </form>

          <ApiResult
            result={lookupAction.result}
            error={lookupAction.error}
            busy={lookupAction.busy}
            label="Customer"
          />
        </Card>
      </div>
    </>
  );
}
