import { Globe, ExternalLink, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { TaskStatus } from '../types';

interface PreviewPanelProps {
  previewUrl: string | null;
  status: TaskStatus;
}

export function PreviewPanel({ previewUrl, status }: PreviewPanelProps) {
  const isLoading = status === 'running' || status === 'pending';

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-muted" />
          <span className="text-muted uppercase text-xs tracking-widest font-mono">
            Preview
          </span>
        </div>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-mono text-muted hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-surface-2"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 relative bg-background overflow-hidden">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title="App Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            {isLoading ? (
              <>
                <Loader2 className="w-8 h-8 text-muted animate-spin" />
                <p className="text-muted font-mono text-xs leading-relaxed">
                  Agent is working...
                  <br />
                  Preview appears here when a web server starts on port 3000.
                </p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
                  <Globe className="w-7 h-7 text-muted/50" />
                </div>
                <div>
                  <p className="text-muted font-mono text-sm mb-1">
                    No web preview
                  </p>
                  <p className="text-muted/60 font-mono text-xs leading-relaxed max-w-[200px]">
                    Preview only appears when the agent starts a web server on port&nbsp;3000–9999.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* URL bar */}
      {previewUrl && (
        <div className="px-3 py-2 bg-surface border-t border-border flex-shrink-0">
          <p className="text-muted font-mono text-xs truncate" title={previewUrl}>
            {previewUrl}
          </p>
        </div>
      )}
    </div>
  );
}
