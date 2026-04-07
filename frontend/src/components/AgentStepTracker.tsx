import { CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import type { TaskStatus } from '../types';

interface AgentStepTrackerProps {
  currentStep: string | null;
  status: TaskStatus;
}

const STEPS = [
  { id: 'intake', label: 'Intake', description: 'Parsing task requirements' },
  { id: 'plan', label: 'Plan', description: 'Building execution strategy' },
  { id: 'execute', label: 'Execute', description: 'Running agent in sandbox' },
  { id: 'evaluate', label: 'Evaluate', description: 'Reviewing output quality' },
  { id: 'finalize', label: 'Finalize', description: 'Committing and cleanup' },
];

function getStepState(
  stepId: string,
  currentStep: string | null,
  status: TaskStatus
): 'completed' | 'current' | 'future' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') {
    const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
    const thisIdx = STEPS.findIndex((s) => s.id === stepId);
    if (thisIdx < currentIdx) return 'completed';
    if (thisIdx === currentIdx) return 'future';
    return 'future';
  }

  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  const thisIdx = STEPS.findIndex((s) => s.id === stepId);

  if (currentIdx === -1) return 'future';
  if (thisIdx < currentIdx) return 'completed';
  if (thisIdx === currentIdx) return 'current';
  return 'future';
}

export function AgentStepTracker({ currentStep, status }: AgentStepTrackerProps) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-4">
      <p className="text-muted uppercase text-xs tracking-widest font-mono mb-4">
        Agent Pipeline
      </p>
      <div className="flex flex-col gap-0">
        {STEPS.map((step, idx) => {
          const state = getStepState(step.id, currentStep, status);
          const isLast = idx === STEPS.length - 1;

          return (
            <div key={step.id} className="flex gap-3">
              {/* Icon + connector line */}
              <div className="flex flex-col items-center">
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {state === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-accent" />
                  ) : state === 'current' ? (
                    <div className="w-5 h-5 rounded-full border-2 border-warning flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-border" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={clsx(
                      'w-0.5 flex-1 min-h-[20px] my-0.5',
                      state === 'completed' ? 'bg-accent/40' : 'bg-border'
                    )}
                  />
                )}
              </div>

              {/* Step info */}
              <div className={clsx('pb-4', isLast && 'pb-0')}>
                <p
                  className={clsx(
                    'font-mono text-sm font-medium leading-5',
                    state === 'completed' && 'text-accent',
                    state === 'current' && 'text-warning',
                    state === 'future' && 'text-muted/60'
                  )}
                >
                  {step.label}
                </p>
                <p
                  className={clsx(
                    'font-mono text-xs mt-0.5',
                    state === 'future' ? 'text-muted/40' : 'text-muted'
                  )}
                >
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
