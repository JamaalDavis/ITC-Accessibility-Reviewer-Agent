import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function createSampleServer() {
  return createServer(async (request, response) => {
    const name = new URL(request.url || "/", "http://localhost").pathname.slice(1) || "accessible.html";
    if (!["accessible.html", "issues.html", "severe.html", "checkout.html"].includes(name)) {
      response.writeHead(404).end("Not found"); return;
    }
    try {
      const html = await readFile(new URL(`./sample-pages/${name}`, import.meta.url));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    } catch { response.writeHead(500).end("Unable to load sample"); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createSampleServer();
  server.on("error", error => { console.error(error.message); process.exitCode = 1; });
  server.listen(3000, "127.0.0.1", () => console.log("Samples: http://127.0.0.1:3000/{accessible,issues,severe,checkout}.html"));
}
