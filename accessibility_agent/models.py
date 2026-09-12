from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class ToolCall:
    name: str
    input: dict[str, Any]


@dataclass(frozen=True)
class AccessibilityHandoff:
    experience_id: str
    product_area: str
    release_id: str
    issue_id: str | None
    barrier_type: str
    severity: str
    task_blocking: bool
    affected_workflow: str
    affected_users: list[str]
    evidence_summary: str
    alternative_path_available: bool | None
    risk_flags: list[str]
    reason_for_escalation: str
    requested_action: str
    provenance: dict[str, str]

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class HookDecision:
    decision: Literal["allow", "deny", "redirect"]
    reason: str
    destination: str | None = None
    handoff: AccessibilityHandoff | None = None


@dataclass
class ToolResult:
    content: dict[str, Any]
    is_error: bool = False
    error_category: Literal["business", "validation", "technical"] | None = None
    is_retryable: bool = False


@dataclass
class ToolExecution:
    tool_name: str
    executed: bool
    result: ToolResult


@dataclass
class SessionState:
    # These are trusted application records, never populated from chat text.
    experiences: dict[str, dict[str, Any]] = field(default_factory=dict)
    reviewed_releases: set[tuple[str, str]] = field(default_factory=set)
    approved_issue_closures: set[str] = field(default_factory=set)
    accessibility_review_queue: list[AccessibilityHandoff] = field(default_factory=list)
    audit_log: list[dict[str, Any]] = field(default_factory=list)
    published_releases: list[tuple[str, str]] = field(default_factory=list)
    closed_issues: list[str] = field(default_factory=list)

    def get_experience(self, experience_id: str) -> dict[str, Any]:
        if experience_id not in self.experiences:
            raise ValueError(f"Unknown experience: {experience_id}")
        return self.experiences[experience_id]
