import { readFileSync } from "node:fs";
import { z } from "zod";
const Entry = z.object({ criterion: z.string(), name: z.string(), level: z.enum(["A", "AA", "AAA"]).nullable(),
  principle: z.enum(["Perceivable", "Operable", "Understandable", "Robust"]), status: z.enum(["active", "removed"]), source: z.string().url(), understanding: z.string().url() });
const catalog = z.object({ source: z.string().url(), retrievedAt: z.string(), entries: z.array(Entry) }).parse(JSON.parse(readFileSync(new URL("../data/wcag22.json", import.meta.url), "utf8")));
export const WcagInput = z.object({ criterion: z.string().regex(/^[1-4]\.\d+\.\d+$/).describe("Exact WCAG 2.2 success criterion number, e.g. 2.4.11") });
export function lookupWcag(input: z.input<typeof WcagInput>) {
  const { criterion } = WcagInput.parse(input);
  const entry = catalog.entries.find(value => value.criterion === criterion);
  if (!entry) throw new Error(`Unknown WCAG 2.2 criterion: ${criterion}. Do not invent criterion metadata.`);
  return { ...entry, standard: "WCAG 2.2", retrievedAt: catalog.retrievedAt, retrievalMethod: "bundled W3C metadata snapshot",
    withinAATarget: entry.status === "active" && entry.level !== "AAA",
    limitation: "Metadata and supporting links, not a full interpretation or conformance assessment. Snapshot is dated; follow W3C links for current supporting guidance." };
}
