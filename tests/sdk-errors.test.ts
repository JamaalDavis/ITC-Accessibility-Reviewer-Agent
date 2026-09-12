import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSdkResult } from "../src/sdk-errors.js";

test("success subtype can carry an API error and must expose the real failure", () => {
  assert.throws(() => checkSdkResult({subtype: "success", is_error: true, result: "Invalid API key"}), /Claude request failed: Invalid API key/);
});
test("error messages redact credentials", () => {
  assert.throws(() => checkSdkResult({subtype: "success", is_error: true, result: "Invalid sk-ant-example-secret"}), /Invalid \[redacted\]$/);
});
test("permission denials and failed turns are reported", () => {
  assert.throws(() => checkSdkResult({subtype: "error_max_turns", errors: ["Turn limit reached"]}), /Turn limit reached/);
  assert.throws(() => checkSdkResult({subtype: "success", permission_denials: [{}]}), /tool access was denied/);
  assert.doesNotThrow(() => checkSdkResult({subtype: "success", is_error: false}));
});
