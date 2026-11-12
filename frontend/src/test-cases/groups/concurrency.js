import { bankingApi } from "../../api/banking";
import { assert, assertEqual, assertStatus } from "../assert";
import { expectBalance, freshAccount } from "../helpers";

export default {
  id: "concurrency",
  title: "Concurrency",
  description:
    "Fires parallel writes to prove the DynamoDB conditional updates and atomic balance arithmetic hold under load.",
  cases: [
    {
      id: "concurrency-withdrawals",
      name: "Parallel withdrawals never overdraw",
      description:
        "Ten simultaneous 15-unit withdrawals against 100: exactly six succeed and the balance lands on 10.",
      async run() {
        const account = await freshAccount({ initialBalance: 100 });
        const responses = await Promise.all(
          Array.from({ length: 10 }, () =>
            bankingApi.withdraw(account.accountId, { amount: 15, currency: "CAD" })
          )
        );

        const statuses = responses.map((response) => response.status);
        statuses.forEach((status) => {
          assert(
            status === 200 || status === 409,
            `unexpected status ${status} from a parallel withdrawal`,
            statuses
          );
        });

        const successes = statuses.filter((status) => status === 200).length;
        const conflicts = statuses.filter((status) => status === 409).length;
        assertEqual(successes, 6, "successful withdrawals", statuses);
        assertEqual(conflicts, 4, "rejected withdrawals", statuses);

        await expectBalance(account.accountId, 10);
        return { status: 200, evidence: { statuses, successes, conflicts } };
      },
    },
    {
      id: "concurrency-deposits",
      name: "Parallel deposits are all applied",
      description: "Ten simultaneous 1-unit deposits on a zero balance end at exactly 10.",
      async run() {
        const account = await freshAccount({ initialBalance: 0 });
        const responses = await Promise.all(
          Array.from({ length: 10 }, () =>
            bankingApi.deposit(account.accountId, { amount: 1, currency: "CAD" })
          )
        );
        responses.forEach((response, index) => {
          assertStatus(response, 200, `parallel deposit #${index + 1}`);
        });

        const stored = await expectBalance(account.accountId, 10);
        return {
          status: 200,
          evidence: {
            finalBalance: stored.balance,
            balancesSeen: responses.map((response) => response.data.balance),
          },
        };
      },
    },
    {
      id: "concurrency-transfers",
      name: "Parallel transfers keep the total intact",
      description:
        "Ten simultaneous 5-unit transfers from a funded account all succeed and preserve the combined balance.",
      async run() {
        const source = await freshAccount({ initialBalance: 100 });
        const destination = await freshAccount({ initialBalance: 0 });

        const responses = await Promise.all(
          Array.from({ length: 10 }, () =>
            bankingApi.transfer({
              fromAccountId: source.accountId,
              toAccountId: destination.accountId,
              amount: 5,
              currency: "CAD",
            })
          )
        );

        const statuses = responses.map((response) => response.status);
        const failures = statuses.filter((status) => status !== 200);
        assert(
          failures.length === 0,
          `expected every transfer to succeed, saw statuses ${statuses.join(", ")}`,
          statuses
        );

        const fromStored = await expectBalance(source.accountId, 50);
        const toStored = await expectBalance(destination.accountId, 50);
        assertEqual(
          fromStored.balance + toStored.balance,
          100,
          "combined balance",
          { from: fromStored, to: toStored }
        );
        return {
          status: 200,
          evidence: { statuses, fromBalance: fromStored.balance, toBalance: toStored.balance },
        };
      },
    },
  ],
};
