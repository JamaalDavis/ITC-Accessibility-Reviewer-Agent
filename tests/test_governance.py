import json
from copy import deepcopy
from itertools import product
from unittest.mock import Mock

import pytest

from accessibility_agent.comparison import (
    GOVERNANCE_PROMPT, SCENARIOS, Scenario, _build_engine, compare, is_violation,
)
from accessibility_agent.hooks import build_accessibility_handoff, release_risk_hook, score_accessibility_risk_flags
from accessibility_agent.models import HookDecision, SessionState, ToolCall, ToolExecution, ToolResult


@pytest.fixture
def data():
    return {"experience_id": "checkout-v3", "release_id": "2026.09.11", "issue_id": "A11Y-431",
            "barrier_type": "KEYBOARD", "severity": "serious", "task_blocking": True,
            "affected_users": ["keyboard-only users"], "alternative_path_available": False,
            "evidence_summary": "The payment control cannot be reached using the keyboard."}


@pytest.fixture
def state():
    return SessionState(experiences={"checkout-v3": {"product_area": "commerce",
                        "affected_workflow": "Complete payment", "is_core_workflow": True,
                        "prior_related_incidents": 2}},
                        reviewed_releases={("checkout-v3", "2026.09.11")})


@pytest.mark.parametrize("severity,blocking", list(product(["minor", "moderate", "serious", "critical"], [False, True])))
def test_exact_or_boundary_and_dispatch(severity, blocking, data, state):
    data.update(severity=severity, task_blocking=blocking)
    engine = _build_engine(True)
    publish = Mock(return_value={"status": "published"})
    engine.tools["publish_release"] = publish
    call = ToolCall("publish_release", data)
    should_redirect = severity == "critical" or blocking
    assert release_risk_hook(call, state).decision == ("redirect" if should_redirect else "allow")
    execution = engine.execute_tool_call(call, state)
    assert execution.executed is not should_redirect
    assert publish.call_count == (0 if should_redirect else 1)
    assert len(state.accessibility_review_queue) == (1 if should_redirect else 0)
    if should_redirect:
        result = execution.result
        assert result.is_error and result.error_category == "business" and not result.is_retryable
        assert result.content["status"] == "human_review_required"
        assert result.content["queue"] == "accessibility_review_queue"
        assert any(event.get("decision") == "redirect" for event in state.audit_log)


def test_risk_scoring_is_multitrigger_without_automatic_denial(data, state):
    record = state.get_experience("checkout-v3")
    record.update(new_component=True, has_accessibility_history=False)
    data.update(severity="critical", assistive_technology_dependency=True)
    assert score_accessibility_risk_flags(data, record) == [
        "critical_severity", "task_blocking", "core_workflow", "assistive_technology_dependency",
        "no_alternative_path", "repeated_component_failure", "new_component"]
    data.update(severity="moderate", task_blocking=False)
    assert release_risk_hook(ToolCall("publish_release", data), state).decision == "allow"


def test_handoff_is_self_contained_traceable_and_detached(data, state):
    record = state.get_experience("checkout-v3")
    before = deepcopy((data, record))
    handoff = build_accessibility_handoff(data, record)
    serialized = json.loads(json.dumps(handoff.model_dump()))
    assert serialized["product_area"] == "commerce"
    assert serialized["affected_workflow"] == "Complete payment"
    assert serialized["affected_users"] == ["keyboard-only users"]
    assert serialized["requested_action"] == "publish_release"
    assert "blocks task completion" in serialized["reason_for_escalation"]
    assert set(serialized) - {"provenance"} == set(serialized["provenance"])
    assert (data, record) == before
    data["affected_users"].append("unverified addition")
    assert handoff.affected_users == ["keyboard-only users"]


def test_missing_context_is_explicit_not_invented():
    handoff = build_accessibility_handoff({"experience_id": "x", "release_id": "r",
                                          "severity": "critical", "task_blocking": False}, {})
    assert handoff.affected_users == []
    assert handoff.alternative_path_available is None
    assert handoff.evidence_summary == "Not provided"
    assert handoff.risk_flags == ["critical_severity"]
    assert "core workflow" not in handoff.reason_for_escalation


def test_other_tools_allow_and_all_hooks_registered():
    assert release_risk_hook(ToolCall("read_page", {}), SessionState()).decision == "allow"
    assert [hook.__name__ for hook in _build_engine(True).pre_hooks] == [
        "release_risk_hook", "accessibility_prerequisite_hook", "unresolved_critical_issue_hook"]
    assert _build_engine(False).pre_hooks == []


def test_prerequisite_review_is_release_specific(data, state):
    data.update(severity="moderate", task_blocking=False, release_id="next")
    execution = _build_engine(True).execute_tool_call(ToolCall("publish_release", data), state)
    assert not execution.executed
    assert execution.result.error_category == "business"


def test_known_risk_redirects_even_without_prerequisite(data, state):
    state.reviewed_releases.clear()
    result = _build_engine(True).execute_tool_call(ToolCall("publish_release", data), state)
    assert not result.executed and len(state.accessibility_review_queue) == 1


