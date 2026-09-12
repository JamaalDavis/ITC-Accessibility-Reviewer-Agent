import { createSampleServer } from "../src/sample-pages.js";
import { reviewAccessibility } from "../src/accessibility-reviewer.js";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const pages = createSampleServer();
try {
  await new Promise<void>((resolve, reject) => { pages.once("error", reject); pages.listen(0, "127.0.0.1", resolve); });
  const address = pages.address();
  if (!address || typeof address === "string") throw new Error("Sample server unavailable");
  const report = await reviewAccessibility(`http://127.0.0.1:${address.port}/checkout.html`, {auditPath: "reports/checkout-agent.audit.json"});
  for (const name of ["a11y_scan_page", "a11y_check_contrast", "a11y_lookup_wcag", "a11y_request_human_review"]) assert.ok(report.auditTrail.some(entry => entry.tool === name && entry.status === "success"), `${name} was not used`);
  assert.deepEqual(report.integrationFailures, [], "Live report must pass integration checks");
  assert.ok(report.summary, "Failed integration must not publish summary counts");
  assert.ok(report.summary.totalIssues >= 3);
  assert.ok(report.humanReviewQueue.length);
  await mkdir("reports", {recursive: true});
  await writeFile("reports/checkout-agent.report.json", JSON.stringify(report, null, 2));
  console.log(`Live agent review passed: ${report.summary.totalIssues} automated findings, ${report.humanReviewQueue.length} pending human reviews. Report: reports/checkout-agent.report.json`);
} finally { await new Promise<void>(resolve => pages.close(() => resolve())); }
