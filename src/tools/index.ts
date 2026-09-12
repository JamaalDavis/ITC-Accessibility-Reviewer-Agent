import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ScanInput, scanPage } from "./scan.js";
import { ContrastInput, checkContrast } from "./contrast.js";
import { WcagInput, lookupWcag } from "./wcag.js";
import { HumanReviewInput, requestHumanReview } from "./human-review.js";
export const customToolNames = ["a11y_scan_page", "a11y_check_contrast", "a11y_lookup_wcag", "a11y_request_human_review"] as const;
export type CustomToolName = typeof customToolNames[number];
export const allowedCustomTools = customToolNames.map(name => `mcp__accessibility__${name}`);
export interface AuditRecord { id: string; timestamp: string; tool: CustomToolName; input: unknown; status: "success" | "error"; result: unknown; }
export function createAccessibilityTools(target: string, dependencies = { scanPage }) {
  const audit: AuditRecord[] = [];
  const humanReview: ReturnType<typeof requestHumanReview>[] = [];
  let scan: Awaited<ReturnType<typeof scanPage>> | undefined;
  let sequence = 0;
  async function invoke(name: CustomToolName, input: unknown) {
    const id = `evidence-${++sequence}`;
    try {
      let result: unknown;
      switch (name) {
        case "a11y_scan_page": {
          const args = ScanInput.parse(input);
          if (args.url !== target) throw new Error("Scanner target must match the requested review URL");
          scan = await dependencies.scanPage(args); result = scan; break;
        }
        case "a11y_check_contrast": result = checkContrast(ContrastInput.parse(input)); break;
        case "a11y_lookup_wcag": result = lookupWcag(WcagInput.parse(input)); break;
        case "a11y_request_human_review": {
          const entry = requestHumanReview(HumanReviewInput.parse(input), id);
          humanReview.push(entry); result = entry; break;
        }
      }
      audit.push({ id, timestamp: new Date().toISOString(), tool: name, input, status: "success", result });
      console.error(`[Evidence] ${id}: ${name} completed`);
      return { evidenceId: id, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      audit.push({ id, timestamp: new Date().toISOString(), tool: name, input, status: "error", result: { error: message } });
      throw error;
    }
  }
  function define<T extends z.ZodRawShape>(name: CustomToolName, description: string, shape: T) {
    return tool(name, description, shape, async input => {
      try { return { content: [{ type: "text" as const, text: JSON.stringify(await invoke(name, input)) }] }; }
      catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] }; }
    });
  }
  function makeServer() { return createSdkMcpServer({ name: "accessibility", version: "1.0.0", tools: [
    define("a11y_scan_page", "Run automated axe accessibility testing through a connected MCP scanner for the exact HTTP(S) review URL and WCAG2.2-AA target. Returns detected violations, incomplete results and raw evidence. Use before reporting page failures. Does not establish WCAG conformance, keyboard workflow usability or unvisited states. Errors and truncated results must not be scored.", ScanInput.shape),
    define("a11y_check_contrast", "Calculate an exact sRGB contrast ratio in code for supplied opaque hex colors. Use for text, meaningful icons/components or adjacent focus indicator colors; never estimate visually. Text AA thresholds depend on CSS pixel size and weight. Non-text uses the 1.4.11 3:1 threshold, not every border or focus geometry. Reject alpha/gradients. Pass/fail is only for supplied values: page applicability, adjacency and states require review. Do not invent color inputs. Supply kind explicitly.", { ...ContrastInput.shape, kind: z.enum(["text", "non-text", "focus-indicator"]) }),
    define("a11y_lookup_wcag", "Retrieve W3C WCAG 2.2 metadata from a dated local W3C snapshot: number, exact name, level, principle, active/removed status and normative/Understanding links. Use before attributing a criterion or interpreting a scanner WCAG tag. Unknown criteria error. Not a live crawl, full criterion text or conformance decision. 2.4.11 concerns obscuration, not focus appearance.", WcagInput.shape),
    define("a11y_request_human_review", "Record a pending evaluation in the local queue: area, reason, specific suggested method and affected users. Use for axe incomplete results, inferred concerns, keyboard/task flows, screen readers and contextual judgments. Include rule and selector in reasons for scanner incomplete entries. Does not perform a human test, contact a reviewer or create an external ticket.", HumanReviewInput.shape),
  ] }); }
  return { get server() { return makeServer(); }, audit, humanReview, invoke, get scan() { return scan; } };
}
