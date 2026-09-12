import type { AccessibilityReport } from "./report.js";
import type { AuditRecord } from "./tools/index.js";
import { lookupWcag } from "./tools/wcag.js";
import type { checkContrast } from "./tools/contrast.js";
import type { scanPage } from "./tools/scan.js";

export function verifyToolEvidence(report: AccessibilityReport, audit: AuditRecord[]) {
  const successful = audit.filter(entry => entry.status === "success");
  const lookups = successful.filter(entry => entry.tool === "a11y_lookup_wcag").map(entry => entry.result as ReturnType<typeof lookupWcag>);
  for (const issue of report.issues) {
    const records = issue.evidenceIds.map(id => {
      const record = successful.find(entry => entry.id === id);
      if (!record) throw new Error(`Finding ${issue.id} references missing or failed evidence ${id}`);
      return record;
    });
    for (const criterion of issue.wcagCriteria) {
      if (!lookups.some(entry => entry.criterion === criterion && entry.status === "active")) throw new Error(`WCAG ${criterion} must be retrieved before attribution`);
    }
    if (issue.source === "automated" && !records.some(entry => entry.tool === "a11y_scan_page" &&
      (entry.result as Awaited<ReturnType<typeof scanPage>>).violations.some(value => value.rule === issue.rule && value.selector === issue.selector && value.severity === issue.severity))) {
      throw new Error(`Automated finding ${issue.id} lacks matching scan evidence`);
    }
    if (issue.source === "deterministic") {
      const record = records.find(entry => entry.tool === "a11y_check_contrast");
      if (!record) throw new Error(`Deterministic finding ${issue.id} lacks a contrast calculation`);
      const result = record.result as ReturnType<typeof checkContrast>;
      if (result.passes) throw new Error("A passing supplied-color calculation cannot be reported as a detected contrast failure");
      if (issue.wcagCriteria.length !== 1 || issue.wcagCriteria[0] !== result.criterion) throw new Error("Contrast criterion does not match calculation scope");
      // Keep the exact computation in the final finding, not model-recomputed math.
      issue.evidence = JSON.stringify({ evidenceId: record.id, input: record.input, ratio: result.ratio, requiredRatio: result.requiredRatio, passes: result.passes });
    }
    if (issue.requiresHumanReview && !records.some(entry => entry.tool === "a11y_request_human_review")) throw new Error(`Finding ${issue.id} requiring human review was not queued`);
    if (issue.source === "agent-inference" && !records.some(entry => ["a11y_scan_page", "a11y_check_contrast"].includes(entry.tool))) throw new Error(`Inference ${issue.id} needs observational evidence`);
  }
  return [...new Map(lookups.map(entry => [entry.criterion, entry])).values()];
}
