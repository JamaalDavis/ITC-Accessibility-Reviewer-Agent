# Accessibility-driven development with AI

Adapted from the supplied "AI, Accessibility, and Test-Driven Development" material.

Use this workflow when implementing accessibility fixes or proposing tests:

1. Define the user need and critical journey, including who encounters the barrier.
2. Establish expected behavior from independent requirements: retrieved standards,
   supplied acceptance criteria, design-system guidance, and disabled user research
   where available. Record assumptions and missing information for human review.
3. For a reproducible behavior defect, write an appropriate regression test and
   establish that it fails for the intended reason before changing implementation.
   Test observable outcomes, not internal implementation details. Do not add tests
   solely to mirror a trivial change.
4. Implement the fix, run the relevant checks, and refine as needed. Do not weaken
   the expected behavior just to make generated code pass.
5. Validate remaining interactions with assistive technology and human evaluation.
   Record which checks ran, their results, and what remains pending.

## Make test proposals actionable

Describe the user outcome, requirement source, starting state, actions, expected
result, and validation method. A proposed test is not evidence that it ran.

For a typical modal dialog, propose keyboard activation, an accessible name,
appropriate initial focus, Tab and Shift+Tab containment, Escape dismissal, and
focus return to the trigger or an appropriate next location. Confirm expectations
and any exceptions against the intended interaction. Pair browser checks with
manual screen-reader checks of the dialog's context and reading experience.

For form errors, propose submitting invalid input, checking field/error
associations and focus behavior, correcting the input, and completing the task.
Checking live-region markup does not establish that an announcement is timely,
understandable, or usable in a particular browser/screen-reader combination.

## Review the tests as well as the code

AI-generated code and tests can share the same incorrect assumptions. Check the
expected behavior against independent requirements. A fresh reviewer session is
another check on the evidence, not a substitute for human evaluation or proof of
conformance. Humans retain ownership of acceptance criteria and risk priorities.

Investigate intermittent failures before suppressing or quarantining them: unstable
focus or announcements may expose a real timing defect. Capture available evidence
such as reproduction steps, focus sequences, DOM snapshots and browser logs;
label missing evidence rather than inventing it.

Group suspected shared-component causes to help prioritize remediation, while
preserving individual findings and affected elements. If selecting tests by changed
component, include affected workflows and retain the project's required checks.

## Current implementation boundary

The TypeScript analyzer uses this guidance for remediation and pending human-test
proposals. Its independent reviewer checks claims against captured evidence.
Neither agent currently writes or executes regression tests. Human-review queue
entries remain local pending work and do not contact reviewers.

The Python governance prompt includes the same principles, but its offline replay
does not interpret prompt text. Deterministic hooks retain their existing behavior;
changing the prompt does not add enforcement or measure live model compliance.
