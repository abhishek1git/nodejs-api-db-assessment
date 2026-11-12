"use strict";

// Pragmatic email check: one "@", no whitespace, and a dot in the domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACCOUNT_TYPES = ["CHECKING", "SAVINGS"];
const CURRENCIES = ["CAD", "USD"];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value) {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

module.exports = {
  ACCOUNT_TYPES,
  CURRENCIES,
  isPlainObject,
  isNonEmptyString,
  isValidEmail,
  isPositiveNumber,
};
