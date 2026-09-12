import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAccessibilityTools, customToolNames } from "../src/tools/index.js";
import { createSampleServer } from "../src/sample-pages.js";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const pages = createSampleServer();
const client = new Client({name: "custom-tools-test", version: "1.0.0"});
try {
  await new Promise<void>((resolve, reject) => { pages.once("error", reject); pages.listen(0, "127.0.0.1", resolve); });
  const address = pages.address();
  if (!address || typeof address === "string") throw new Error("Sample server unavailable");
  const url = `http://127.0.0.1:${address.port}/checkout.html`;
  const context = createAccessibilityTools(url);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await context.server.instance.connect(serverTransport);
  await client.connect(clientTransport);
  const available = await client.listTools();
  assert.deepEqual(available.tools.map(tool => tool.name).sort(), [...customToolNames].sort());
  async function call(name: string, args: Record<string, unknown>) {
    const output = await client.callTool({name, arguments: args}, undefined, {timeout: 180000});
    assert.ok(!output.isError, JSON.stringify(output));
    return output;
  }
  await call("a11y_scan_page", {url, standard: "WCAG2.2-AA"});
  assert.ok(context.scan?.violations.some(issue => issue.rule === "color-contrast"));
  await call("a11y_check_contrast", {foreground: "#777777", background: "#FFFFFF", textSize: 16, fontWeight: 400, kind: "text"});
  await call("a11y_lookup_wcag", {criterion: "2.4.11"});
  await call("a11y_request_human_review", {area: "Checkout keyboard flow", reason: "A scan cannot verify task completion", suggestedMethod: "Complete the demo checkout with Tab, Shift+Tab, Enter and Space and review errors and announcements", affectedUsers: ["keyboard users", "screen reader users"]});
  assert.equal(context.audit.length, 4);
  assert.equal(context.humanReview[0].status, "pending");
  await mkdir("reports", {recursive: true});
  await writeFile("reports/custom-tools.audit.json", JSON.stringify(context.audit, null, 2));
  console.log("All four custom tools passed real MCP calls; checkout was scanned in Chrome. Audit: reports/custom-tools.audit.json");
} finally { await client.close(); await new Promise<void>(resolve => pages.close(() => resolve())); }
