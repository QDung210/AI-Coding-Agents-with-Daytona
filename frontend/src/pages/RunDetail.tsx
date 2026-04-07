import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Box,
  Hash,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { fetchRun, fetchTask, fetchRunLogs, retryRun } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { StatusBadge } from '../components/StatusBadge';
import { LogPanel } from '../components/LogPanel';
import { PreviewPanel } from '../components/PreviewPanel';
import { AgentStepTracker } from '../components/AgentStepTracker';
import type { Run, Task, Log } from '../types';

function InfoRow({
  icon,
  label,
  value,
  mono = true,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-0">
      <span className="text-muted mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-muted uppercase text-xs tracking-widest font-mono mb-0.5">
          {label}
        </p>
        <p
          className={`text-foreground text-xs truncate ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [run, setRun] = useState<Run | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [patchOpen, setPatchOpen] = useState(false);
  const [historicLogs, setHistoricLogs] = useState<Log[]>([]);

  // Resizable: left column width (horizontal drag)
  const [leftPct, setLeftPct] = useState(60);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resizable: top section height within left column (vertical drag)
  const [topPct, setTopPct] = useState(38);
  const leftColRef = useRef<HTMLDivElement>(null);

  // Which drag is active: 'col' | 'row' | null
  const draggingRef = useRef<'col' | 'row' | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;

      if (draggingRef.current === 'col' && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setLeftPct(Math.min(Math.max(pct, 30), 75));
      }

      if (draggingRef.current === 'row' && leftColRef.current) {
        const rect = leftColRef.current.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setTopPct(Math.min(Math.max(pct, 15), 70));
      }
    };
    const onUp = () => { draggingRef.current = null; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const { logs: wsLogs, isConnected } = useWebSocket(
    run?.status === 'running' || run?.status === 'pending' ? runId : undefined
  );

  // Merged logs: historic first, then WS (dedup by id)
  const allLogs = (() => {
    const seen = new Set<number>();
    const merged = [...historicLogs, ...wsLogs].filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
    return merged.sort((a, b) => a.id - b.id);
  })();

  const loadData = useCallback(async () => {
    if (!runId) return;
    try {
      const runData = await fetchRun(runId);
      setRun(runData);
      setLoadError(null);

      // Fetch task info
      try {
        const taskData = await fetchTask(runData.task_id);
        setTask(taskData);
      } catch {
        // Not critical
      }

      // Fetch logs for completed/failed runs
      if (runData.status === 'completed' || runData.status === 'failed') {
        try {
          const logsData = await fetchRunLogs(runId);
          setHistoricLogs(logsData);
        } catch {
          // Not critical
        }
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load run details'
      );
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll every 3s while running
  useEffect(() => {
    if (!run || run.status === 'completed' || run.status === 'failed') return;

    const interval = setInterval(() => {
      loadData();
    }, 3000);

    return () => clearInterval(interval);
  }, [run, loadData]);

  const handleRetry = async () => {
    if (!runId || retrying) return;
    setRetrying(true);
    try {
      const newRun = await retryRun(runId);
      navigate(`/runs/${newRun.id}`);
    } catch (err) {
      console.error('Retry failed:', err);
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted font-mono text-sm">Loading run details...</p>
        </div>
      </div>
    );
  }

  if (loadError || !run) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-destructive font-mono text-sm">
          {loadError ?? 'Run not found'}
        </p>
        <Link
          to="/"
          className="text-muted font-mono text-sm hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const formattedDate = (() => {
    try {
      return format(new Date(run.created_at), 'MMM d, yyyy HH:mm:ss');
    } catch {
      return run.created_at;
    }
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-muted hover:text-foreground font-mono text-sm transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="text-border font-mono">|</span>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-foreground font-mono font-semibold text-sm truncate">
              {task?.title ?? `Run ${run.id.slice(0, 8)}`}
            </h1>
            <StatusBadge status={run.status} size="sm" />
          </div>
        </div>

        {run.status === 'failed' && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border text-muted hover:text-foreground hover:border-border/80 font-mono text-xs rounded transition-colors disabled:opacity-50"
          >
            {retrying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Retry
          </button>
        )}
      </div>

      {/* Main content: 2-column resizable layout */}
      <div ref={containerRef} className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* LEFT COLUMN */}
        <div
          ref={leftColRef}
          className="flex flex-col min-w-0 border-r border-border overflow-hidden"
          style={{ width: `${leftPct}%`, flexShrink: 0 }}
        >
          {/* Top section: tracker + run info — height controlled by topPct */}
          <div
            className="flex-shrink-0 overflow-auto p-5 pb-2 flex flex-col gap-4"
            style={{ height: `${topPct}%` }}
          >
            <div id="tour-agent-pipeline">
              <AgentStepTracker currentStep={run.agent_step} status={run.status} />
            </div>
            <div className="bg-surface-2 border border-border rounded-lg p-4">
              <p className="text-muted uppercase text-xs tracking-widest font-mono mb-2">
                Run Info
              </p>
              {run.sandbox_id && (
                <InfoRow icon={<Box className="w-3.5 h-3.5" />} label="Sandbox ID" value={run.sandbox_id} />
              )}
              <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="Run ID" value={run.id} />
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="Started" value={formattedDate} />
            </div>
          </div>

          {/* VERTICAL DRAG HANDLE */}
          <div
            onMouseDown={(e) => {
              draggingRef.current = 'row';
              document.body.style.cursor = 'row-resize';
              e.preventDefault();
            }}
            className="flex-shrink-0 h-2 cursor-row-resize bg-border/50 hover:bg-accent/40 active:bg-accent/60 transition-colors flex items-center justify-center group"
            title="Drag to resize terminal"
          >
            <div className="flex gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 rounded-full bg-foreground" />
              ))}
            </div>
          </div>

          {/* Log Panel — fills remaining height */}
          <div id="tour-log-panel" className="flex-1 min-h-0 px-5 pb-5">
            <LogPanel logs={allLogs} isConnected={isConnected} />
          </div>
        </div>

        {/* HORIZONTAL DRAG HANDLE */}
        <div
          onMouseDown={(e) => {
            draggingRef.current = 'col';
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
          }}
          className="hidden lg:flex flex-col items-center justify-center w-2 flex-shrink-0 cursor-col-resize bg-border/50 hover:bg-accent/40 active:bg-accent/60 transition-colors group"
          title="Drag to resize panels"
        >
          <div className="flex flex-col gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-0.5 h-0.5 rounded-full bg-foreground" />
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col min-w-0 overflow-hidden flex-1">
          <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
            {/* Preview Panel */}
            <div id="tour-preview-panel" className="h-64 lg:h-72 flex-shrink-0">
              <PreviewPanel
                previewUrl={run.preview_url}
                status={run.status}
              />
            </div>

            {/* Summary */}
            <div id="tour-run-summary" className="bg-surface-2 border border-border rounded-lg p-4">
              <p className="text-muted uppercase text-xs tracking-widest font-mono mb-3">
                Summary
              </p>
              {run.summary ? (
                <p className="text-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {run.summary}
                </p>
              ) : run.status === 'completed' ? (
                <p className="text-muted font-mono text-xs italic">
                  No summary generated.
                </p>
              ) : run.status === 'failed' ? (
                <p className="text-destructive font-mono text-xs">
                  Run failed. Check the logs for details.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                  <p className="text-muted font-mono text-xs">
                    Agent is working...
                  </p>
                </div>
              )}
            </div>

            {/* Patch / Diff — collapsible, only when completed and patch exists */}
            {run.status === 'completed' && run.patch && (
              <div className="bg-surface-2 border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setPatchOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface/50 transition-colors"
                >
                  <p className="text-muted uppercase text-xs tracking-widest font-mono">
                    View Patch / Diff
                  </p>
                  {patchOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted" />
                  )}
                </button>
                {patchOpen && (
                  <div className="border-t border-border overflow-auto max-h-80 p-3">
                    <pre className="text-xs font-mono leading-relaxed whitespace-pre text-foreground">
                      {run.patch.split('\n').map((line, i) => {
                        const color = line.startsWith('+')
                          ? 'text-accent'
                          : line.startsWith('-')
                          ? 'text-destructive'
                          : line.startsWith('@@')
                          ? 'text-info'
                          : 'text-muted';
                        return (
                          <span key={i} className={`block ${color}`}>
                            {line || '\u00A0'}
                          </span>
                        );
                      })}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Retry button (mobile-visible fallback) */}
            {run.status === 'failed' && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="lg:hidden flex items-center justify-center gap-2 w-full py-2.5 bg-surface border border-border text-muted hover:text-foreground font-mono text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {retrying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Retry Run
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
