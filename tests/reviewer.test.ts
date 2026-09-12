import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SDKMessage, McpSdkServerConfigWithInstance, query } from "@anthropic-ai/claude-agent-sdk";
import { reviewAccessibility } from "../src/accessibility-reviewer.js";
const url = "https://example.com/checkout";
test("a validation repair resumes the session and preserves real tool evidence", async () => {
  let attempts = 0, scans = 0;
  let scanId = "", humanId = "";
  const fakeQuery = async function* (args: Parameters<typeof query>[0]): AsyncGenerator<SDKMessage> {
    attempts++;
    if (attempts === 2) assert.equal(args.options?.resume, "test-session");
    yield {type: "system", subtype: "init", mcp_servers: [{name: "accessibility", status: "connected"}]} as SDKMessage;
    const server = args.options?.mcpServers?.accessibility as McpSdkServerConfigWithInstance;
    const client = new Client({name: "repair-test", version: "1.0.0"});
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.instance.connect(serverTransport); await client.connect(clientTransport);
      async function call(name: string, input: Record<string, unknown>) {
        const result = await client.callTool({name, arguments: input});
        assert.ok(!result.isError);
        const content = result.content as {type: string; text: string}[];
        return JSON.parse(content[0].text) as {evidenceId: string};
      }
      if (attempts === 1) {
        scanId = (await call("a11y_scan_page", {url, standard: "WCAG2.2-AA"})).evidenceId;
        await call("a11y_lookup_wcag", {criterion: "4.1.2"});
        humanId = (await call("a11y_request_human_review", {area: "Form usability", reason: "Check field purpose in context", suggestedMethod: "Complete form with a screen reader", affectedUsers: ["screen reader users"]})).evidenceId;
      }
      const draft = {target: url, standard: "WCAG 2.2 AA", issues: [{
        id: "label-1", rule: "label", wcagCriteria: ["4.1.2"], severity: "critical", category: "robust", element: "<input>", selector: "input", issue: "Missing name", source: "automated", affectedUsers: ["screen reader users"], userImpact: "The purpose may not be announced", remediation: "Associate a visible label", evidence: "axe label", evidenceIds: attempts === 1 ? [scanId] : [scanId, humanId], confidence: "high", requiresHumanReview: true, taskCompletionRisk: true,
      }], recommendations: ["Label the input", "Check keyboard flow", "Test with a screen reader"], limitations: ["Single page state"]};
      yield {type: "result", subtype: "success", is_error: false, permission_denials: [], session_id: "test-session", structured_output: draft} as unknown as SDKMessage;
    } finally { await client.close(); }
  };
  const report = await reviewAccessibility(url, {dependencies: {query: fakeQuery,
    independentReview: async report => ({ findings: report.issues.map(issue => ({ finding_id: issue.id, agrees: false, reason: "Source evidence is insufficient" })) }),
    scanPage: async () => {
    scans++;
    return {target: url, standard: "WCAG2.2-AA", violations: [{rule: "label", selector: "input", severity: "critical", wcagCriteria: ["4.1.2"]}], incomplete: [], rawEvidence: "label on input", limitation: "test fixture"};
  }}});
  assert.equal(attempts, 2); assert.equal(scans, 1);
  assert.equal(report.validationErrors.length, 1); assert.equal(report.riskScore, 85);
  assert.deepEqual(report.issues[0].evidenceIds, [scanId, humanId]);
  assert.equal(report.routing[0].decision, "human_review");
  assert.equal(report.routing[0].reason, "low_confidence, reviewer_disagreement");
});
test("validation repairs stop after three attempts", async () => {
  let attempts = 0;
  const fakeQuery = async function* (): AsyncGenerator<SDKMessage> {
    attempts++;
    yield {type: "system", subtype: "init", mcp_servers: [{name: "accessibility", status: "connected"}]} as SDKMessage;
    yield {type: "result", subtype: "success", is_error: false, permission_denials: [], session_id: "test-session"} as unknown as SDKMessage;
  };
  await assert.rejects(reviewAccessibility(url, {dependencies: {query: fakeQuery}}), /No successful accessibility scan/);
  assert.equal(attempts, 3);
});
