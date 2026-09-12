import type { AccessibilityReport } from "./report.js";

export interface ScanEvidence {
  violations: { rule: string; selector: string; severity: string; wcagCriteria: string[] }[];
  manual: { rule: string; selector: string }[];
}

// Contract of the pinned scanner. Reject incomplete evidence instead of scoring it.
export function parseScanEvidence(text: string): ScanEvidence {
  if (!text.startsWith("# Accessibility scan:") || !/\d+ violation rule\(s\)/.test(text)) throw new Error("Unrecognized scanner evidence");
  if (!/^HTTP 2\d\d\b/m.test(text)) throw new Error("Scanner did not load a successful HTTP page");
  if (/\(\+\d+ more element\(s\)\)/.test(text)) throw new Error("Scanner truncated affected elements (25 per rule). Review smaller page scopes before generating a complete report.");
  const evidence: ScanEvidence = { violations: [], manual: [] };
  let section = "";
  let rule = "";
  let wcagCriteria: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) section = line.slice(3).toLowerCase();
    if (line.startsWith("### ")) { rule = line.slice(4).split(" ")[0]; wcagCriteria = []; }
    if (line.startsWith("WCAG: ")) wcagCriteria = line.slice(6).split(", ");
    const match = line.match(/^- selector: `(.*)`$/);
    if (match) {
      if (!rule) throw new Error("Scanner selector lacks a rule");
      const entry = { rule, selector: match[1] };
      if (["critical", "serious", "moderate", "minor"].includes(section)) evidence.violations.push({ ...entry, severity: section, wcagCriteria });
      else evidence.manual.push(entry);
    }
  }
  return evidence;
}

export function verifyEvidence(report: AccessibilityReport, evidence: ScanEvidence): void {
  const key = (issue: { rule: string; selector: string; severity: string }) => JSON.stringify([issue.rule, issue.selector, issue.severity]);
  const actual = new Set(report.issues.filter(issue => issue.source === "automated").map(key));
  const expected = new Set(evidence.violations.map(key));
  if (actual.size !== expected.size || [...expected].some(value => !actual.has(value))) throw new Error("Report findings do not match scanner rule/selector/severity evidence");
  for (const issue of report.issues.filter(issue => issue.source === "automated")) {
    const original = evidence.violations.find(entry => key(entry) === key(issue))!;
    if (JSON.stringify([...issue.wcagCriteria].sort()) !== JSON.stringify([...original.wcagCriteria].sort())) throw new Error("Report WCAG attribution differs from scanner evidence");
  }
  for (const item of evidence.manual) {
    if (!report.manualReview.some(review => review.reason.includes(item.rule) && review.reason.includes(item.selector))) throw new Error(`Report omitted scanner manual-review evidence: ${item.rule} ${item.selector}`);
  }
}
