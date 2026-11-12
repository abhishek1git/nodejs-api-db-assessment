import accounts from "./groups/accounts";
import concurrency from "./groups/concurrency";
import customers from "./groups/customers";
import service from "./groups/service";
import transactions from "./groups/transactions";

export const testGroups = [service, customers, accounts, transactions, concurrency];

export const allTestCases = testGroups.flatMap((group) => group.cases);
