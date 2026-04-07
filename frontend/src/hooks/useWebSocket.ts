import { useState, useEffect, useRef, useCallback } from 'react';
import type { Log } from '../types';

export function useWebSocket(runId: string | undefined): {
  logs: Log[];
  isConnected: boolean;
} {
  const [logs, setLogs] = useState<Log[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_BASE = 1500;

  const connect = useCallback(() => {
    if (!runId || !isMountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/runs/${runId}/logs`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string) as Log;
        setLogs((prev) => {
          // Avoid duplicate log entries by id
          if (prev.some((l) => l.id === data.id)) return prev;
          return [...prev, data];
        });
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay =
          RECONNECT_DELAY_BASE * Math.pow(1.5, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [runId]);

  useEffect(() => {
    isMountedRef.current = true;
    setLogs([]);
    setIsConnected(false);
    reconnectAttemptsRef.current = 0;

    if (runId) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [runId, connect]);

  return { logs, isConnected };
}
