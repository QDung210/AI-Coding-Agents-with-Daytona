export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  title: string;
  prompt: string;
  repo_url: string | null;
  snapshot_template: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  runs: Run[];
}

export interface Run {
  id: string;
  task_id: string;
  sandbox_id: string | null;
  preview_url: string | null;
  agent_step: string | null;
  summary: string | null;
  patch: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface Log {
  id: number;
  run_id: string;
  timestamp: string;
  level: 'info' | 'error' | 'agent' | 'system';
  message: string;
}

export interface CreateTaskPayload {
  title: string;
  prompt: string;
  repo_url?: string;
  snapshot_template: string;
}
