from typing import TypedDict, Annotated, List, Optional
import operator


class AgentState(TypedDict):
    task_id: str
    run_id: str
    prompt: str
    repo_url: Optional[str]
    sandbox_id: str
    working_dir: str
    messages: Annotated[List, operator.add]
    steps_completed: List[str]
    current_step: str
    test_output: str
    retry_count: int
    max_retries: int
    final_summary: str
    final_patch: str
    preview_url: str
    error: Optional[str]
    status: str  # running/completed/failed
