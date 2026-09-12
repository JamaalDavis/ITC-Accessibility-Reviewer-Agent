import { reviewAccessibility } from "./accessibility-reviewer.js";
import { randomUUID } from "node:crypto";

const target = process.argv[2];
if (!target || process.argv.includes("--help")) {
  console.error("Usage: npm run review -- http://127.0.0.1:3000/issues.html");
  process.exitCode = target ? 0 : 1;
} else {
  try { console.log(JSON.stringify(await reviewAccessibility(target, { auditPath: `reports/review-${randomUUID()}.audit.json` }), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
