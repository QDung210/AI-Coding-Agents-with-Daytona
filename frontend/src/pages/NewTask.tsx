import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Play, ArrowLeft, Loader2, Terminal } from 'lucide-react';
import { createTask } from '../lib/api';
import type { CreateTaskPayload } from '../types';

const SNAPSHOT_OPTIONS = [
  { value: 'ubuntu-22', label: 'Ubuntu 22.04' },
  { value: 'ubuntu-20', label: 'Ubuntu 20.04' },
  { value: 'python-3.11', label: 'Python 3.11' },
  { value: 'node-20', label: 'Node.js 20' },
];

const inputClass =
  'w-full bg-surface border border-border text-foreground placeholder:text-muted ' +
  'focus:outline-none focus:border-accent rounded px-3 py-2 font-mono text-sm ' +
  'transition-colors';

const labelClass = 'block text-muted uppercase text-xs tracking-widest font-mono mb-1.5';

interface FieldError {
  title?: string;
  prompt?: string;
}

export function NewTask() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    title: string;
    prompt: string;
    repo_url: string;
    snapshot_template: string;
  }>({
    title: '',
    prompt: '',
    repo_url: '',
    snapshot_template: 'ubuntu-22',
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FieldError]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setApiError(null);
  };

  const validate = (): boolean => {
    const newErrors: FieldError = {};
    if (!form.title.trim()) newErrors.title = 'Title is required';
    if (!form.prompt.trim()) newErrors.prompt = 'Prompt is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setApiError(null);

    const payload: CreateTaskPayload = {
      title: form.title.trim(),
      prompt: form.prompt.trim(),
      snapshot_template: form.snapshot_template,
    };
    if (form.repo_url.trim()) {
      payload.repo_url = form.repo_url.trim();
    }

    try {
      const task = await createTask(payload);
      const firstRunId = task.runs?.[0]?.id;
      navigate(firstRunId ? `/runs/${firstRunId}` : '/');
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : 'Failed to create task. Please try again.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 overflow-auto">
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted hover:text-foreground font-mono text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>

      {/* Centered form */}
      <div className="mx-auto w-full max-w-2xl">
        {/* Page heading */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-accent" />
            </div>
            <h1 className="text-foreground font-mono font-bold text-xl">New Task</h1>
          </div>
          <p className="text-muted font-mono text-xs ml-11">
            Configure and launch an AI agent in a Daytona sandbox
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-xl p-6 space-y-5"
        >
          {/* API error */}
          {apiError && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-md px-4 py-3">
              <p className="text-destructive font-mono text-xs">{apiError}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className={labelClass}>
              Title <span className="text-destructive">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Build a REST API with FastAPI"
              className={inputClass}
              disabled={loading}
              autoFocus
            />
            {errors.title && (
              <p className="text-destructive font-mono text-xs mt-1">{errors.title}</p>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label htmlFor="prompt" className={labelClass}>
              Prompt <span className="text-destructive">*</span>
            </label>
            <textarea
              id="prompt"
              name="prompt"
              rows={6}
              value={form.prompt}
              onChange={handleChange}
              placeholder="Describe what you want the agent to do..."
              className={`${inputClass} resize-none leading-relaxed`}
              disabled={loading}
            />
            {errors.prompt && (
              <p className="text-destructive font-mono text-xs mt-1">{errors.prompt}</p>
            )}
            <p className="text-muted/60 font-mono text-xs mt-1">
              Be specific about the tech stack, architecture, and expected output.
            </p>
          </div>

          {/* Repo URL */}
          <div>
            <label htmlFor="repo_url" className={labelClass}>
              Repository URL{' '}
              <span className="text-muted/50 normal-case tracking-normal">
                (optional)
              </span>
            </label>
            <input
              id="repo_url"
              name="repo_url"
              type="url"
              value={form.repo_url}
              onChange={handleChange}
              placeholder="https://github.com/owner/repository"
              className={inputClass}
              disabled={loading}
            />
            <p className="text-muted/60 font-mono text-xs mt-1">
              The agent will clone this repo into the sandbox.
            </p>
          </div>

          {/* Snapshot Template */}
          <div>
            <label htmlFor="snapshot_template" className={labelClass}>
              Snapshot Template
            </label>
            <select
              id="snapshot_template"
              name="snapshot_template"
              value={form.snapshot_template}
              onChange={handleChange}
              className={`${inputClass} cursor-pointer`}
              disabled={loading}
            >
              {SNAPSHOT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-muted/60 font-mono text-xs mt-1">
              Base environment for the Daytona sandbox.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-background font-mono font-semibold text-sm rounded-md hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating sandbox...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Create Task &amp; Run
                </>
              )}
            </button>
            <Link
              to="/"
              className="px-4 py-2.5 text-muted font-mono text-sm hover:text-foreground transition-colors rounded-md hover:bg-surface-2"
            >
              Cancel
            </Link>
          </div>
        </form>

        {/* Info box */}
        <div className="mt-4 bg-info/5 border border-info/20 rounded-lg px-4 py-3">
          <p className="text-info/80 font-mono text-xs leading-relaxed">
            A Daytona sandbox will be provisioned with the selected snapshot. The AI agent
            will run your prompt and stream logs in real-time.
          </p>
        </div>
      </div>
    </div>
  );
}
