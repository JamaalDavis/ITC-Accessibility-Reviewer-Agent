import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScanEvidence, verifyEvidence } from "../src/scan-evidence.js";
import type { AccessibilityReport } from "../src/report.js";
const header = "# Accessibility scan: http://localhost/\nHTTP 200 · axe-core\n1 violation rule(s)\n";
const text = header + '## Serious\n### label — Label (1 element)\n- selector: `#email`\n## Needs manual review\n### color-contrast — Contrast\n- selector: `p`';
test("keeps violations and incomplete results separate", () => {
  const result = parseScanEvidence(text);
  assert.deepEqual(result.violations, [{rule: "label", selector: "#email", severity: "serious", wcagCriteria: []}]);
  assert.deepEqual(result.manual, [{rule: "color-contrast", selector: "p"}]);
});
test("rejects failures, HTTP errors and truncated evidence", () => {
  for (const value of ["Scan failed", text.replace("HTTP 200", "HTTP 404"), text + "\n (+4 more element(s))"]) assert.throws(() => parseScanEvidence(value));
});
test("rejects omitted findings and manual evidence", () => {
  const evidence = parseScanEvidence(text);
  const report = {issues: evidence.violations.map(issue => ({...issue, source: "automated"})), manualReview: []} as unknown as AccessibilityReport;
  assert.throws(() => verifyEvidence(report, evidence));
  report.manualReview = [{area: "Contrast", reason: "Check color-contrast on p", testMethod: "Measure contrast", affectedUsers: ["low vision users"]}];
  assert.doesNotThrow(() => verifyEvidence(report, evidence));
  report.issues = [];
  assert.throws(() => verifyEvidence(report, evidence));
});
