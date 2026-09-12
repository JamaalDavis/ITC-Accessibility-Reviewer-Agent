"""Pure policy functions. No conversation history or model calls are consulted."""
from typing import Any

from .models import AccessibilityHandoff, HookDecision, SessionState, ToolCall


def score_accessibility_risk_flags(tool_input: dict, experience_record: dict) -> list[str]:
    flags = []
    triggers = (
        (tool_input.get("severity") == "critical", "critical_severity"),
        (tool_input.get("task_blocking") is True, "task_blocking"),
        (experience_record.get("is_core_workflow") is True, "core_workflow"),
        (bool(tool_input.get("assistive_technology_dependency")), "assistive_technology_dependency"),
        (tool_input.get("alternative_path_available") is False, "no_alternative_path"),
        (experience_record.get("prior_related_incidents", 0) > 0, "repeated_component_failure"),
        (experience_record.get("new_component") is True
         and experience_record.get("has_accessibility_history") is False, "new_component"),
    )
    for matches, flag in triggers:
        if matches:
            flags.append(flag)
    return flags


def build_accessibility_handoff(
    tool_input: dict, experience_record: dict, requested_action: str = "publish_release",
) -> AccessibilityHandoff:
    provenance = {}

    def value(key: str, default: Any = "Not provided") -> Any:
        if key in tool_input:
            provenance[key] = "tool_input (structured finding when supplied)"
            return tool_input[key]
        if key in experience_record:
            provenance[key] = "experience_record"
            return experience_record[key]
        provenance[key] = "explicit missing-data marker"
        return default

    triggers = []
    if tool_input.get("severity") == "critical":
        triggers.append("severity is critical")
    if tool_input.get("task_blocking") is True:
        triggers.append("the finding blocks task completion")
    reason = "Release-blocking accessibility rule triggered because " + " and ".join(triggers) + "."
    if not triggers:
        reason = "Accessibility review requested; no automatic release-blocking trigger was supplied."
    handoff = AccessibilityHandoff(
        experience_id=value("experience_id"),
        product_area=experience_record.get("product_area", "Not provided"),
        release_id=value("release_id"), issue_id=value("issue_id", None),
        barrier_type=value("barrier_type"), severity=value("severity", "unknown"),
        task_blocking=value("task_blocking", False),
        affected_workflow=value("affected_workflow"), affected_users=list(value("affected_users", [])),
        evidence_summary=value("evidence_summary"),
        alternative_path_available=value("alternative_path_available", None),
        risk_flags=score_accessibility_risk_flags(tool_input, experience_record),
        reason_for_escalation=reason, requested_action=requested_action, provenance=provenance,
    )
    provenance.update({
        "product_area": "experience_record" if "product_area" in experience_record else "explicit missing-data marker",
        "risk_flags": "deterministic heuristic over tool_input and experience_record",
        "reason_for_escalation": "deterministic critical OR task_blocking rule",
        "requested_action": "requested tool name",
    })
    return handoff


def release_risk_hook(call: ToolCall, state: SessionState) -> HookDecision:
    if call.name != "publish_release":
        return HookDecision("allow", "Not a protected release action.")
    record = state.get_experience(call.input["experience_id"])
    # Trusted unresolved findings prevent an agent from bypassing the gate by
    # omitting or downgrading severity in the proposed tool call.
    candidates = [call.input] + [
        {**finding, "experience_id": call.input["experience_id"], "release_id": call.input["release_id"]}
        for finding in record.get("findings", [])
        if finding.get("resolved") is not True
        and finding.get("release_id", call.input["release_id"]) == call.input["release_id"]
    ]
    for finding in candidates:
        if finding.get("severity") == "critical" or finding.get("task_blocking") is True:
            handoff = build_accessibility_handoff(finding, record, call.name)
            if finding is not call.input:
                for key in finding.keys() - {"experience_id", "release_id"}:
                    if key in handoff.provenance:
                        handoff.provenance[key] = "experience_record.findings (unresolved, matching release)"
                handoff.provenance["risk_flags"] = "deterministic heuristic over experience_record and its structured finding"
            return HookDecision("redirect", "Release-blocking accessibility risk requires human review.",
                                "accessibility_review_queue", handoff)
    return HookDecision("allow", "No release-blocking accessibility risk detected.")


def accessibility_prerequisite_hook(call: ToolCall, state: SessionState) -> HookDecision:
    if call.name in {"publish_release", "close_critical_accessibility_issue"}:
        key = (call.input["experience_id"], call.input["release_id"])
        if key not in state.reviewed_releases:
            return HookDecision("deny", "A recorded accessibility review of this release is required.")
    return HookDecision("allow", "Accessibility prerequisite satisfied or not applicable.")


def unresolved_critical_issue_hook(call: ToolCall, state: SessionState) -> HookDecision:
    if call.name == "close_critical_accessibility_issue" and call.input["issue_id"] not in state.approved_issue_closures:
        return HookDecision("deny", "Critical accessibility issue closure requires recorded human approval.")
    return HookDecision("allow", "Critical issue closure gate satisfied or not applicable.")
