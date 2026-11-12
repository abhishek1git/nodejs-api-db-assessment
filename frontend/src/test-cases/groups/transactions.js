import { bankingApi } from "../../api/banking";
import {
  assert,
  assertAccountShape,
  assertEqual,
  assertErrorShape,
  assertStatus,
} from "../assert";
import { createAccount, createCustomer, expectBalance, freshAccount } from "../helpers";

async function setupPair(firstBalance = 200, secondBalance = 50, currency = "CAD") {
  const customer = await createCustomer();
  const from = await createAccount(customer.customerId, {
    currency,
    initialBalance: firstBalance,
  });
  const to = await createAccount(customer.customerId, {
    currency,
    initialBalance: secondBalance,
  });
  return { customer, from, to };
}

function transferBody(fromAccountId, toAccountId, amount, currency = "CAD") {
  return { fromAccountId, toAccountId, amount, currency };
}

export default {
  id: "transactions",
  title: "Transactions",
  description:
    "Deposits, withdrawals, and transfers — including currency checks, insufficient funds, and decimal precision.",
  cases: [
    {
      id: "tx-deposit-credits",
      name: "Deposit credits the balance",
      description: "POST /accounts/{id}/deposits returns the updated account with balance + amount.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const response = await bankingApi.deposit(account.accountId, {
          amount: 25,
          currency: "CAD",
        });
        const updated = assertStatus(response, 200, "POST deposit");
        assertAccountShape(updated);
        assertEqual(updated.accountId, account.accountId, "accountId", updated);
        assertEqual(updated.balance, 125, "balance after deposit", updated);
        return { status: response.status, evidence: updated };
      },
    },
    {
      id: "tx-deposit-persists",
      name: "Deposit is persisted",
      description: "A follow-up GET shows the credited balance stored in DynamoDB.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        assertStatus(
          await bankingApi.deposit(account.accountId, { amount: 25, currency: "CAD" }),
          200,
          "POST deposit"
        );
        const stored = await expectBalance(account.accountId, 125);
        return { status: 200, evidence: stored };
      },
    },
    {
      id: "tx-deposit-unknown-account",
      name: "Deposit to unknown account returns 404",
      description: "Deposits require an existing account.",
      async run() {
        const response = await bankingApi.deposit("acct_missing", {
          amount: 10,
          currency: "CAD",
        });
        const body = assertStatus(response, 404, "POST deposit (unknown account)");
        assertErrorShape(body, "NOT_FOUND", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-deposit-wrong-currency",
      name: "Deposit currency must match the account",
      description: "A CAD account rejects a USD deposit with a 400.",
      async run() {
        const account = await freshAccount({ currency: "CAD", initialBalance: 100 });
        const response = await bankingApi.deposit(account.accountId, {
          amount: 10,
          currency: "USD",
        });
        const body = assertStatus(response, 400, "POST deposit (wrong currency)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(
          body.message,
          "currency USD does not match account currency CAD",
          "message",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-deposit-invalid-amounts",
      name: "Deposit rejects invalid amounts",
      description: "Zero, negative, string, and null amounts all return 400.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const evidence = [];
        for (const amount of [0, -1, "5", null]) {
          const response = await bankingApi.deposit(account.accountId, {
            amount,
            currency: "CAD",
          });
          const body = assertStatus(
            response,
            400,
            `POST deposit (amount ${JSON.stringify(amount)})`
          );
          assertErrorShape(body, "BAD_REQUEST", body);
          assertEqual(
            body.message,
            "amount must be a number greater than 0",
            `message for amount ${JSON.stringify(amount)}`,
            body
          );
          evidence.push({ amount, status: response.status, message: body.message });
        }
        await expectBalance(account.accountId, 100);
        return { status: 400, evidence };
      },
    },
    {
      id: "tx-deposit-missing-amount",
      name: "Deposit without amount returns 400",
      description: "The amount field is mandatory.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const response = await bankingApi.deposit(account.accountId, { currency: "CAD" });
        const body = assertStatus(response, 400, "POST deposit (missing amount)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "amount is required", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-deposit-missing-currency",
      name: "Deposit without currency returns 400",
      description: "The currency field is mandatory.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const response = await bankingApi.deposit(account.accountId, { amount: 5 });
        const body = assertStatus(response, 400, "POST deposit (missing currency)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "currency is required", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-withdraw-debits",
      name: "Withdrawal debits the balance",
      description: "POST /accounts/{id}/withdrawals returns the reduced balance.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const response = await bankingApi.withdraw(account.accountId, {
          amount: 25,
          currency: "CAD",
        });
        const updated = assertStatus(response, 200, "POST withdrawal");
        assertEqual(updated.balance, 75, "balance after withdrawal", updated);
        await expectBalance(account.accountId, 75);
        return { status: response.status, evidence: updated };
      },
    },
    {
      id: "tx-withdraw-entire-balance",
      name: "Withdrawing the whole balance is allowed",
      description: "A withdrawal equal to the balance leaves exactly 0.",
      async run() {
        const account = await freshAccount({ initialBalance: 250 });
        const response = await bankingApi.withdraw(account.accountId, {
          amount: 250,
          currency: "CAD",
        });
        const updated = assertStatus(response, 200, "POST withdrawal (full balance)");
        assertEqual(updated.balance, 0, "balance after full withdrawal", updated);
        return { status: response.status, evidence: updated };
      },
    },
    {
      id: "tx-withdraw-insufficient",
      name: "Insufficient funds returns 409",
      description: "The conditional debit rejects the update and the balance is untouched.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const response = await bankingApi.withdraw(account.accountId, {
          amount: 100.01,
          currency: "CAD",
        });
        const body = assertStatus(response, 409, "POST withdrawal (insufficient)");
        assertErrorShape(body, "CONFLICT", body);
        assertEqual(body.message, "Insufficient funds", "message", body);
        await expectBalance(account.accountId, 100);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-withdraw-huge-overdraft",
      name: "Huge overdraft returns 409",
      description: "ConditionExpression stops the balance from going negative.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const response = await bankingApi.withdraw(account.accountId, {
          amount: 999999,
          currency: "CAD",
        });
        const body = assertStatus(response, 409, "POST withdrawal (huge overdraft)");
        assertErrorShape(body, "CONFLICT", body);
        await expectBalance(account.accountId, 100);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-withdraw-sequential-guard",
      name: "Sequential withdrawals cannot overdraw",
      description: "After a successful 45 withdrawal, a 10 withdrawal fails and the balance stays 5.",
      async run() {
        const account = await freshAccount({ initialBalance: 50 });
        const first = await bankingApi.withdraw(account.accountId, {
          amount: 45,
          currency: "CAD",
        });
        assertStatus(first, 200, "first withdrawal");
        assertEqual(first.data.balance, 5, "balance after first withdrawal", first.data);

        const second = await bankingApi.withdraw(account.accountId, {
          amount: 10,
          currency: "CAD",
        });
        assertStatus(second, 409, "second withdrawal");
        assertErrorShape(second.data, "CONFLICT", second.data);
        await expectBalance(account.accountId, 5);
        return {
          status: second.status,
          evidence: { first: first.data, second: second.data },
        };
      },
    },
    {
      id: "tx-withdraw-unknown-account",
      name: "Withdrawal from unknown account returns 404",
      description: "The account is loaded before any write happens.",
      async run() {
        const response = await bankingApi.withdraw("acct_missing", {
          amount: 1,
          currency: "CAD",
        });
        const body = assertStatus(response, 404, "POST withdrawal (unknown account)");
        assertErrorShape(body, "NOT_FOUND", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-withdraw-wrong-currency",
      name: "Withdrawal currency must match the account",
      description: "A CAD account rejects a USD withdrawal with a 400.",
      async run() {
        const account = await freshAccount({ currency: "CAD", initialBalance: 100 });
        const response = await bankingApi.withdraw(account.accountId, {
          amount: 1,
          currency: "USD",
        });
        const body = assertStatus(response, 400, "POST withdrawal (wrong currency)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(
          body.message,
          "currency USD does not match account currency CAD",
          "message",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-moves-funds",
      name: "Transfer moves funds between accounts",
      description:
        "POST /transfers debits the source, credits the destination, and preserves the total.",
      async run() {
        const { from, to } = await setupPair(200, 50);
        const response = await bankingApi.transfer(
          transferBody(from.accountId, to.accountId, 30)
        );
        const body = assertStatus(response, 200, "POST /transfers");
        assert(body.fromAccount && body.toAccount, "response must include both accounts", body);
        assertEqual(body.fromAccount.balance, 170, "source balance", body);
        assertEqual(body.toAccount.balance, 80, "destination balance", body);
        assertEqual(
          body.fromAccount.balance + body.toAccount.balance,
          250,
          "total balance is preserved",
          body
        );

        await expectBalance(from.accountId, 170);
        await expectBalance(to.accountId, 80);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-insufficient",
      name: "Transfer with insufficient funds returns 409",
      description: "Neither account is changed when the conditional debit fails.",
      async run() {
        const { from, to } = await setupPair(100, 0);
        const response = await bankingApi.transfer(
          transferBody(from.accountId, to.accountId, 101)
        );
        const body = assertStatus(response, 409, "POST /transfers (insufficient)");
        assertErrorShape(body, "CONFLICT", body);
        assertEqual(body.message, "Insufficient funds", "message", body);

        await expectBalance(from.accountId, 100);
        await expectBalance(to.accountId, 0);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-same-account",
      name: "Transfer to the same account returns 400",
      description: "fromAccountId and toAccountId must differ.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const response = await bankingApi.transfer(
          transferBody(account.accountId, account.accountId, 10)
        );
        const body = assertStatus(response, 400, "POST /transfers (same account)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(
          body.message,
          "fromAccountId and toAccountId must be different",
          "message",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-cross-currency",
      name: "Transfer between currencies returns 400",
      description: "A CAD account cannot transfer directly to a USD account.",
      async run() {
        const customer = await createCustomer();
        const cad = await createAccount(customer.customerId, {
          currency: "CAD",
          initialBalance: 100,
        });
        const usd = await createAccount(customer.customerId, {
          currency: "USD",
          initialBalance: 100,
        });
        const response = await bankingApi.transfer(
          transferBody(cad.accountId, usd.accountId, 10, "CAD")
        );
        const body = assertStatus(response, 400, "POST /transfers (cross-currency)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(body.message, "Accounts must have the same currency", "message", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-body-currency",
      name: "Transfer currency must match the accounts",
      description: "The body currency is checked against the source account currency.",
      async run() {
        const { from, to } = await setupPair(100, 0);
        const response = await bankingApi.transfer(
          transferBody(from.accountId, to.accountId, 10, "USD")
        );
        const body = assertStatus(response, 400, "POST /transfers (body currency)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(
          body.message,
          "currency USD does not match account currency CAD",
          "message",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-unknown-account",
      name: "Transfer with unknown accounts returns 404",
      description: "Both accounts are looked up before the saga starts.",
      async run() {
        const { from } = await setupPair(100, 0);
        const response = await bankingApi.transfer(
          transferBody(from.accountId, "acct_missing", 10)
        );
        const body = assertStatus(response, 404, "POST /transfers (unknown destination)");
        assertErrorShape(body, "NOT_FOUND", body);
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-invalid-amount",
      name: "Transfer rejects invalid amounts",
      description: "A negative transfer amount returns 400.",
      async run() {
        const { from, to } = await setupPair(100, 0);
        const response = await bankingApi.transfer(
          transferBody(from.accountId, to.accountId, -5)
        );
        const body = assertStatus(response, 400, "POST /transfers (negative amount)");
        assertErrorShape(body, "BAD_REQUEST", body);
        assertEqual(
          body.message,
          "amount must be a number greater than 0",
          "message",
          body
        );
        return { status: response.status, evidence: body };
      },
    },
    {
      id: "tx-transfer-decimal-precision",
      name: "Transfers keep decimal precision",
      description:
        "0.1 then 0.2 transferred from 100 yields exact DynamoDB decimals (99.9 / 0.1 then 99.7 / 0.3).",
      async run() {
        const { from, to } = await setupPair(100, 0);
        const first = await bankingApi.transfer(
          transferBody(from.accountId, to.accountId, 0.1)
        );
        assertStatus(first, 200, "first transfer");
        assertEqual(first.data.fromAccount.balance, 99.9, "balance after 0.1", first.data);
        assertEqual(first.data.toAccount.balance, 0.1, "destination after 0.1", first.data);

        const second = await bankingApi.transfer(
          transferBody(from.accountId, to.accountId, 0.2)
        );
        assertStatus(second, 200, "second transfer");
        assertEqual(second.data.fromAccount.balance, 99.7, "balance after 0.2", second.data);
        assertEqual(second.data.toAccount.balance, 0.3, "destination after 0.2", second.data);

        await expectBalance(to.accountId, 0.3);
        return {
          status: second.status,
          evidence: { first: first.data, second: second.data },
        };
      },
    },
  ],
};
