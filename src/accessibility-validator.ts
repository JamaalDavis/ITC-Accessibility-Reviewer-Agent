import * as cheerio from "cheerio";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

// Stage 1: constrain inputs before fetching or inspecting a page.
export const validateAccessibilitySchema = {
  url: z.string().url().describe("HTTP(S) URL of the HTML page to inspect"),
  standard: z.literal("WCAG2.2-AA").default("WCAG2.2-AA").describe("Requested target; not a conformance claim"),
  includeWarnings: z.boolean().default(true).describe("Include potential concerns; essential manual review remains enabled"),
};
export interface AccessibilityFinding {
  rule: string; severity: "critical" | "serious" | "moderate" | "minor";
  category: "perceivable" | "operable" | "understandable" | "robust";
  element: string; selector: string; issue: string; userImpact: string; recommendation: string; automated: boolean;
  kind: "detected" | "potential"; requiresHumanReview: boolean;
}
export interface AccessibilityValidationResult {
  url: string; statusCode?: number; valid: boolean; issueCount: number;
  findings: AccessibilityFinding[]; manualReview: string[];
  summary: Record<AccessibilityFinding["severity"], number>; errors: string[];
  standard: "WCAG2.2-AA"; limitations: string[];
}
const manualChecks = [
  "Complete primary tasks using only a keyboard; check logical focus order, visible focus, obscuration and recovery.",
  "Test screen-reader interaction and dynamic announcements in all relevant states.",
  "Review image alternative text for contextual accuracy and usefulness, including decorative images.",
  "Evaluate error-message clarity, language clarity, cognitive load and task recovery with affected users.",
  "Check zoom, reflow, motion/animation and touch target usability in a rendered browser.",
];
function emptyResult(url: string): AccessibilityValidationResult {
  return {url, valid: false, issueCount: 0, findings: [], manualReview: [...manualChecks],
    summary: {critical: 0, serious: 0, moderate: 0, minor: 0}, errors: [], standard: "WCAG2.2-AA",
    limitations: ["valid means retrieval succeeded and no critical/serious detected structural findings; it does not mean accessible or WCAG conformant.",
      "Static source inspection only: JavaScript, CSS, browser layout and the full accessible-name algorithm are not evaluated. Naming checks recognize common HTML patterns only.",
      "Heading skips and custom-button tab order are potential concerns, not established WCAG failures. Warnings do not change valid."]};
}

