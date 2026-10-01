# Accessibility Reviewer Agent

The review agents follow an [accessibility-driven development workflow](docs/accessibility-driven-development.md):
define user outcomes and independent requirements, propose meaningful regression
tests, and distinguish automated evidence from pending assistive-technology and
human validation. Passing AI-generated tests does not establish accessibility.

## Python accessibility governance exercise

The standalone `accessibility_agent/` package implements deterministic release
interception, structured human-review handoffs, prerequisite and critical-issue
closure gates, and an offline hooks-versus-prompts comparison. See
[setup, commands, and measurement limits](docs/accessibility-governance.md).

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -e '.[test]'
.venv/Scripts/pytest tests/
.venv/Scripts/accessibility-agent compare --offline
```

## Accessible Design System — v0 MVP

Run `npm run dev`, then open **http://127.0.0.1:5173**. This local browser app needs Node.js 22+ and no API keys. The existing reviewer commands below continue to work separately.

- Overview dashboard, searchable semantic tokens, and calculated contrast pairs.
- Light, dark, and high-contrast themes plus OS forced-colors styling.
- Active-theme JSON export using DTCG 2025.10 color values and primitive → semantic → component aliases.
- Simulated streaming chat with sentence announcements, pause/resume, stop, regenerate, and copy.
- Simulated voice interaction with pressed state, cancellation, and a sample transcript; no microphone capture.
- Five manual verification checks, browser-local progress and notes, and JSON checklist export.

Implementation lives in `design-system/`; the dependency-free preview server is `scripts/serve-design-system.mjs`. Set `PORT` to change its default port. Theme and checklist storage are local to the browser; exports provide portable copies. Chat responses are fixed demo content.

### MVP verification

With the preview server running, run `npm run test:ui`. Tests use Playwright Core and axe-core. If a compatible browser is not installed, run `npx playwright-core install chromium`, or set `BROWSER_EXECUTABLE` to an existing Chromium executable. Test output and screenshots are saved to `reports/design-system/`.

The checks cover 21 color pairs, token aliases, axe scans of five screens across three themes, chat and voice states, downloads, local persistence, mobile overflow, and keyboard focus in forced colors. Automated checks do not establish conformance. Native screen reader testing, 200% text resizing, custom text spacing, and evaluation with disabled users remain manual tasks. No Figma file, live AI integration, or ACR certification is included in this v0.

References: [DTCG format 2025.10](https://www.designtokens.org/tr/2025.10/format/) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

---

Build an accessibility agent with four custom tools. Code handles scanning, contrast math, WCAG retrieval and a pending human-review queue; Claude explains evidence, affected users and remediation priorities. Automated results never establish full accessibility or WCAG conformance.

## Run in PowerShell

Requires Node.js 22+, Google Chrome (or `CHROME_PATH` pointing to Chromium), and Anthropic authentication for the agent. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`, or use an existing supported Claude Code login. Model calls may incur charges. Keep credentials out of reports and source control.

```powershell
cd "C:\Users\callm\OneDrive\Documents\Accessibility Reviewer Agent"
npm ci
npm run samples
```

Leave that terminal running. In a second terminal:

```powershell
cd "C:\Users\callm\OneDrive\Documents\Accessibility Reviewer Agent"
npm run review -- http://127.0.0.1:3000/checkout.html
```

Use the plain URL, without Markdown brackets or parentheses. Restart `npm run samples` after updating the project so the new checkout route is available. Reviews may take several minutes. Each CLI run saves an audit and pending queue under `reports/review-<id>.audit.json`, including failed runs. The final JSON report goes to stdout; progress goes to stderr.

To save clean JSON without npm's script banner:

```powershell
npx tsx src/index.ts http://127.0.0.1:3000/checkout.html > reports/checkout.json
```

The sample server binds to loopback and serves only the four fixtures. The checkout is a demonstration and makes no purchases. Scan HTTP(S) URLs you are authorized to test. Authenticated browser sessions and full multi-step workflows are not configured by this starter.

## Static HTML validator exercise

The additional exercise implementation is in `src/accessibility-validator.ts`. It exports `validateAccessibilitySchema`, `validateAccessibilityPage(url, options?)`, the pure `validateAccessibilityHtml` helper, result interfaces and `accessibilityValidatorServer`. The SDK tool name is `mcp__accessibility-validator__validate_accessibility_page` when registered under that server name.

Run `npm start` to fetch all three original samples through this custom SDK/MCP tool and save `reports/*.validator.json`. This exercise needs neither Chrome nor Claude credentials. `src/index.ts` continues to run the existing four-tool agent; it was not modified for this exercise.

The validator uses Cheerio and common static naming patterns. It recognizes explicit/wrapping labels, resolved ARIA name references, native submit/reset defaults, image alternatives in link/button content and title fallback. Hidden source elements are excluded where identifiable from HTML. It does not implement the full accessible-name algorithm or evaluate CSS and JavaScript. Rendered-browser validation remains necessary.

