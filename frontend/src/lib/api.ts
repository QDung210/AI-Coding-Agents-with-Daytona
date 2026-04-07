import type { Task, Run, Log, CreateTaskPayload } from '../types';

const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${errorText}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function fetchTasks(): Promise<Task[]> {
  return request<Task[]>('/tasks');
}

export async function fetchTask(id: string): Promise<Task> {
  return request<Task>(`/tasks/${id}`);
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchRun(id: string): Promise<Run> {
  return request<Run>(`/runs/${id}`);
}

export async function fetchRunLogs(id: string): Promise<Log[]> {
  return request<Log[]>(`/runs/${id}/logs`);
}

export async function retryRun(id: string): Promise<Run> {
  return request<Run>(`/runs/${id}/retry`, {
    method: 'POST',
  });
}

export async function deleteTask(id: string): Promise<void> {
  return request<void>(`/tasks/${id}`, {
    method: 'DELETE',
  });
}
