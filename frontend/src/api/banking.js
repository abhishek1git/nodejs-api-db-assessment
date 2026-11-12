import { http } from "./client";

const id = (value) => encodeURIComponent(value);

export const bankingApi = {
  getOpenApi: () => http.getText("/openapi.yaml"),

  getCustomer: (customerId) => http.get(`/customers/${id(customerId)}`),
  createCustomer: (body) => http.post("/customers", body),
  createCustomerRaw: (raw) => http.postRaw("/customers", raw),

  createAccount: (customerId, body) =>
    http.post(`/customers/${id(customerId)}/accounts`, body),
  listAccounts: (customerId) =>
    http.get(`/customers/${id(customerId)}/accounts`),
  getAccount: (accountId) => http.get(`/accounts/${id(accountId)}`),

  deposit: (accountId, body) =>
    http.post(`/accounts/${id(accountId)}/deposits`, body),
  withdraw: (accountId, body) =>
    http.post(`/accounts/${id(accountId)}/withdrawals`, body),
  transfer: (body) => http.post("/transfers", body),
};
