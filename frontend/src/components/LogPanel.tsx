import { useEffect, useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Copy, Check, Maximize2, Minimize2, X } from 'lucide-react';
import type { Log } from '../types';

interface LogPanelProps {
  logs: Log[];
  isConnected: boolean;
}

const levelColors: Record<Log['level'], string> = {
  info:   'text-muted',
  error:  'text-destructive',
  agent:  'text-accent',
  system: 'text-warning',
};

const levelLabels: Record<Log['level'], string> = {
  info:   'INFO  ',
  error:  'ERROR ',
  agent:  'AGENT ',
  system: 'SYS   ',
};

function formatTimestamp(ts: string): string {
  try {
    return format(new Date(ts), 'HH:mm:ss');
  } catch {
    return '??:??:??';
  }
}

function formatLogsAsText(logs: Log[]): string {
  return logs
    .map(
      (l) =>
        `[${formatTimestamp(l.timestamp)}] [${levelLabels[l.level].trim()}] ${l.message}`
    )
    .join('\n');
}

function LogLines({ logs }: { logs: Log[] }) {
  return (
    <>
      {logs.map((log) => (
        <div key={log.id} className="flex gap-2 text-xs font-mono leading-relaxed">
          <span className="text-muted/60 flex-shrink-0 select-none">
            [{formatTimestamp(log.timestamp)}]
          </span>
          <span
            className={clsx(
              'flex-shrink-0 select-none font-semibold',
              levelColors[log.level]
            )}
          >
            [{levelLabels[log.level]}]
          </span>
          <span
            className={clsx(
              'break-all whitespace-pre-wrap',
              levelColors[log.level]
            )}
          >
            {log.message}
          </span>
        </div>
      ))}
    </>
  );
}

export function LogPanel({ logs, isConnected }: LogPanelProps) {
  const bottomRef    = useRef<HTMLDivElement>(null);
  const [copied, setCopied]     = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Lock body scroll when expanded
  useEffect(() => {
    document.body.style.overflow = expanded ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [expanded]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded]);

  const handleCopy = useCallback(async () => {
    if (!logs.length) return;
    try {
      await navigator.clipboard.writeText(formatLogsAsText(logs));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = formatLogsAsText(logs);
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [logs]);

  const toolbar = (
    <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border flex-shrink-0">
      <div className="flex items-center gap-2">
        {/* Traffic-light dots */}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-accent/70" />
        </div>
        <span className="text-muted uppercase text-xs tracking-widest font-mono ml-1">
          Terminal Output
        </span>
        <span className="text-muted/40 font-mono text-xs">
          ({logs.length} line{logs.length !== 1 ? 's' : ''})
        </span>
      </div>

      <div className="flex items-center gap-1">
        {/* Connection indicator */}
        <span
          className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0 mr-1',
            isConnected ? 'bg-accent animate-pulse' : 'bg-muted/40'
          )}
          title={isConnected ? 'Live' : 'Disconnected'}
        />

        {/* Copy button */}
        <button
          onClick={handleCopy}
          disabled={!logs.length}
          title="Copy logs"
          className={clsx(
            'flex items-center gap-1.5 px-2 py-1 rounded font-mono text-xs transition-colors',
            logs.length
              ? 'text-muted hover:text-foreground hover:bg-surface-2 cursor-pointer'
              : 'text-muted/30 cursor-not-allowed'
          )}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-accent" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* Expand / collapse button */}
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse (Esc)' : 'Expand'}
          className="flex items-center gap-1.5 px-2 py-1 rounded font-mono text-xs text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          {expanded ? (
            <><Minimize2 className="w-3.5 h-3.5" /><span>Collapse</span></>
          ) : (
            <><Maximize2 className="w-3.5 h-3.5" /><span>Expand</span></>
          )}
        </button>
      </div>
    </div>
  );

  const logBody = (
    <div
      className="flex-1 overflow-auto p-3 space-y-0.5"
      style={{ backgroundColor: '#020617' }}
    >
      {logs.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted font-mono text-xs">
            {isConnected ? 'Waiting for logs...' : 'No logs available.'}
          </p>
        </div>
      ) : (
        <LogLines logs={logs} />
      )}
      <div ref={bottomRef} />
    </div>
  );

  // ── Expanded (fullscreen overlay) ────────────────────────────────────────
  if (expanded) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background"
        role="dialog"
        aria-modal="true"
        aria-label="Terminal Output"
      >
        {/* Overlay toolbar — same layout, adds X close */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-accent/70" />
            </div>
            <span className="text-muted uppercase text-xs tracking-widest font-mono ml-1">
              Terminal Output
            </span>
            <span className="text-muted/40 font-mono text-xs">
              ({logs.length} line{logs.length !== 1 ? 's' : ''})
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span
              className={clsx(
                'w-2 h-2 rounded-full flex-shrink-0 mr-1',
                isConnected ? 'bg-accent animate-pulse' : 'bg-muted/40'
              )}
            />
            <button
              onClick={handleCopy}
              disabled={!logs.length}
              title="Copy logs"
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1 rounded font-mono text-xs transition-colors',
                logs.length
                  ? 'text-muted hover:text-foreground hover:bg-surface-2 cursor-pointer'
                  : 'text-muted/30 cursor-not-allowed'
              )}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-accent" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={() => setExpanded(false)}
              title="Close (Esc)"
              className="flex items-center gap-1.5 px-2 py-1 rounded font-mono text-xs text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-auto p-4 space-y-0.5"
          style={{ backgroundColor: '#020617' }}
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted font-mono text-xs">No logs yet.</p>
            </div>
          ) : (
            <LogLines logs={logs} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    );
  }

  // ── Normal (inline) ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full rounded-lg border border-border overflow-hidden">
      {toolbar}
      {logBody}
    </div>
  );
}
