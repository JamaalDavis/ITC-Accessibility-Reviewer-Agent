import { test } from "node:test";
import assert from "node:assert/strict";
import { route_accessibility_finding, apply_stratified_spot_check, calibration_report } from "../src/routing.js";
import { reviewIntegrateRoute } from "../src/routing-pipeline.js";
import type { AccessibilityReport } from "../src/report.js";

const clear = { finding_id: "1", issue_category: "aria", rule: "aria-valid-attr",
  findings_below_threshold: [], reviewer_disagreements: [], integration_failures: [] };

test("all eight signal combinations route with stable reason ordering", () => {
  for (let mask = 0; mask < 8; mask++) {
    const result = route_accessibility_finding({ ...clear,
      findings_below_threshold: mask & 1 ? ["insufficient evidence"] : [],
      reviewer_disagreements: mask & 2 ? ["associated label exists"] : [],
      integration_failures: mask & 4 ? ["contradiction"] : [] });
    assert.equal(result.decision, mask ? "human_review" : "auto_approve");
    assert.equal(result.reason, [mask & 1 ? "low_confidence" : "", mask & 2 ? "reviewer_disagreement" : "",
      mask & 4 ? "integration_failure" : ""].filter(Boolean).join(", "));
  }
});

test("stratified samples use ceilings, preserve order, are repeatable and leave inputs unchanged", () => {
  const decisions = [40, 18, 5, 2].flatMap((n, category) => Array.from({ length: n }, (_, i) =>
    route_accessibility_finding({ ...clear, finding_id: `${category}-${i}`, issue_category: String(category) })));
  decisions.splice(2, 0, route_accessibility_finding({ ...clear, findings_below_threshold: ["low"] }));
  const before = structuredClone(decisions);
  const output = apply_stratified_spot_check(decisions, 0.2, 42);
  assert.deepEqual(output, apply_stratified_spot_check(decisions, 0.2, 42));
  assert.deepEqual(output.map(d => d.finding_id), decisions.map(d => d.finding_id));
  assert.deepEqual(decisions, before);
  assert.equal(output[2].decision, "human_review");
  assert.deepEqual([0, 1, 2, 3].map(c => output.filter(d => d.issue_category === String(c) && d.decision === "spot_check").length), [8, 4, 1, 1]);
  assert.equal(apply_stratified_spot_check(decisions, 0, 42).filter(d => d.decision === "spot_check").length, 4);
  assert.equal(apply_stratified_spot_check(decisions, 1, 42).filter(d => d.decision === "spot_check").length, 65);
  assert.deepEqual(apply_stratified_spot_check([], 0.2, 1), []);
  for (const value of [-1, 1.1, NaN, Infinity]) assert.throws(() => apply_stratified_spot_check([], value));
});

test("calibration slices category and rule and weights overall Brier by sample count", () => {
  const report = calibration_report([
    { issue_category: "forms", rule: "label", predicted_confidence: 0.9, correct: true },
    { issue_category: "forms", rule: "label", predicted_confidence: 0.8, correct: false },
    { issue_category: "forms", rule: "select-name", predicted_confidence: 0.5, correct: true },
    { issue_category: "aria", rule: "label", predicted_confidence: 1, correct: false },
  ]);
  assert.equal(report.cells.length, 3);
  assert.equal(report.cells[0].samples, 2);
  assert.ok(Math.abs(report.cells[0].mean_predicted_confidence - 0.85) < 1e-12);
  assert.equal(report.cells[0].observed_accuracy, 0.5);
  assert.ok(Math.abs(report.cells[0].brier_score - 0.325) < 1e-12);
  assert.ok(Math.abs(report.overall_brier - 0.475) < 1e-12);
  assert.deepEqual(calibration_report([]), { cells: [], overall_brier: 0 });
  assert.throws(() => calibration_report([{ issue_category: "aria", rule: "label", predicted_confidence: NaN, correct: true }]));
});

// The routing stage only needs these issue fields; report validation is tested separately.
const report = { issues: [{ id: "1", rule: "label", confidence: "high", requiresHumanReview: false, source: "automated" }] } as AccessibilityReport;
test("review runs before integration; disagreement and integration failure override high confidence", async () => {
  for (const agrees of [true, false]) for (const fails of [true, false]) {
    const calls: string[] = [];
    const result = await reviewIntegrateRoute(report, { html: '<label for="email">Email</label><input id="email">' }, {
      reviewer: async (_report, evidence) => { calls.push("review"); assert.ok(evidence); return { findings: [{ finding_id: "1", agrees, reason: "Checked source label" }] }; },
      integrate: () => { calls.push("integrate"); return fails ? ["Conflicting finding"] : []; }, seed: 42,
    });
    assert.deepEqual(calls, ["review", "integrate"]);
    assert.equal(result.routing[0].decision, !agrees || fails ? "human_review" : "spot_check");
    assert.equal(result.routing[0].issue_category, "forms");
  }
});
test("missing, duplicate, and failed reviewer results cannot auto approve", async () => {
  for (const reviewer of [async () => ({ findings: [] }), async () => { throw new Error("offline"); },
    async () => ({ findings: Array(2).fill({ finding_id: "1", agrees: true, reason: "agree" }) })]) {
    const result = await reviewIntegrateRoute(report, {}, { reviewer, integrate: () => [] });
    assert.equal(result.routing[0].decision, "human_review");
    assert.equal(result.routing[0].reason, "reviewer_disagreement");
  }
});

test("an empty findings report still routes interface integration failures", async () => {
  const result = await reviewIntegrateRoute({ ...report, target: "https://example.com", issues: [] }, {}, {
    reviewer: async () => ({ findings: [] }), integrate: () => { throw new Error("Omitted scanner finding"); },
  });
  assert.equal(result.routing.length, 1);
  assert.equal(result.routing[0].decision, "human_review");
  assert.equal(result.routing[0].reason, "low_confidence, integration_failure");
});
