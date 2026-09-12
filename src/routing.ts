import { randomBytes } from "node:crypto";

export interface RoutingSignals {
  finding_id: string;
  issue_category: string;
  rule: string;
  findings_below_threshold: readonly string[];
  reviewer_disagreements: readonly string[];
  integration_failures: readonly string[];
}
export interface AccessibilityRoutingDecision extends RoutingSignals {
  decision: "auto_approve" | "spot_check" | "human_review";
  reason: string;
}

export function route_accessibility_finding(input: RoutingSignals): AccessibilityRoutingDecision {
  const reasons = [
    input.findings_below_threshold.length ? "low_confidence" : "",
    input.reviewer_disagreements.length ? "reviewer_disagreement" : "",
    input.integration_failures.length ? "integration_failure" : "",
  ].filter(Boolean);
  return { ...input, findings_below_threshold: [...input.findings_below_threshold],
    reviewer_disagreements: [...input.reviewer_disagreements], integration_failures: [...input.integration_failures],
    decision: reasons.length ? "human_review" : "auto_approve", reason: reasons.join(", ") };
}

function probability(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} must be between 0 and 1`);
}

export function apply_stratified_spot_check(
  decisions: readonly AccessibilityRoutingDecision[], sample_pct: number, seed?: number,
): AccessibilityRoutingDecision[] {
  probability(sample_pct, "sample_pct");
  if (seed !== undefined && !Number.isSafeInteger(seed)) throw new RangeError("seed must be a safe integer");
  // Local Mulberry32 PRNG: reproducible TS equivalent of an isolated Random(seed).
  let state = seed === undefined ? randomBytes(4).readUInt32LE() : seed >>> 0;
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const buckets = new Map<string, number[]>();
  decisions.forEach((item, index) => {
    if (item.decision !== "auto_approve") return;
    const bucket = buckets.get(item.issue_category) ?? [];
    bucket.push(index); buckets.set(item.issue_category, bucket);
  });
  const promoted = new Set<number>();
  for (const indices of buckets.values()) {
    const count = Math.max(1, Math.ceil(sample_pct * indices.length));
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
      promoted.add(indices[i]);
    }
  }
  return decisions.map((item, index) => promoted.has(index)
    ? { ...item, decision: "spot_check", reason: "stratified_spot_check" } : item);
}

export interface CalibrationLabel {
  issue_category: string;
  rule: string;
  predicted_confidence: number;
  correct: boolean;
}
export interface CalibrationCell {
  issue_category: string;
  rule: string;
  samples: number;
  mean_predicted_confidence: number;
  observed_accuracy: number;
  brier_score: number;
}
export interface CalibrationReport { cells: CalibrationCell[]; overall_brier: number; }

export function calibration_report(labels: readonly CalibrationLabel[] = []): CalibrationReport {
  const buckets = new Map<string, CalibrationLabel[]>();
  for (const label of labels) {
    probability(label.predicted_confidence, "predicted_confidence");
    if (typeof label.correct !== "boolean") throw new TypeError("correct must be a human correctness label");
    const key = JSON.stringify([label.issue_category, label.rule]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(label); buckets.set(key, bucket);
  }
  let total = 0;
  const cells = [...buckets.values()].map(bucket => {
    const samples = bucket.length;
    const squaredError = bucket.reduce((sum, item) => sum + (item.predicted_confidence - Number(item.correct)) ** 2, 0);
    total += squaredError;
    return { issue_category: bucket[0].issue_category, rule: bucket[0].rule, samples,
      mean_predicted_confidence: bucket.reduce((sum, item) => sum + item.predicted_confidence, 0) / samples,
      observed_accuracy: bucket.filter(item => item.correct).length / samples, brier_score: squaredError / samples };
  });
  return { cells, overall_brier: labels.length ? total / labels.length : 0 };
}
