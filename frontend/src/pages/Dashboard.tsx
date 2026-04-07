import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Terminal, Activity, CheckCircle2, Clock, AlertCircle, HelpCircle } from 'lucide-react';
import { TaskCard } from '../components/TaskCard';
import { fetchTasks } from '../lib/api';
import { startDashboardTour, isDashboardTourDone } from '../lib/tour';
import type { Task } from '../types';

interface StatBoxProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}

function StatBox({ label, value, icon, color = 'text-foreground' }: StatBoxProps) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
      <div className="flex-shrink-0 text-muted">{icon}</div>
      <div>
        <p className={`font-mono font-bold text-xl leading-none ${color}`}>{value}</p>
        <p className="text-muted font-mono text-xs mt-1">{label}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Auto-start tour on first visit
  useEffect(() => {
    if (!isDashboardTourDone()) {
      const t = setTimeout(() => startDashboardTour(), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const data = await fetchTasks();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Poll every 5s while any task is running
  useEffect(() => {
    const hasRunning = tasks.some(
      (t) => t.status === 'running' || t.status === 'pending'
    );
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadTasks();
    }, 5000);

    return () => clearInterval(interval);
  }, [tasks, loadTasks]);

  const handleTaskDeleted = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleTaskClick = (task: Task) => {
    // Navigate to the most recent run (last in the sorted list)
    const latestRun = task.runs?.[task.runs.length - 1];
    if (latestRun?.id) {
      navigate(`/runs/${latestRun.id}`);
    }
  };

  const totalCount = tasks.length;
  const runningCount = tasks.filter(
    (t) => t.status === 'running' || t.status === 'pending'
  ).length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;

  return (
    <div className="flex flex-col h-full p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-foreground font-mono font-bold text-2xl">Workspace</h1>
          <p className="text-muted font-mono text-xs mt-1">
            Run AI coding agents in Daytona sandboxes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => startDashboardTour()}
            title="Show tour"
            className="flex items-center gap-1.5 px-3 py-2 text-muted hover:text-foreground hover:bg-surface-2 font-mono text-xs rounded-md border border-transparent hover:border-border transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            Tour
          </button>
          <Link
            id="tour-new-task-btn"
            to="/new"
            className="flex items-center gap-2 px-4 py-2 bg-accent text-background font-mono font-semibold text-sm rounded-md hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && tasks.length > 0 && (
        <div id="tour-stats" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatBox
            label="Total Tasks"
            value={totalCount}
            icon={<Terminal className="w-4 h-4" />}
          />
          <StatBox
            label="Running"
            value={runningCount}
            icon={<Activity className="w-4 h-4" />}
            color={runningCount > 0 ? 'text-warning' : 'text-foreground'}
          />
          <StatBox
            label="Completed"
            value={completedCount}
            icon={<CheckCircle2 className="w-4 h-4" />}
            color={completedCount > 0 ? 'text-accent' : 'text-foreground'}
          />
          <StatBox
            label="Failed"
            value={failedCount}
            icon={<AlertCircle className="w-4 h-4" />}
            color={failedCount > 0 ? 'text-destructive' : 'text-foreground'}
          />
        </div>
      )}

      {/* Task list */}
      <div id="tour-task-list" className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-muted font-mono text-sm">Loading tasks...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-destructive font-mono text-sm">{error}</p>
            <button
              onClick={loadTasks}
              className="text-muted font-mono text-xs hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 border border-dashed border-border rounded-lg">
            <div className="w-16 h-16 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
              <Terminal className="w-8 h-8 text-muted/50" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-mono text-sm font-medium mb-1">
                No tasks yet
              </p>
              <p className="text-muted font-mono text-xs">
                Create your first task to get started.
              </p>
            </div>
            <Link
              to="/new"
              className="flex items-center gap-2 px-4 py-2 bg-accent text-background font-mono font-semibold text-sm rounded-md hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Task
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-muted uppercase text-xs tracking-widest font-mono">
                Tasks
              </p>
              <span className="text-muted/50 font-mono text-xs">
                ({tasks.length})
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => handleTaskClick(task)}
                  onDeleted={handleTaskDeleted}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer status bar */}
      {!loading && tasks.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border flex items-center gap-2">
          <Clock className="w-3 h-3 text-muted/50" />
          <p className="text-muted/50 font-mono text-xs">
            {runningCount > 0
              ? `Auto-refreshing every 5s — ${runningCount} task${runningCount !== 1 ? 's' : ''} active`
              : 'All tasks complete'}
          </p>
        </div>
      )}
    </div>
  );
}
