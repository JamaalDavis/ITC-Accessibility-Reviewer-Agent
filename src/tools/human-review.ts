import { z } from "zod";
export const HumanReviewInput = z.object({
  area: z.string().min(1), reason: z.string().min(1), suggestedMethod: z.string().min(1),
  affectedUsers: z.array(z.string().min(1)).min(1),
});
export function requestHumanReview(input: z.input<typeof HumanReviewInput>, id: string) {
  const values = HumanReviewInput.parse(input);
  return { id, ...values, status: "pending" as const, requiresHumanReview: true as const,
    routing: "local review queue; no external notification sent" };
}
