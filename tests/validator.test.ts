import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { validateAccessibilityHtml as inspect, validateAccessibilityPage } from "../src/accessibility-validator.js";
const url = "https://example.com/";
const page = (body: string) => `<html lang="en"><head><title>Test</title></head><body>${body}</body></html>`;
test("static validator detects core missing structure and explains user impact", () => {
  const result = inspect('<html><img src="x"><input><button><svg></svg></button><a href="/x"></a><h1>Title</h1><h4>Details</h4></html>', url);
  for (const rule of ["document-language", "image-alt", "form-label", "button-name", "link-name", "heading-order"]) assert.ok(result.findings.some(f => f.rule === rule), rule);
  assert.equal(result.valid, false); assert.equal(result.issueCount, 6);
  assert.ok(result.findings.every(f => f.selector && f.userImpact && f.recommendation));
});
test("names support referenced and wrapping labels, ARIA, image alternatives and native defaults", () => {
  const result = inspect(page('<label for="a:b">Email</label><input id="a:b"><label>City<input></label><span id="first" hidden>First</span><span id="last">name</span><input aria-labelledby="first last"><input aria-label="Phone"><input type="hidden"><input type="submit"><button><img alt="Save" src="x"></button><a href="/x" title="Profile"></a><img alt="" src="x">'), url);
  assert.equal(result.findings.length, 0); assert.equal(result.valid, true); assert.ok(result.manualReview.length);
});
test("empty labels and hidden child text do not create a supported name", () => {
  const result = inspect(page('<label for="x"> </label><input id="x"><input aria-labelledby="missing"><button><span aria-hidden="true">Save</span></button><a href="/x"><svg></svg></a>'), url);
  assert.equal(result.findings.length, 4);
});

test("HTML labels name native buttons but not links or custom buttons", () => {
  const result = inspect(page('<label>Save<button></button></label><label for="native">Cancel</label><button id="native"></button><label for="link">Profile</label><a id="link" href="/profile"></a><label for="custom">Next</label><div id="custom" role="button" tabindex="0"></div>'), url);
  assert.deepEqual(result.findings.map(f => f.rule).sort(), ["button-name", "link-name"]);
});

test("labels target the first matching ID and first nested labelable element", () => {
  const result = inspect(page('<label for="duplicate">Email</label><span id="duplicate"></span><input id="duplicate"><label>Action<button></button><input></label>'), url);
  assert.deepEqual(result.findings.map(f => f.rule), ["form-label", "form-label"]);
});
test("warnings remain potential; warning suppression never removes detected failures or baseline review", () => {
  const html = page('<h1>Title</h1><h4>Section</h4><div role="button">Save</div><a href="/x">Click here</a><input>');
  const result = inspect(html, url);
  assert.equal(result.findings.filter(f => f.kind === "potential").length, 3);
  assert.ok(result.findings.filter(f => f.kind === "potential").every(f => f.requiresHumanReview));
  const suppressed = inspect(html, url, false);
  assert.equal(suppressed.findings.length, 1); assert.equal(suppressed.valid, false); assert.ok(suppressed.manualReview.length);
  assert.equal(inspect(page('<div role="button">Save</div>'), url).valid, true);
});
test("native focusability and explicit positive tabindex are not flagged as absent", () => {
  const result = inspect(page('<a href="/x" role="button">Action</a><button role="button">Save</button><div role="button" tabindex="1">Next</div><input hidden>'), url);
  assert.equal(result.findings.length, 0);
});
test("fetch failures never return valid and HTML retrieval records status", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/bad") {res.writeHead(404).end("Missing"); return;}
    if (req.url === "/json") {res.writeHead(200, {"Content-Type": "application/json"}).end("{}"); return;}
    res.writeHead(200, {"Content-Type": "text/html"}).end(page('<button>Save</button>'));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await validateAccessibilityPage(base)).valid, true);
    const bad = await validateAccessibilityPage(base + "/bad"); assert.equal(bad.statusCode, 404); assert.equal(bad.valid, false); assert.ok(bad.errors.length);
    assert.equal((await validateAccessibilityPage(base + "/json")).valid, false);
    assert.equal((await validateAccessibilityPage("file:///test.html")).valid, false);
  } finally {await new Promise<void>(resolve => server.close(() => resolve()));}
  const unavailable = await validateAccessibilityPage(base); assert.equal(unavailable.valid, false); assert.ok(unavailable.errors.length);
});
