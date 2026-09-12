import { z } from "zod";
const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use opaque #RGB or #RRGGBB sRGB colors");
export const ContrastInput = z.object({
  foreground: hex.describe("Opaque foreground sRGB hex color; no alpha or gradients"),
  background: hex.describe("Opaque adjacent/background sRGB hex color"),
  textSize: z.number().positive().describe("Computed font size in CSS pixels; ignored for non-text"),
  fontWeight: z.number().min(1).max(1000).describe("Computed CSS font weight; 700 or more is treated as bold"),
  kind: z.enum(["text", "non-text", "focus-indicator"]).default("text"),
});
function luminance(hex: string): number {
  const digits = hex.slice(1);
  const expanded = digits.length === 3 ? [...digits].map(value => value + value).join("") : digits;
  const channels = [0, 2, 4].map(offset => {
    const value = parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function checkContrast(input: z.input<typeof ContrastInput>) {
  const values = ContrastInput.parse(input);
  const a = luminance(values.foreground), b = luminance(values.background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const isLargeText = values.kind === "text" && (values.textSize >= 24 || (values.textSize >= 14 * 96 / 72 && values.fontWeight >= 700));
  const requiredRatio = values.kind !== "text" || isLargeText ? 3 : 4.5;
  return { ...values, ratio, displayRatio: `${ratio.toFixed(2)}:1`, requiredRatio, passes: ratio >= requiredRatio,
    isLargeText, criterion: values.kind === "text" ? "1.4.3" : "1.4.11", method: "deterministic",
    requiresHumanReview: false, applicationRequiresHumanReview: true,
    limitations: ["Pass/fail applies only to this supplied opaque color pair, using the unrounded ratio.",
      "Confirm rendered colors, adjacency, applicability, exemptions and all interaction states. Alpha, gradients and image backgrounds are unsupported.",
      "A focus-indicator calculation tests only adjacent-color contrast, not visibility, obscuration, geometry or WCAG 2.4.13 Focus Appearance."] };
}
