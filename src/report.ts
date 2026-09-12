import { z } from "zod";

const count = z.number().int().nonnegative();
export const AccessibilityIssueSchema = z.object({
  id: z.string().min(1),
  rule: z.string().min(1), wcagCriteria: z.array(z.string()),
  severity: z.enum(["critical", "serious", "moderate", "minor"]),
  category: z.enum(["perceivable", "operable", "understandable", "robust", "best-practice", "other"]),
  element: z.string(), selector: z.string().min(1), issue: z.string().min(1),
  userImpact: z.string().min(1), remediation: z.string().min(1),
  source: z.enum(["automated", "deterministic", "agent-inference", "human-review"]),
  affectedUsers: z.array(z.string().min(1)).min(1),
  evidence: z.string().min(1), evidenceIds: z.array(z.string()).min(1),
  confidence: z.enum(["high", "medium", "low"]), requiresHumanReview: z.boolean(),
  taskCompletionRisk: z.boolean().describe("Prioritization judgment, not proof of failed task completion"),
});
export const ManualReviewSchema = z.object({
  area: z.string().min(1), reason: z.string().min(1), testMethod: z.string().min(1),
  affectedUsers: z.array(z.string()).min(1),
});
export const AccessibilitySummarySchema = z.object({
  totalIssues: count, critical: count, serious: count, moderate: count, minor: count, manualReviewItems: count,
});
export const AccessibilityCategoriesSchema = z.object({
  perceivable: count, operable: count, understandable: count, robust: count, bestPractice: count, other: count,
});
export const AccessibilityReportSchema = z.object({
  target: z.string().url(), standard: z.literal("WCAG 2.2 AA"), riskScore: z.number().min(0).max(100),
  issues: z.array(AccessibilityIssueSchema), manualReview: z.array(ManualReviewSchema).min(1),
  summary: AccessibilitySummarySchema, categories: AccessibilityCategoriesSchema,
  recommendations: z.array(z.string()).min(3).max(5), limitations: z.array(z.string()).min(1),
});
export type AccessibilityReport = z.infer<typeof AccessibilityReportSchema>;
export const limitations = [
  "Automated testing does not establish WCAG conformance or prove an interface is fully accessible.",
  "WCAG 2.2 AA is the target standard, not a statement of complete rule coverage. Only the scanned page state is represented.",
  "riskScore starts at 100 and subtracts 15/10/5/2 per automated critical/serious/moderate/minor rule-element finding. Higher means fewer detected barriers; 100 does not mean accessible. Summary severity and category counts cover automated findings only; inferred and deterministic concerns are excluded from this score.",
  "Human review entries are pending local work, not completed tests or external assignments. Confidence and task-completion priority are review judgments, not calibrated probabilities or proven task failures.",
];
export function finalizeReport(input: unknown, target: string): AccessibilityReport {
  const report = AccessibilityReportSchema.parse(input);
  if (report.target !== target) throw new Error("Report target does not match requested URL");
  const summary = { totalIssues: 0, critical: 0, serious: 0, moderate: 0, minor: 0, manualReviewItems: report.manualReview.length };
  const categories = { perceivable: 0, operable: 0, understandable: 0, robust: 0, bestPractice: 0, other: 0 };
  const weights = { critical: 15, serious: 10, moderate: 5, minor: 2 };
  let penalty = 0;
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const issue of report.issues) {
    if (ids.has(issue.id)) throw new Error(`Duplicate finding ID: ${issue.id}`);
    ids.add(issue.id);
    if (issue.source !== "automated" && !issue.requiresHumanReview) throw new Error("Inferences, pending human findings and supplied-color calculations require human applicability review");
    if (issue.source !== "automated") continue;
    const key = JSON.stringify([issue.rule, issue.selector]);
    if (seen.has(key)) throw new Error(`Duplicate rule/selector finding: ${key}`);
    seen.add(key);
    summary.totalIssues++;
    summary[issue.severity]++;
    categories[issue.category === "best-practice" ? "bestPractice" : issue.category]++;
    penalty += weights[issue.severity];
  }
  const issues = [...report.issues].sort((a, b) => Number(b.taskCompletionRisk) - Number(a.taskCompletionRisk) || weights[b.severity] - weights[a.severity] || a.id.localeCompare(b.id));
  return AccessibilityReportSchema.parse({ ...report, issues, summary, categories, riskScore: Math.max(0, 100 - penalty), limitations: [...new Set([...limitations, ...report.limitations])] });
}
