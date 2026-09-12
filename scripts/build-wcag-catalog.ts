import { readFile, writeFile } from "node:fs/promises";
const html = await readFile("src/data/wcag22-source.html", "utf8");
const entries = [...html.matchAll(/<section id="([^"]+)"[^>]*><div class="header-wrapper"><h4[^>]*><bdi class="secno">Success Criterion ([1-4]\.\d+\.\d+) <\/bdi>(.*?)<\/h4>([\s\S]*?)(?=<section|$)/g)].map(match => {
  const level = match[4].match(/class="conformance-level">\(Level (A+)\)/)?.[1];
  const name = match[3].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
  return { criterion: match[2], name, level: level ?? null,
    principle: ["Perceivable", "Operable", "Understandable", "Robust"][Number(match[2][0]) - 1],
    status: level ? "active" : "removed", source: `https://www.w3.org/TR/WCAG22/#${match[1]}`,
    understanding: `https://www.w3.org/WAI/WCAG22/Understanding/${match[1]}.html` };
});
if (entries.length !== 87 || entries.filter(entry => entry.status === "active").length !== 86) throw new Error(`Unexpected WCAG catalog: ${entries.length} entries`);
await writeFile("src/data/wcag22.json", JSON.stringify({ source: "https://www.w3.org/TR/WCAG22/", retrievedAt: new Date().toISOString(), entries }, null, 2) + "\n");
console.log(`Saved ${entries.length} WCAG entries including removed Parsing criterion.`);
