"use strict";

const { serverError } = require("./response");

/**
 * Keeps every handler honest: expected outcomes return a response, while any
 * unexpected failure (e.g. DynamoDB unavailable) becomes a 500 instead of an
 * unhandled Lambda error.
 */
function wrapHandler(handler) {
  return async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      console.error("Unhandled handler error:", err);
      return serverError();
    }
  };
}

module.exports = {
  wrapHandler,
};
