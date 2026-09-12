"""All exercise tool dispatch goes through this synchronous enforcement boundary."""
from collections.abc import Callable
from copy import deepcopy
from dataclasses import asdict

from .models import HookDecision, SessionState, ToolCall, ToolExecution, ToolResult

PreHook = Callable[[ToolCall, SessionState], HookDecision]
ToolHandler = Callable[[dict, SessionState], dict | ToolResult]
PROTECTED = {"publish_release", "close_critical_accessibility_issue"}


def _validate_call(call: ToolCall, state: SessionState) -> None:
    if not isinstance(call.input, dict):
        raise ValueError("Tool input must be an object")
    if call.name not in PROTECTED:
        return
    for key in ("experience_id", "release_id"):
        if not isinstance(call.input.get(key), str) or not call.input[key].strip():
            raise ValueError(f"{key} must be a non-empty string")
    state.get_experience(call.input["experience_id"])
    for key in ("issue_id", "barrier_type", "affected_workflow", "evidence_summary"):
        if key in call.input and (not isinstance(call.input[key], str) or not call.input[key].strip()):
            raise ValueError(f"{key} must be a non-empty string when supplied")
    if call.name == "publish_release":
        if call.input.get("severity") not in {"minor", "moderate", "serious", "critical"}:
            raise ValueError("severity must be minor, moderate, serious or critical")
        if type(call.input.get("task_blocking")) is not bool:
            raise ValueError("task_blocking must be a boolean")
        for key in ("alternative_path_available", "assistive_technology_dependency"):
            if key in call.input and type(call.input[key]) is not bool:
                raise ValueError(f"{key} must be a boolean")
        if "affected_users" in call.input and (
            not isinstance(call.input["affected_users"], list)
            or not all(isinstance(user, str) for user in call.input["affected_users"])
        ):
            raise ValueError("affected_users must be a list of strings")
    if call.name == "close_critical_accessibility_issue" and not call.input.get("issue_id"):
        raise ValueError("issue_id is required")


def _publish_release(data: dict, state: SessionState) -> dict:
    # Local exercise side effect; replace this adapter with a real release tool.
    state.published_releases.append((data["experience_id"], data["release_id"]))
    return {"status": "published", "release_id": data["release_id"]}


def _close_issue(data: dict, state: SessionState) -> dict:
    state.closed_issues.append(data["issue_id"])
    return {"status": "closed", "issue_id": data["issue_id"]}


class HookEngine:
    def __init__(self) -> None:
        self.pre_hooks: list[PreHook] = []
        self.tools: dict[str, ToolHandler] = {
            "publish_release": _publish_release,
            "close_critical_accessibility_issue": _close_issue,
        }

    def register_pre(self, hook: PreHook) -> None:
        self.pre_hooks.append(hook)

    def execute_tool_call(self, call: ToolCall, state: SessionState) -> ToolExecution:
        # Snapshot inputs so hook inspection and dispatch see the same values.
        call = deepcopy(call)
        executed = False

        def finish(result: ToolResult) -> ToolExecution:
            execution = ToolExecution(call.name, executed, result)
            state.audit_log.append({"event": "tool_result", **deepcopy(asdict(execution))})
            return execution

        try:
            _validate_call(call, state)
            if call.name not in self.tools:
                raise ValueError(f"Unknown tool: {call.name}")
        except (ValueError, TypeError) as error:
            return finish(ToolResult({"status": "invalid_input", "message": str(error)}, True, "validation"))

        try:
            for hook in self.pre_hooks:
                decision = hook(call, state)
                state.audit_log.append({"event": "pre_tool_use", "hook": hook.__name__,
                                        "tool_name": call.name, **deepcopy(asdict(decision))})
                if decision.decision == "redirect":
                    if decision.destination != "accessibility_review_queue" or decision.handoff is None:
                        raise ValueError("Invalid accessibility redirect")
                    state.accessibility_review_queue.append(deepcopy(decision.handoff))
                    # Return before dispatch. A blocked request cannot reach the handler.
                    return finish(ToolResult({
                        "status": "human_review_required", "queue": decision.destination,
                        "message": decision.reason, "handoff": decision.handoff.model_dump(),
                    }, True, "business", False))
                if decision.decision == "deny":
                    return finish(ToolResult({"status": "policy_denied", "message": decision.reason},
                                             True, "business", False))
                if decision.decision != "allow":
                    raise ValueError("Invalid hook decision")
            executed = True
            raw = self.tools[call.name](call.input, state)
            result = raw if isinstance(raw, ToolResult) else ToolResult(raw)
            if not isinstance(result.content, dict):
                raise TypeError("Tool result content must be an object")
            if result.is_error:
                if result.error_category not in {"business", "validation", "technical"}:
                    result.error_category = "technical"
                if result.error_category in {"business", "validation"}:
                    result.is_retryable = False
            else:
                result.error_category = None
                result.is_retryable = False
            return finish(result)
        except Exception as error:
            # Hook errors fail closed; handler errors retain executed=True because
            # invocation (and possibly a partial side effect) already occurred.
            return finish(ToolResult({"status": "execution_failed", "message": str(error)},
                                     True, "technical", False))
