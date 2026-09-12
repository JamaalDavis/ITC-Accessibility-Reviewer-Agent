# Accessibility release governance exercise

This standalone Python package adds the hook engine absent from the TypeScript
workspace. It does not modify the TypeScript agent or connect to a production
deployment service. The local publish adapter records its side effect in session
state, allowing tests to prove whether dispatch happened.

## Run

PowerShell:

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -e '.[test]'
.venv/Scripts/pytest tests/
.venv/Scripts/accessibility-agent compare --offline
.venv/Scripts/accessibility-agent compare --offline --json
```

On POSIX, replace `.venv/Scripts/` with `.venv/bin/`.

## Policy and execution

`hooks.py` implements multi-trigger risk flags, a self-contained handoff with field
provenance, release interception, the review prerequisite, and critical issue
closure approval. The categorical release rule is **critical OR task_blocking**.
Signals such as a new component, prior incidents or lack of an alternative do not
independently prohibit release.

`engine.py` validates inputs, runs pre-tool hooks, normalizes results and audits
decisions and execution. Release redirection runs first, so a known blocker always
produces a handoff even when prerequisite review is missing. A redirect enqueues
the handoff and returns a non-retryable business error before invoking the handler.
Other protected calls must pass the prerequisite gate. Critical issue closure also
requires recorded human approval. Hook exceptions fail closed.

An input's risk claim is checked alongside trusted unresolved findings for the
requested release, so lowering severity in the tool call cannot override a known
blocker. Review records and resolution status are application-owned state; no tool
in this exercise grants approval or rewrites those records. The publish input is
a current unresolved finding claim; a stale critical claim still redirects until
the caller supplies accurate input. Resolved stored findings do not trigger the gate.

Handoffs use only input and structured records. Missing context is explicitly
marked `Not provided`, an empty affected-user list, or `null` for an unknown
alternative path. The code does not invent affected populations or infer evidence
from chat history. Risk descriptions are deterministic, not model-generated.

## What the comparison measures

`comparison.py` supplies the same strong governance prompt to an agent interface,
then replays an identical proposed tool sequence against separate hook-enabled and
hook-disabled engines. Both arms begin with prerequisite review complete. The
offline agent is a scripted fixture including attempted prohibited releases and
compliant abstentions; it does not call an LLM or interpret the prompt.

Violations count actual publish invocations for critical or task-blocking scenarios,
including an invocation whose handler subsequently fails. The only comparative
assertions are zero hook violations and hook violations no greater than prompt-only
violations. A fully compliant proposed sequence is also tested. Offline counts
demonstrate enforcement under these attempts, not an empirical model failure rate.
The JSON option includes per-scenario results, handoffs and audit logs.

## Scope of the guarantee

All protected adapters must be reached through `execute_tool_call`. The engine
guarantees interception at that boundary given valid, trusted records; direct calls
to a deployment service outside this engine are outside its control. This exercise
uses synchronous in-memory state and a local queue. A production integration needs
durable trusted records and queue storage, concurrency control, and an authenticated
human adjudication path. A queued handoff never counts as release approval.

No automated result establishes accessibility or WCAG conformance.