`includeWarnings=false` suppresses potential concerns, not detected failures or baseline manual-review guidance. Heading skips, vague links and custom buttons without a non-negative static tabindex are marked `kind: potential` and require human review. `automated: true` means code observed the pattern, not that a WCAG violation was established. Summary counts include all returned findings; `valid` requires successful retrieval and no detected critical/serious findings. It never means WCAG conformance. HTTP, content-type and network errors return `valid:false` with errors.

Agent registration example:

```ts
import { accessibilityValidatorServer } from "./accessibility-validator.js";
// In query() options:
// mcpServers: { "accessibility-validator": accessibilityValidatorServer }
// allowedTools: ["mcp__accessibility-validator__validate_accessibility_page"]
```

Supply `url`, `standard: "WCAG2.2-AA"` and `includeWarnings` explicitly in MCP calls. The direct function has defaults. Model selection is irrelevant to this deterministic exercise runner; an optional Claude caller can use `process.env.ANTHROPIC_MODEL` in its query options.

## Four custom tools (browser-based reviewer)

| Tool | Application code does | Boundary |
| --- | --- | --- |
| `a11y_scan_page` | Connects to the installed axe/Playwright MCP scanner; verifies tool discovery and scans the requested URL | One rendered state; incomplete results require human review |
| `a11y_check_contrast` | Computes sRGB relative luminance and unrounded contrast ratios | Opaque supplied colors only; page applicability is a separate judgment |
| `a11y_lookup_wcag` | Retrieves criterion name, level, principle, status and W3C links from a dated metadata snapshot | Metadata retrieval, not a live crawl or complete interpretation |
| `a11y_request_human_review` | Adds a pending entry to the local review queue | Does not perform testing, contact anyone or create an external ticket |

Definitions and handlers are in `src/tools/`. The Claude Agent SDK registers them in an in-process MCP server named `accessibility`, so Claude sees names such as `mcp__accessibility__a11y_check_contrast`. The scan handler is itself an MCP client to `accessibility-scanner-mcp`; this joins the custom-tools and MCP lessons without replacing the scanner with model judgment.

The SDK is scoped to a task-specific system prompt and these four tools. Unrelated settings, automatic cloud connectors and built-in tools are disabled for this subprocess. Standard context is requested. API failures, including errors carried in a `success` result event, are surfaced with credential redaction.

## Evidence and report

Every `issues` entry has an ID, rule, supplied/supported `wcagCriteria`, severity, category, selector/HTML, source, affected users, `userImpact`, `remediation`, evidence description, tool `evidenceIds`, confidence, human-review flag and provisional task-completion priority.

Sources are `automated`, `deterministic`, `agent-inference` and `human-review`. Inferences, supplied-color applicability findings and pending human concerns must require human review and reference a real queue-tool result. `human-review` means pending evaluation, not a human-confirmed failure. Do not duplicate an axe contrast violation as a second deterministic failure merely because its arithmetic was checked.

Validation rejects missing or invented automated rule/selector/severity entries, altered scanner WCAG tags, unknown evidence IDs, failed-tool evidence and unqueried/removed criteria. The application derives `manualReview` from the tool queue. Retrieved metadata appears in `standards`; complete observable tool calls and results appear in `auditTrail`. Model prose remains a synthesis that needs review: structural validation does not prove the accuracy of every explanation.

If a generated report fails validation, the agent can make up to two correction attempts in the same session, retaining its existing evidence. The audit records validation errors. Exhausted repairs fail the review rather than returning an unvalidated report.

`summary.totalIssues`, severity counts and category counts describe **automated findings only**, counted per rule/affected element. `issues.length` may be larger when there are inferred or deterministic concerns. `summary.manualReviewItems` counts pending queue items.

```text
riskScore = max(0, 100 - 15×critical - 10×serious - 5×moderate - 2×minor)
```

The requested score keeps the original exercise convention: **higher means fewer detected barriers**, not greater risk. It is not a percentage of accessibility or conformance. Code computes it from automated findings only; potential concerns do not become confirmed failures through scoring. Findings are ordered by provisional task-completion risk, then severity, then ID. The task-completion flag and confidence are agent judgments, not measured probabilities.

The audit stores tool names, validated inputs/results or errors, timestamps, evidence IDs and final finding links. It does not store private chain of thought. Raw page HTML snippets can appear in local audit files and are sent to Claude for synthesis. Audit files are ignored by Git.

## Contrast boundaries

The contrast handler accepts opaque `#RGB` or `#RRGGBB` values. It rejects alpha, gradients and unsupported color syntax. It uses the WCAG sRGB formula with the `0.04045` linearization breakpoint and compares the full-precision ratio before display rounding.

Text AA uses 4.5:1, or 3:1 for 24 CSS px or larger, or bold text at least `14 × 96 / 72` CSS px. `18.66px` is slightly below the exact bold boundary. Weight 700 or greater is treated as bold; verify actual font rendering and applicability.

Non-text and focus-indicator modes calculate the 1.4.11 3:1 adjacent-color threshold only. Not every border needs that contrast, and focus appearance, visibility and obscuration involve separate requirements. The numeric result has `requiresHumanReview: false`, while `applicationRequiresHumanReview: true` preserves the need to verify page colors, exemptions, adjacency and states.

