// Empty in local dev: the Vite proxy forwards /api to serverless-offline.
// Set VITE_API_BASE_URL to the full API Gateway stage URL for deployments.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/+$/,
  ""
);

const OFFLINE_MESSAGE = `Cannot reach the API at ${API_BASE}. If you are running locally, start the backend (dynalite + seed + npm start) and try again.`;

async function parseBody(response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
}

async function request(path, { method = "GET", body, rawBody } = {}) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  } else if (rawBody !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = rawBody;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    throw new Error(`${OFFLINE_MESSAGE} (${err.message})`);
  }

  return {
    status: response.status,
    ok: response.ok,
    data: await parseBody(response),
  };
}

async function getText(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch (err) {
    throw new Error(`${OFFLINE_MESSAGE} (${err.message})`);
  }
  return { status: response.status, ok: response.ok, text: await response.text() };
}

export const http = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  postRaw: (path, rawBody) => request(path, { method: "POST", rawBody }),
  getText,
};
