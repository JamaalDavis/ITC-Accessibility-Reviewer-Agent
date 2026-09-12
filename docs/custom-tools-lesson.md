# Building Accessibility Custom Tools for an AI Agent

Teach the model to select a capability; teach application code to perform and record the operation. Use automation for detectable failures and calculations, retrieved standards for attribution, and human evaluation for contextual questions. W3C's [evaluation overview](https://www.w3.org/WAI/test-evaluate/) explains why automated tools alone cannot establish accessibility.

## Learning outcomes

Students should define meaningful tool names and parameter schemas, write bounded descriptions, implement deterministic handlers, retrieve source-grounded standards metadata, preserve uncertain findings, explain affected users and prioritize possible task blockers. They should inspect observable evidence rather than private model reasoning.

## 1. Inspect the boundary

Read `src/tools/index.ts`. Each definition states what to supply, when to use the tool, and what its result cannot establish. `tool()` wraps the schema and handler. `createSdkMcpServer()` exposes those handlers to the model. The SDK prefixes the server name, so local `a11y_scan_page` becomes `mcp__accessibility__a11y_scan_page`.

Observe the two integrations: custom functions execute in the application; the scan function calls a separate stdio MCP server that runs axe in Chrome. MCP is the transport/protocol boundary, not a substitute for domain-specific validation.

## 2. Calculate rather than estimate

Pass this object to `checkContrast` or the corresponding custom tool:

```json
{"foreground":"#767676","background":"#FFFFFF","textSize":16,"fontWeight":400,"kind":"text"}
```

Compare with `#777777`. Both ratios display near the threshold, but the second pair fails ordinary-text AA. Determine pass/fail with the unrounded value. Then compare 18.66px bold with exactly `14 * 96 / 72` CSS px. Explain why the boundary differs.

Try alpha transparency and a gradient. The correct outcome is an unsupported-input error, not a guessed answer. Switch `kind` to `non-text`; explain why changing a threshold does not establish that the criterion applies to every border.

The ratio itself needs no human calculation. Verifying that the inputs match the relevant rendered state remains separate. In a page report, a deterministic concern therefore keeps `requiresHumanReview: true` until applicability is evaluated.

## 3. Retrieve the criterion

Call `a11y_lookup_wcag` with `2.4.11`, then `2.4.13`. Compare their names and levels. Focus Not Obscured (Minimum) is distinct from Focus Appearance. Look up `4.1.1` and observe its removed status; try an unknown number and observe the error.

The local snapshot retrieves exact metadata and links without asking the model to recall them. Its date makes the retrieval limitation visible. Follow the normative and Understanding links when interpreting applicability, exceptions and testing procedures.

## 4. Queue human judgment

Call `a11y_request_human_review` with a checkout keyboard flow:

```json
{
  "area": "Checkout keyboard flow",
  "reason": "A static scan does not establish successful completion of checkout with a keyboard.",
  "suggestedMethod": "Complete the demo form using Tab, Shift+Tab, Enter and Space. Check focus order, visibility, checkbox interaction, validation errors and recovery.",
  "affectedUsers": ["keyboard-only users", "screen reader users", "users with motor disabilities"]
}
```

Inspect `status: pending` and the routing statement. This operation records work; it neither performs the test nor contacts an expert. The agent cannot mark it complete by writing convincing prose.

## 5. Run the agent

Start the sample server and review `/checkout.html`. The agent task is encoded in `reviewPrompt()`:

> Review the checkout against WCAG 2.2 AA. Use available tools where appropriate. Preserve automated evidence, ground criterion attribution in retrieval, explain user impact, label inferences and queue human questions. Prioritize possible task blockers. Do not claim conformance from automated results.

Read the generated report and audit together. Follow each finding's `evidenceIds` to the selected tool, parameters and actual result. `a11y_check_contrast` should run on observed values, not invented ones. A clean page still needs a human queue; it does not require a pointless contrast call if no colors are available.

## Assessment

- All automated rule-element evidence is preserved without inventing extra detected failures.
- Criterion metadata has been retrieved, with AAA and removed criteria handled correctly.
- Exact math comes from the contrast tool; unsupported inputs are rejected.
- Inferences remain tentative and reference observations plus a pending human review.
- Incomplete scanner entries appear in the queue with their rule and selector.
- Findings explain affected users and provide actionable remediation.
- The automated score excludes uncertain concerns; its direction and limits are explicit.
- The audit links observable operations to findings without exposing private chain of thought.

Use `npm run test:tools` for the tool/MCP exercise without model usage. `npm run test:agent` additionally checks model selection of all four tools on the checkout fixture.

## Future extension: remediation tickets

An eventual `a11y_manage_issue` adapter can map evidence to a component, owner and release. Start with a reviewable local draft, idempotency keys and explicit create/update/get semantics. Configure an actual authorized destination before adding external writes. The present exercise deliberately ends with a local pending queue and report.