## WCAG snapshot

`src/data/wcag22.json` contains metadata for all 86 active WCAG 2.2 criteria plus the removed 4.1.1 Parsing entry. Each result includes a retrieval date and W3C normative/Understanding links. AAA criteria are marked outside the AA target. Unknown numbers error instead of falling back to model memory.

To refresh from W3C, then rebuild the checked-in metadata:

```powershell
Invoke-WebRequest -Uri 'https://www.w3.org/TR/WCAG22/' -OutFile 'src/data/wcag22-source.html' -UseBasicParsing
npm run catalog:build
npm test
```

The generator checks expected criterion counts and fails if the source structure changes. Review the metadata diff before adopting an update. The downloaded HTML is ignored by Git. Metadata is extracted from W3C WCAG 2.2 with attribution; see the [W3C document license](https://www.w3.org/copyright/document-license-2023/).

## Verify

```powershell
npm run check
npm test
npm run test:scanner
npm run test:tools
```

Unit tests need no Claude credentials. `test:scanner` checks the original three fixtures through the external scanner. `test:tools` discovers and calls all four custom tools over in-memory MCP, including a real Chrome checkout scan; it saves `reports/custom-tools.audit.json`.

The optional live integration check uses Claude authentication and model usage:

```powershell
npm run test:agent
```

It starts its own sample server, reviews checkout, requires all four tools to have been used, and saves `reports/checkout-agent.report.json` plus an audit.

## Fixtures and limits

| Fixture | Intention |
| --- | --- |
| `accessible.html` | Semantic HTML, labels, native controls; expected few/no automated violations |
| `issues.html` | Missing image alternative/form label, skipped heading, incomplete ARIA checkbox |
| `severe.html` | Missing names/language, low contrast, invalid ARIA, nested landmarks, deliberate Tab trap and unannounced errors |
| `checkout.html` | Checkout-shaped exercise with unnamed submit button, missing email label, incomplete checkbox and known low-contrast delivery text |

Some intentionally planted problems require human interaction and judgment. Zero violations never proves conformance. The upstream scanner caps evidence at 25 elements per rule, truncates HTML at 300 characters and flattens nested selectors. Truncated lists and non-2xx pages are rejected instead of receiving a misleading partial score. Results depend on browser/engine version and page state.

## Teaching materials and sources

### Deterministic routing

`src/routing.ts` exports `route_accessibility_finding`, `apply_stratified_spot_check`, and `calibration_report`.
The router accepts a finding ID, `issue_category`, rule, and three required string arrays:
`findings_below_threshold`, `reviewer_disagreements`, and `integration_failures`.
Any nonempty signal produces `human_review`, with reasons ordered `low_confidence, reviewer_disagreement, integration_failure`.
Clear signals produce `auto_approve` with an empty reason.

`reviewAccessibility(url, { sample_pct: 0.2, seed: 42 })` now runs a fresh independent reviewer session,
then integration checks, then routing. Returned reports and audit files include reviewer verdicts, integration
failures, and routing records. Existing analysis repair attempts remain; unresolved integration failures escalate
all findings and suppress score/count fields with `null`. Unparseable reports and missing scans still fail explicitly.
Reviewer errors, absent verdicts, and duplicate verdicts cannot authorize automatic approval.
The reviewer receives the captured tool evidence, which may not establish contextual correctness; insufficient
evidence must be marked as disagreement. This adds a separate SDK call to live reviews.

Only high-confidence automated findings without pending human-review requirements meet the current evidence threshold.
`src/routing-pipeline.ts` maps scanner rules to issue categories (unknown rules use `other`).
Reports with no findings retain an interface-level human review record; absence of detected barriers is not conformance.

Spot checks sample only automatic approvals per issue category, preserving input order without mutating inputs.
Each eligible category receives `max(1, ceil(sample_pct * n))` selections, including at a zero rate.
Rates must be finite numbers in `[0, 1]`. Integer seeds use an isolated Mulberry32 generator for reproducible
TypeScript samples; these do not reproduce Python's random sequence. The default pipeline sample rate is 20%.

Calibration accepts records with `issue_category`, `rule`, numeric `predicted_confidence` in `[0, 1]`, and a
human-labeled `correct` boolean. It returns `cells` with sample count, mean predicted confidence, observed
accuracy, and Brier score, plus sample-weighted `overall_brier`. Empty input returns `{ cells: [], overall_brier: 0 }`.
Existing high/medium/low labels are not converted into invented probabilities, and independent reviewer agreement
is not treated as a human correctness label.

- [Custom-tools lesson](docs/custom-tools-lesson.md)
- [W3C evaluation overview](https://www.w3.org/WAI/test-evaluate/)
- [W3C contrast calculation](https://www.w3.org/WAI/WCAG22/Techniques/general/G18.html)
- [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [W3C Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- [Claude SDK custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [Scanner](https://github.com/Bishop81/accessibility-scanner-mcp)

External ticket creation is a future adapter. The current project performs no Jira/GitHub writes or external reviewer notifications.
