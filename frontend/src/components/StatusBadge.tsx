import clsx from 'clsx';
import type { TaskStatus } from '../types';

interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<
  TaskStatus,
  { label: string; dotColor: string; textColor: string; pulse: boolean }
> = {
  running: {
    label: 'Running',
    dotColor: 'bg-warning',
    textColor: 'text-warning',
    pulse: true,
  },
  completed: {
    label: 'Completed',
    dotColor: 'bg-accent',
    textColor: 'text-accent',
    pulse: false,
  },
  failed: {
    label: 'Failed',
    dotColor: 'bg-destructive',
    textColor: 'text-destructive',
    pulse: false,
  },
  pending: {
    label: 'Pending',
    dotColor: 'bg-info',
    textColor: 'text-info',
    pulse: false,
  },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-mono font-medium rounded-full',
        size === 'sm'
          ? 'text-xs px-2 py-0.5'
          : 'text-xs px-2.5 py-1',
        'bg-surface-2 border border-border'
      )}
    >
      <span
        className={clsx(
          'rounded-full flex-shrink-0',
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
          config.dotColor,
          config.pulse && 'animate-pulse'
        )}
      />
      <span className={config.textColor}>{config.label}</span>
    </span>
  );
}
