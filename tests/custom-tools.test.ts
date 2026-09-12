import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContrast } from "../src/tools/contrast.js";
import { lookupWcag } from "../src/tools/wcag.js";
import { createAccessibilityTools } from "../src/tools/index.js";
import { verifyToolEvidence } from "../src/tool-evidence.js";
import type { AccessibilityReport } from "../src/report.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const pair = {foreground: "#000", background: "#fff", textSize: 16, fontWeight: 400};
test("registered contrast schema executes over MCP with an explicit scope", async () => {
  const context = createAccessibilityTools("https://example.com/");
  const client = new Client({name: "schema-regression", version: "1.0.0"});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await context.server.instance.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({name: "a11y_check_contrast", arguments: {...pair, kind: "text"}});
    assert.ok(!result.isError);
    assert.equal(context.audit.length, 1);
    assert.equal((context.audit[0].result as {ratio: number}).ratio, 21);
    const invalid = await client.callTool({name: "a11y_check_contrast", arguments: {...pair, kind: "all"}});
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});
test("contrast math is deterministic with exact endpoints and symmetric colors", () => {
  assert.equal(checkContrast(pair).ratio, 21);
  assert.equal(checkContrast({...pair, foreground: "#fff"}).ratio, 1);
  assert.equal(checkContrast({...pair, foreground: "#fff", background: "#000"}).ratio, 21);
  assert.equal(checkContrast({...pair, foreground: "#767676"}).passes, true);
  assert.equal(checkContrast({...pair, foreground: "#777777"}).passes, false);
});
test("large text uses the exact 14pt CSS conversion; non-text is separate", () => {
  assert.equal(checkContrast({...pair, textSize: 18.66, fontWeight: 700}).requiredRatio, 4.5);
  assert.equal(checkContrast({...pair, textSize: 14 * 96 / 72, fontWeight: 700}).requiredRatio, 3);
  assert.equal(checkContrast({...pair, textSize: 24}).requiredRatio, 3);
  assert.equal(checkContrast({...pair, kind: "non-text"}).criterion, "1.4.11");
  assert.equal(checkContrast({...pair, kind: "focus-indicator"}).applicationRequiresHumanReview, true);
});
test("reject unsupported colors and impossible sizes", () => {
  for (const foreground of ["red", "#ffffff80", "rgba(0,0,0,.5)", "#12", "#ggg"]) assert.throws(() => checkContrast({...pair, foreground}));
  assert.throws(() => checkContrast({...pair, textSize: 0}));
  assert.throws(() => checkContrast({...pair, fontWeight: NaN}));
});
test("W3C retrieval distinguishes obscuration, appearance, removed and unknown criteria", () => {
  assert.equal(lookupWcag({criterion: "2.4.11"}).name, "Focus Not Obscured (Minimum)");
  assert.equal(lookupWcag({criterion: "2.4.11"}).level, "AA");
  assert.equal(lookupWcag({criterion: "2.4.13"}).withinAATarget, false);
  assert.equal(lookupWcag({criterion: "4.1.1"}).status, "removed");
  assert.equal(lookupWcag({criterion: "3.3.8"}).name, "Accessible Authentication (Minimum)");
  assert.throws(() => lookupWcag({criterion: "2.4.99"}));
});
test("custom handlers validate inputs, record failures and keep human work pending per session", async () => {
  const context = createAccessibilityTools("https://example.com/");
  await assert.rejects(context.invoke("a11y_scan_page", {url: "https://different.example/", standard: "WCAG2.2-AA"}));
  await assert.rejects(context.invoke("a11y_check_contrast", {...pair, foreground: "red"}));
  await context.invoke("a11y_check_contrast", pair);
  await context.invoke("a11y_lookup_wcag", {criterion: "1.4.3"});
  await context.invoke("a11y_request_human_review", { area: "Keyboard", reason: "Workflow requires interaction", suggestedMethod: "Complete checkout using Tab, Shift+Tab, Enter and Space", affectedUsers: ["keyboard users"] });
  assert.equal(context.audit.filter(item => item.status === "error").length, 2);
  assert.equal(context.humanReview[0].status, "pending");
  assert.equal(context.humanReview[0].requiresHumanReview, true);
  assert.equal(createAccessibilityTools("https://example.com/").humanReview.length, 0);
});
test("report requires retrieved standards and a real pending review for inferred concerns", async () => {
  const context = createAccessibilityTools("https://example.com/");
  const calc = await context.invoke("a11y_check_contrast", {...pair, foreground: "#777"});
  const report = { issues: [{ id: "contrast", source: "deterministic", wcagCriteria: ["1.4.3"], evidenceIds: [calc.evidenceId], requiresHumanReview: true }] } as AccessibilityReport;
  assert.throws(() => verifyToolEvidence(report, context.audit), /retrieved/);
  await context.invoke("a11y_lookup_wcag", {criterion: "1.4.3"});
  assert.throws(() => verifyToolEvidence(report, context.audit), /not queued/);
  const review = await context.invoke("a11y_request_human_review", {area: "Contrast applicability", reason: "Verify supplied color pair", suggestedMethod: "Inspect all rendered states", affectedUsers: ["low vision users"]});
  report.issues[0].evidenceIds.push(review.evidenceId);
  assert.doesNotThrow(() => verifyToolEvidence(report, context.audit));
  assert.ok(report.issues[0].evidence.includes('"ratio":'));
});