// Stages 2–3: pure HTML inspection, separately testable from networking and Claude.
export function validateAccessibilityHtml(html: string, url: string, includeWarnings = true): AccessibilityValidationResult {
  const result = emptyResult(url);
  const $ = cheerio.load(html);
  type Element = ReturnType<typeof $>[number];
  const hidden = (el: Element) => $(el).closest('[hidden],[inert],[aria-hidden="true"],template').length > 0;
  const text = (el: Element, referenced = false): string => {
    const copy = $(el).clone();
    copy.find('script,style,template').remove();
    if (!referenced) copy.find('[hidden],[inert],[aria-hidden="true"]').remove();
    copy.find("img").each((_, image) => { $(image).replaceWith($("<span>").text($(image).attr("alt") || $(image).attr("aria-label") || "")); });
    return copy.text().replace(/\s+/g, " ").trim();
  };
  const name = (el: Element, content = false): string => {
    const node = $(el);
    const refs = (node.attr("aria-labelledby") || "").trim().split(/\s+/).filter(Boolean);
    const targets = refs.flatMap(id => $('[id]').toArray().filter(target => $(target).attr("id") === id).slice(0, 1));
    if (targets.length) return targets.map(target => text(target, true)).join(" ").trim();
    if (node.attr("aria-label")?.trim()) return node.attr("aria-label")!.trim();
    // Only native labelable elements participate in HTML label association.
    // A for attribute targets the first matching ID, even with duplicate IDs.
    const labelable = 'button,input:not([type="hidden"]),select,textarea,meter,output,progress';
    const labels = (node.is(labelable) ? $("label").toArray() : []).filter(label => {
      const htmlFor = $(label).attr("for");
      return htmlFor !== undefined
        ? Boolean(htmlFor) && $('[id]').toArray().find(target => $(target).attr("id") === htmlFor) === el
        : $(label).find(labelable).first()[0] === el;
    }).map(label => text(label)).join(" ").trim();
    if (labels) return labels;
    if (node.is('input[type="submit"],input[type="reset"]')) return node.attr("value")?.trim() || (node.attr("type") === "reset" ? "Reset" : "Submit");
    if (node.is('input[type="button"]') && node.attr("value")?.trim()) return node.attr("value")!.trim();
    if (node.is('input[type="image"],img') && node.attr("alt")?.trim()) return node.attr("alt")!.trim();
    return (content ? text(el) : "") || node.attr("title")?.trim() || "";
  };
  const selector = (el: Element) => {
    const parts: string[] = [];
    let current = $(el);
    while (current.length && current.prop("tagName")) {
      const tag = String(current.prop("tagName")).toLowerCase();
      parts.unshift(`${tag}:nth-of-type(${current.prevAll(tag).length + 1})`);
      current = current.parent();
    }
    return parts.join(" > ");
  };
  function add(el: Element, rule: string, severity: AccessibilityFinding["severity"], category: AccessibilityFinding["category"], issue: string, userImpact: string, recommendation: string, potential = false) {
    if (potential && !includeWarnings) return;
    result.findings.push({rule, severity, category, element: $.html(el).slice(0, 400), selector: selector(el), issue, userImpact, recommendation,
      automated: true, kind: potential ? "potential" : "detected", requiresHumanReview: potential});
    if (potential) result.manualReview.push(`${rule} at ${selector(el)}: ${recommendation}`);
  }
  if (!$("html").attr("lang")?.trim()) add($("html")[0], "document-language", "serious", "understandable", "The document does not declare a non-empty language.", "Screen readers may apply the wrong pronunciation rules.", "Set html lang to the appropriate document language and verify its accuracy.");
  $("img").each((_, el) => {
    if (hidden(el)) return;
    if ($(el).attr("alt") === undefined && !name(el) && !["none", "presentation"].includes($(el).attr("role") || "")) add(el, "image-alt", "serious", "perceivable", "No alt attribute or supported alternative naming mechanism was found.", "Blind users may miss information conveyed by the image.", "Provide context-appropriate alt text, or alt='' for a decorative image.");
  });
  $("input,select,textarea").each((_, el) => {
    if (hidden(el) || $(el).is('input[type="hidden"],input[type="submit"],input[type="reset"],input[type="button"],input[type="image"]')) return;
    if (!name(el)) add(el, "form-label", "serious", "perceivable", "No accessible name was found using supported static labeling patterns.", "Screen reader and voice-control users may not know the field's purpose.", "Associate a meaningful visible label using for/id or wrapping, or supply an appropriate ARIA name.");
  });
  $('button,[role="button"],input[type="submit"],input[type="reset"],input[type="button"],input[type="image"]').each((_, el) => {
    if (hidden(el)) return;
    if (!name(el, !$(el).is("input"))) add(el, "button-name", "serious", "robust", "No supported accessible name was found for this button.", "Screen reader users may not know what action the control performs.", "Provide meaningful button text or an appropriate accessible name.");
    if ($(el).attr("role") === "button" && !$(el).is('button,input,select,textarea,a[href],summary') && !$(el).is('[contenteditable="true"]')) {
      const tabindex = $(el).attr("tabindex");
      if (tabindex === undefined || !/^[+-]?\d+$/.test(tabindex.trim()) || Number(tabindex) < 0) add(el, "custom-button-keyboard", "serious", "operable", "The custom button has no non-negative static tabindex; keyboard behavior is unverified.", "Keyboard-only users may be unable to reach or activate this control.", "Prefer a native button; otherwise test focus management and Enter/Space behavior, including composite widget navigation.", true);
    }
  });
  $("a[href]").each((_, el) => {
    if (hidden(el)) return;
    const label = name(el, true);
    if (!label) add(el, "link-name", "serious", "operable", "No supported accessible name was found for this link.", "Screen reader users may not know the link's destination or purpose.", "Give the link meaningful text or an appropriate accessible name.");
    else if (/^(click here|here|read more|more|learn more)$/i.test(label)) add(el, "link-purpose", "moderate", "operable", "The link name may require surrounding context to explain its purpose.", "People scanning a list of links may have difficulty distinguishing destinations.", "Review the link's programmatic context and make its purpose understandable.", true);
  });
  let previous = 0;
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    if (hidden(el)) return;
    const level = Number(String($(el).prop("tagName")).slice(1));
    if (previous && level > previous + 1) add(el, "heading-order", "moderate", "perceivable", `Heading structure skips from H${previous} to H${level}.`, "Heading navigation may give users a confusing content outline.", "Review the hierarchy and choose heading levels that reflect the content structure.", true);
    previous = level;
  });
  result.manualReview.push("Verify declared language, heading semantics, CSS visibility and accessible names in the rendered accessibility tree.");
  result.issueCount = result.findings.length;
  for (const finding of result.findings) result.summary[finding.severity]++;
  result.valid = !result.findings.some(finding => finding.kind === "detected" && ["critical", "serious"].includes(finding.severity));
  return result;
}

// Stage 4: retrieve HTML with bounded time and explicit failure states.
export async function validateAccessibilityPage(url: string, options: {standard?: "WCAG2.2-AA"; includeWarnings?: boolean} = {}): Promise<AccessibilityValidationResult> {
  const result = emptyResult(url);
  try {
    const args = z.object(validateAccessibilitySchema).parse({url, ...options});
    const target = new URL(args.url);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("Use an HTTP(S) URL without embedded credentials");
    const response = await fetch(target, {signal: AbortSignal.timeout(15000)});
    result.statusCode = response.status;
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Page returned HTTP ${response.status}`); }
    if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw new Error("Response is not identified as HTML"); }
    const html = await response.text();
    return {...validateAccessibilityHtml(html, url, args.includeWarnings), statusCode: response.status};
  } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); return result; }
}

// Stage 5: expose the handler through the Claude Agent SDK.
export const accessibilityValidatorServer = createSdkMcpServer({name: "accessibility-validator", version: "1.0.0", tools: [
  tool("validate_accessibility_page", "Inspect fetched HTML deterministically for common document-language, image-alternative, form-label, button/link-name, heading and custom-control patterns. Use for early source review, not rendered-browser testing. Potential concerns are marked separately. This limited static checker does not compute the full accessible-name algorithm, execute JavaScript, measure contrast, prove keyboard usability or establish WCAG conformance. Human review is always returned. valid only describes this checker's detected high-severity findings and successful retrieval.",
    // SDK strict tool schemas require defaults to be supplied explicitly on the wire.
    {...validateAccessibilitySchema, standard: z.literal("WCAG2.2-AA"), includeWarnings: z.boolean()},
    async args => {
      const result = await validateAccessibilityPage(args.url, args);
      return {isError: result.errors.length > 0, content: [{type: "text", text: JSON.stringify(result, null, 2)}]};
    })
]});