def test_critical_closure_needs_human_approval(data, state):
    call = ToolCall("close_critical_accessibility_issue", data)
    engine = _build_engine(True)
    assert not engine.execute_tool_call(call, state).executed
    assert state.closed_issues == []
    state.approved_issue_closures.add(data["issue_id"])
    assert engine.execute_tool_call(call, state).executed
    assert state.closed_issues == [data["issue_id"]]


def test_trusted_finding_cannot_be_downgraded_by_tool_input(data, state):
    record = state.get_experience("checkout-v3")
    record["findings"] = [{**data, "resolved": False}]
    data.update(severity="minor", task_blocking=False)
    result = _build_engine(True).execute_tool_call(ToolCall("publish_release", data), state)
    assert not result.executed
    handoff = state.accessibility_review_queue[0]
    assert handoff.task_blocking
    assert handoff.provenance["severity"].startswith("experience_record.findings")
    record["findings"][0]["resolved"] = True
    assert _build_engine(True).execute_tool_call(ToolCall("publish_release", data), state).executed


def test_unrelated_release_findings_do_not_redirect(data, state):
    state.get_experience("checkout-v3")["findings"] = [{**data, "release_id": "old"}]
    data.update(severity="minor", task_blocking=False)
    assert _build_engine(True).execute_tool_call(ToolCall("publish_release", data), state).executed


@pytest.mark.parametrize("change", [{"task_blocking": "true"}, {"task_blocking": 1},
                                  {"severity": "CRITICAL"}, {"severity": None},
                                  {"experience_id": "missing"}, {"affected_users": "everyone"}])
def test_invalid_input_cannot_bypass_gate(change, data, state):
    data.update(change)
    result = _build_engine(True).execute_tool_call(ToolCall("publish_release", data), state)
    assert not result.executed and result.result.error_category == "validation"
    assert state.published_releases == []


def test_repeated_requests_never_dispatch(data, state):
    engine = _build_engine(True)
    for _ in range(3):
        assert not engine.execute_tool_call(ToolCall("publish_release", data), state).executed
    assert state.published_releases == []
    assert len(state.accessibility_review_queue) == 3


def test_hook_errors_and_unknown_decisions_fail_closed(data, state):
    engine = _build_engine(False)
    engine.register_pre(lambda call, state: HookDecision("unexpected", "invalid"))
    result = engine.execute_tool_call(ToolCall("publish_release", data), state)
    assert not result.executed and result.result.error_category == "technical"


def test_handler_error_counts_as_invocation(data, state):
    engine = _build_engine(False)
    engine.tools["publish_release"] = Mock(side_effect=RuntimeError("adapter failed"))
    result = engine.execute_tool_call(ToolCall("publish_release", data), state)
    assert result.executed and result.result.error_category == "technical"
    assert is_violation(Scenario("risk", "checkout-v3", "serious", True), result)


def test_violation_predicate_measures_actions_not_words():
    risk = Scenario("risk", "x", "critical", False)
    assert is_violation(risk, ToolExecution("publish_release", True, ToolResult({"message": "Do not publish"})))
    assert not is_violation(risk, ToolExecution("publish_release", False, ToolResult({})))
    assert not is_violation(risk, ToolExecution("read_page", True, ToolResult({})))


def test_comparison_guarantees_and_perfect_prompt_compliance():
    result = compare()
    assert result["scenarios_evaluated"] == len(SCENARIOS)
    assert result["hook_violations"] == 0
    assert result["hook_violations"] <= result["prompt_violations"]
    compliant = compare(agent=lambda scenario, prompt: [])
    assert compliant["hook_violations"] == 0
    assert compliant["hook_violations"] <= compliant["prompt_violations"]


def test_same_prompt_and_calls_are_replayed_once_per_scenario():
    agent = Mock(return_value=[])
    compare(agent=agent)
    assert agent.call_count == len(SCENARIOS)
    assert all(call.args[1] == GOVERNANCE_PROMPT for call in agent.call_args_list)


def test_returned_handoff_cannot_mutate_queue(data, state):
    result = _build_engine(True).execute_tool_call(ToolCall("publish_release", data), state)
    result.result.content["handoff"]["affected_users"].clear()
    assert state.accessibility_review_queue[0].affected_users == ["keyboard-only users"]


@pytest.mark.parametrize("raw,category,retryable", [
    ({"status": "ok"}, None, False),
    (ToolResult({"status": "denied"}, True, "business", True), "business", False),
    (ToolResult({"status": "failed"}, True), "technical", False),
])
def test_every_handler_result_is_normalized(raw, category, retryable, data, state):
    engine = _build_engine(False)
    engine.tools["publish_release"] = Mock(return_value=raw)
    result = engine.execute_tool_call(ToolCall("publish_release", data), state).result
    assert isinstance(result, ToolResult)
    assert result.error_category == category and result.is_retryable is retryable


def test_unknown_tool_and_missing_risk_fields_are_validation_errors(data, state):
    engine = _build_engine(True)
    assert engine.execute_tool_call(ToolCall("missing", {}), state).result.error_category == "validation"
    del data["severity"]
    result = engine.execute_tool_call(ToolCall("publish_release", data), state)
    assert not result.executed and result.result.error_category == "validation"
