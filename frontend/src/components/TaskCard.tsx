import React, { useState } from 'react';
import { Trash2, GitBranch, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { StatusBadge } from './StatusBadge';
import { deleteTask } from '../lib/api';
import type { Task } from '../types';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onDeleted?: (id: string) => void;
}

export function TaskCard({ task, onClick, onDeleted }: TaskCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    if (!window.confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      await deleteTask(task.id);
      onDeleted?.(task.id);
    } catch (err) {
      console.error('Failed to delete task:', err);
      setIsDeleting(false);
    }
  };

  const relativeTime = (() => {
    try {
      return formatDistanceToNow(new Date(task.updated_at), { addSuffix: true });
    } catch {
      return 'unknown time';
    }
  })();

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-surface-2 border border-border rounded-lg p-4 cursor-pointer',
        'hover:bg-surface-2/80 hover:border-border/80',
        'transition-colors group relative',
        isDeleting && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-foreground font-mono font-semibold text-sm leading-snug truncate flex-1">
          {task.title}
        </h3>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className={clsx(
            'opacity-0 group-hover:opacity-100 flex-shrink-0',
            'w-7 h-7 flex items-center justify-center rounded',
            'text-muted hover:text-destructive hover:bg-destructive/10',
            'transition-all duration-150'
          )}
          title="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Prompt preview */}
      <p className="text-muted font-mono text-xs leading-relaxed line-clamp-1 mb-3">
        {task.prompt}
      </p>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={task.status} size="sm" />

        <div className="flex items-center gap-3">
          {task.repo_url && (
            <span
              className="flex items-center gap-1 text-muted text-xs font-mono"
              title={task.repo_url}
            >
              <GitBranch className="w-3 h-3" />
              <span className="truncate max-w-[80px]">
                {task.repo_url.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1 text-muted text-xs font-mono whitespace-nowrap">
            <Clock className="w-3 h-3 flex-shrink-0" />
            {relativeTime}
          </span>
        </div>
      </div>
    </div>
  );
}
