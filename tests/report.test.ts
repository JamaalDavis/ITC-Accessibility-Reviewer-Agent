import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeReport } from "../src/report.js";
import { validateTarget } from "../src/accessibility-reviewer.js";
const target = "http://localhost:3000/issues.html";
const issue = { id: "image-alt-1", rule: "image-alt", wcagCriteria: ["1.1.1"], severity: "critical", category: "perceivable", element: "<img>", selector: "img", issue: "Missing alt", userImpact: "Image information may be unavailable to screen reader users", remediation: "Supply context-appropriate alt", source: "automated", affectedUsers: ["screen reader users"], evidence: "axe image-alt", evidenceIds: ["evidence-1"], confidence: "high", requiresHumanReview: false, taskCompletionRisk: false };
function fixture() { return { target, standard: "WCAG 2.2 AA", riskScore: 100, issues: [issue], manualReview: [{ area: "Keyboard", reason: "Requires interaction", testMethod: "Complete registration with keyboard", affectedUsers: ["keyboard users"] }], summary: { totalIssues: 0, critical: 0, serious: 0, moderate: 0, minor: 0, manualReviewItems: 0 }, categories: { perceivable: 0, operable: 0, understandable: 0, robust: 0, bestPractice: 0, other: 0 }, recommendations: ["Fix alt", "Test keyboard", "Test screen reader"], limitations: ["Single page"] }; }
test("recomputes counts and score rather than trusting generated arithmetic", () => {
  const result = finalizeReport(fixture(), target);
  assert.equal(result.riskScore, 85); assert.equal(result.summary.critical, 1); assert.equal(result.categories.perceivable, 1); assert.equal(result.summary.manualReviewItems, 1);
});
test("score floors at zero", () => { const data = fixture(); data.issues = Array.from({length: 9}, (_, i) => ({...issue, id: `image-${i}`, selector: `img:nth-child(${i+1})`})); assert.equal(finalizeReport(data, target).riskScore, 0); });
test("rejects duplicate evidence, wrong targets, and absent manual review", () => {
  const data = fixture(); data.issues.push(issue); assert.throws(() => finalizeReport(data, target));
  assert.throws(() => finalizeReport(fixture(), "https://example.com/"));
  assert.throws(() => finalizeReport({...fixture(), manualReview: []}, target));
});
test("zero detected issues retains manual review and limitations", () => { const result = finalizeReport({...fixture(), issues: []}, target); assert.equal(result.riskScore, 100); assert.ok(result.manualReview.length); assert.ok(result.limitations.some(value => value.includes("does not establish"))); });
test("rejects local files and URL credentials", () => { assert.throws(() => validateTarget("file:///tmp/test.html")); assert.throws(() => validateTarget("https://user:secret@example.com")); assert.equal(validateTarget("https://example.com"), "https://example.com/"); });
test("inferred concerns require human review and do not alter the automated score", () => {
  const inferred = { ...issue, id: "inferred", source: "agent-inference", taskCompletionRisk: true, requiresHumanReview: true };
  const result = finalizeReport({...fixture(), issues: [issue, inferred]}, target);
  assert.equal(result.riskScore, 85); assert.equal(result.summary.totalIssues, 1); assert.equal(result.issues[0].id, "inferred");
  assert.throws(() => finalizeReport({...fixture(), issues: [{...inferred, requiresHumanReview: false}]}, target));
});
