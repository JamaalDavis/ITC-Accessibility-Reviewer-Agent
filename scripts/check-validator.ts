import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { accessibilityValidatorServer, type AccessibilityValidationResult } from "../src/accessibility-validator.js";
import { createSampleServer } from "../src/sample-pages.js";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const pages = createSampleServer();
const client = new Client({name: "validator-exercise", version: "1.0.0"});
try {
  await new Promise<void>((resolve, reject) => {pages.once("error", reject); pages.listen(0, "127.0.0.1", resolve);});
  const address = pages.address();
  if (!address || typeof address === "string") throw new Error("Sample server failed");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await accessibilityValidatorServer.instance.connect(serverTransport);
  await client.connect(clientTransport);
  assert.ok((await client.listTools()).tools.some(tool => tool.name === "validate_accessibility_page"));
  await mkdir("reports", {recursive: true});
  for (const sample of ["accessible", "issues", "severe"]) {
    const response = await client.callTool({name: "validate_accessibility_page", arguments: {url: `http://127.0.0.1:${address.port}/${sample}.html`, standard: "WCAG2.2-AA", includeWarnings: true}});
    assert.ok(!response.isError, JSON.stringify(response));
    const content = response.content as {type: string; text: string}[];
    const result = JSON.parse(content[0].text) as AccessibilityValidationResult;
    assert.equal(result.errors.length, 0); assert.ok(result.manualReview.length);
    assert.equal(result.valid, sample === "accessible");
    if (sample !== "accessible") assert.ok(result.findings.length >= 2);
    await writeFile(`reports/${sample}.validator.json`, JSON.stringify(result, null, 2));
    console.log(`${sample}: ${result.issueCount} findings, valid=${result.valid}; human review still required`);
  }
} finally {await client.close(); await new Promise<void>(resolve => pages.close(() => resolve()));}
