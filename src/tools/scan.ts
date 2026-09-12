import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { mcpServersConfig } from "../config/mcp.config.js";
import { parseScanEvidence } from "../scan-evidence.js";
export const ScanInput = z.object({ url: z.string().url(), standard: z.literal("WCAG2.2-AA") });
export async function scanPage(input: z.input<typeof ScanInput>) {
  const { url, standard } = ScanInput.parse(input);
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("Scan requires an HTTP(S) URL without credentials");
  const client = new Client({ name: "a11y-custom-tools", version: "1.0.0" });
  const config = mcpServersConfig.a11y;
  const transport = new StdioClientTransport({ command: config.command, args: config.args,
    env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), ...config.env } });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    if (!tools.some(tool => tool.name === "scan_accessibility")) throw new Error("Connected scanner lacks scan_accessibility");
    console.error("[MCP scanner] connected; scan_accessibility verified");
    const result = await client.callTool({ name: "scan_accessibility", arguments: { url } }, undefined, { timeout: 120000 });
    const content = z.array(z.object({ type: z.string(), text: z.string().optional() })).parse(result.content);
    const rawEvidence = content.flatMap(block => block.type === "text" ? [block.text ?? ""] : []).join("\n");
    if (result.isError) throw new Error(rawEvidence);
    const evidence = parseScanEvidence(rawEvidence);
    return { target: url, standard, violations: evidence.violations, incomplete: evidence.manual, rawEvidence,
      limitation: "Single rendered page state. Automated results do not establish conformance. The upstream server returns pass counts, not full passed-rule evidence." };
  } finally { await client.close(); await transport.close(); }
}
