import { useState } from "react";
import { bankingApi } from "../api/banking";
import ApiResult from "../components/ApiResult";
import Card from "../components/Card";
import Field from "../components/Field";
import PageHeader from "../components/PageHeader";
import useAsyncAction from "../hooks/useAsyncAction";

function useTransactionForm(initial) {
  const [form, setForm] = useState(initial);
  const update = (field) => (event) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  return { form, update, set };
}

export default function TransactionsPage() {
  const deposit = useTransactionForm({
    accountId: "acct_001",
    amount: "10",
    currency: "CAD",
  });
  const withdraw = useTransactionForm({
    accountId: "acct_001",
    amount: "5",
    currency: "CAD",
  });
  const transfer = useTransactionForm({
    fromAccountId: "acct_001",
    toAccountId: "acct_002",
    amount: "1",
    currency: "CAD",
  });

  const depositAction = useAsyncAction();
  const withdrawAction = useAsyncAction();
  const transferAction = useAsyncAction();

  async function handleDeposit(event) {
    event.preventDefault();
    await depositAction.run(() =>
      bankingApi.deposit(deposit.form.accountId.trim(), {
        amount: Number(deposit.form.amount),
        currency: deposit.form.currency,
      })
    );
  }

  async function handleWithdraw(event) {
    event.preventDefault();
    await withdrawAction.run(() =>
      bankingApi.withdraw(withdraw.form.accountId.trim(), {
        amount: Number(withdraw.form.amount),
        currency: withdraw.form.currency,
      })
    );
  }

  async function handleTransfer(event) {
    event.preventDefault();
    await transferAction.run(() =>
      bankingApi.transfer({
        fromAccountId: transfer.form.fromAccountId.trim(),
        toAccountId: transfer.form.toAccountId.trim(),
        amount: Number(transfer.form.amount),
        currency: transfer.form.currency,
      })
    );
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Deposit, withdraw, and transfer against the live API. Balances update atomically in DynamoDB."
      />

      <div className="grid two-columns">
        <Card
          title="Deposit"
          subtitle="POST /accounts/{accountId}/deposits — amount must be greater than 0 and match the account currency."
        >
          <form onSubmit={handleDeposit} className="form">
            <Field label="Account ID" htmlFor="deposit-account">
              <input
                id="deposit-account"
                value={deposit.form.accountId}
                onChange={deposit.update("accountId")}
                autoComplete="off"
              />
            </Field>
            <div className="form-row">
              <Field label="Amount" htmlFor="deposit-amount">
                <input
                  id="deposit-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={deposit.form.amount}
                  onChange={deposit.update("amount")}
                />
              </Field>
              <Field label="Currency" htmlFor="deposit-currency">
                <select
                  id="deposit-currency"
                  value={deposit.form.currency}
                  onChange={deposit.update("currency")}
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={depositAction.busy}>
                {depositAction.busy ? "Depositing…" : "Deposit"}
              </button>
            </div>
          </form>
          <ApiResult
            result={depositAction.result}
            error={depositAction.error}
            busy={depositAction.busy}
            label="Account after deposit"
          />
        </Card>

        <Card
          title="Withdraw"
          subtitle="POST /accounts/{accountId}/withdrawals — 409 when funds are insufficient."
        >
          <form onSubmit={handleWithdraw} className="form">
            <Field label="Account ID" htmlFor="withdraw-account">
              <input
                id="withdraw-account"
                value={withdraw.form.accountId}
                onChange={withdraw.update("accountId")}
                autoComplete="off"
              />
            </Field>
            <div className="form-row">
              <Field label="Amount" htmlFor="withdraw-amount">
                <input
                  id="withdraw-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={withdraw.form.amount}
                  onChange={withdraw.update("amount")}
                />
              </Field>
              <Field label="Currency" htmlFor="withdraw-currency">
                <select
                  id="withdraw-currency"
                  value={withdraw.form.currency}
                  onChange={withdraw.update("currency")}
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={withdrawAction.busy}>
                {withdrawAction.busy ? "Withdrawing…" : "Withdraw"}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => withdraw.set("amount", "999999")}
              >
                Try overdraft
              </button>
            </div>
          </form>
          <ApiResult
            result={withdrawAction.result}
            error={withdrawAction.error}
            busy={withdrawAction.busy}
            label="Account after withdrawal"
          />
        </Card>
      </div>

      <Card
        title="Transfer"
        subtitle="POST /transfers — conditional debit, then credit, with a compensating refund if the credit fails. Both accounts must share a currency."
      >
        <form onSubmit={handleTransfer} className="form">
          <div className="form-row">
            <Field label="From account" htmlFor="transfer-from">
              <input
                id="transfer-from"
                value={transfer.form.fromAccountId}
                onChange={transfer.update("fromAccountId")}
                autoComplete="off"
              />
            </Field>
            <Field label="To account" htmlFor="transfer-to">
              <input
                id="transfer-to"
                value={transfer.form.toAccountId}
                onChange={transfer.update("toAccountId")}
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Amount" htmlFor="transfer-amount">
              <input
                id="transfer-amount"
                type="number"
                step="0.01"
                min="0"
                value={transfer.form.amount}
                onChange={transfer.update("amount")}
              />
            </Field>
            <Field label="Currency" htmlFor="transfer-currency">
              <select
                id="transfer-currency"
                value={transfer.form.currency}
                onChange={transfer.update("currency")}
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={transferAction.busy}>
              {transferAction.busy ? "Transferring…" : "Transfer"}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => transfer.set("amount", "999999")}
            >
              Try insufficient funds
            </button>
          </div>
        </form>
        <ApiResult
          result={transferAction.result}
          error={transferAction.error}
          busy={transferAction.busy}
          label="Transfer result"
        />
      </Card>
    </>
  );
}
