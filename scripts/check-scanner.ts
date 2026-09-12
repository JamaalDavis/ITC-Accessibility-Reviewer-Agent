import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpServersConfig } from "../src/config/mcp.config.js";
import { createSampleServer } from "../src/sample-pages.js";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { parseScanEvidence } from "../src/scan-evidence.js";

const server = createSampleServer();
const client = new Client({ name: "accessibility-reviewer-smoke-test", version: "1.0.0" });
try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sample server failed");
  const config = mcpServersConfig.a11y;
  await client.connect(new StdioClientTransport({ command: config.command, args: config.args, env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), ...config.env } }));
  const { tools } = await client.listTools();
  if (!tools.some(tool => tool.name === "scan_accessibility")) throw new Error("Scanner tool missing");
  await mkdir("reports", { recursive: true });
  for (const sample of ["accessible", "issues", "severe"]) {
    const result = await client.callTool({ name: "scan_accessibility", arguments: { url: `http://127.0.0.1:${address.port}/${sample}.html` } }, undefined, { timeout: 120000 });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    const content = result.content as { type: string; text?: string }[];
    const evidence = parseScanEvidence(content.map(item => item.text || "").join("\n"));
    if (sample === "accessible") assert.equal(evidence.violations.length, 0);
    else assert.ok(evidence.violations.length >= 3, `${sample} should expose multiple barriers`);
    if (sample === "severe") assert.ok(evidence.violations.some(issue => ["critical", "serious"].includes(issue.severity)));
    await writeFile(`reports/${sample}.scan.json`, JSON.stringify(result, null, 2));
    console.log(`${sample}: scan completed; raw evidence in reports/${sample}.scan.json`);
  }
} finally { await client.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
