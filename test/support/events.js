"use strict";

/**
 * Builds the subset of an API Gateway proxy event the handlers rely on.
 * Pass `body` as an object, a raw string, or omit it for "no body".
 */
function apiEvent({ pathParameters = null, body, isBase64Encoded = false } = {}) {
  let serializedBody = null;
  if (body !== undefined) {
    serializedBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  return {
    httpMethod: "POST",
    pathParameters,
    headers: { "Content-Type": "application/json" },
    body: serializedBody,
    isBase64Encoded,
  };
}

function readResponse(response) {
  let json = null;
  if (response.body) {
    try {
      json = JSON.parse(response.body);
    } catch {
      json = null;
    }
  }
  return { ...response, json };
}

async function invoke(handler, event) {
  return readResponse(await handler(event));
}

module.exports = {
  apiEvent,
  invoke,
  readResponse,
};
