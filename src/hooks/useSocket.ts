import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ChatterLiveStatus } from '../types';

// ── Configuration ────────────────────────────────────────────
// When the Tracker microservice is deployed, set this URL.
// Until then, the socket stays disconnected and all hooks return mock/empty data.

const TRACKER_SOCKET_URL = import.meta.env.VITE_TRACKER_SOCKET_URL || '';

// ── Types ────────────────────────────────────────────────────

export interface SocketState {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
}

export interface ChatterClockEvent {
  userId: string;
  name: string;
  sessionId: string;
  timestamp: string;
}

export interface ActivityUpdateEvent {
  userId: string;
  activityPct: number;
  activeWindow: string;
  isOnTask: boolean;
}

// ── Main Hook ────────────────────────────────────────────────
// This hook manages the Socket.io connection to the Tracker microservice.
// It's a no-op until VITE_TRACKER_SOCKET_URL is configured.

export function useSocket() {
  const [state, setState] = useState<SocketState>({
    connected: false,
    reconnecting: false,
    error: null,
  });

  const socketRef = useRef<any>(null);
  const listenersRef = useRef<Map<string, Set<Function>>>(new Map());

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event: string, handler: Function) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(handler);

    return () => {
      listenersRef.current.get(event)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!TRACKER_SOCKET_URL) return;

    // Dynamic import — socket.io-client only loaded when URL is configured
    let cancelled = false;

    (async () => {
      try {
        const { io } = await import('socket.io-client');
        if (cancelled) return;

        const { data: { session } } = await supabase.auth.getSession();
        const socket = io(TRACKER_SOCKET_URL, {
          auth: { token: session?.access_token },
          autoConnect: true,
          reconnection: true,
          reconnectionDelay: 2000,
          reconnectionAttempts: 10,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          setState({ connected: true, reconnecting: false, error: null });
        });

        socket.on('disconnect', () => {
          setState(prev => ({ ...prev, connected: false }));
        });

        socket.on('connect_error', (err: Error) => {
          setState(prev => ({ ...prev, error: err.message, reconnecting: true }));
        });

        // Forward all events to registered listeners
        socket.onAny((event: string, ...args: any[]) => {
          const handlers = listenersRef.current.get(event);
          if (handlers) {
            handlers.forEach(fn => fn(...args));
          }
        });
      } catch {
        setState(prev => ({ ...prev, error: 'Socket.io not available' }));
      }
    })();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return { ...state, emit, on };
}

// ── Live Status Hook ─────────────────────────────────────────
// Returns the real-time status of chatters.
// Until Tracker is connected, returns empty array.
// When connected, updates in real-time via socket events.

export function useLiveChatterStatus(): {
  statuses: ChatterLiveStatus[];
  isTrackerConnected: boolean;
} {
  const [statuses, setStatuses] = useState<ChatterLiveStatus[]>([]);
  const { connected, on } = useSocket();

  useEffect(() => {
    if (!connected) return;

    const unsub1 = on('chatter:clocked-in', (data: ChatterClockEvent) => {
      setStatuses(prev => {
        const existing = prev.find(s => s.chatter_id === data.userId);
        if (existing) {
          return prev.map(s =>
            s.chatter_id === data.userId
              ? { ...s, status: 'online' as const, clock_in: data.timestamp }
              : s
          );
        }
        return [...prev, {
          chatter_id: data.userId,
          chatter_name: data.name,
          team_name: null,
          status: 'online' as const,
          clock_in: data.timestamp,
          elapsed_seconds: 0,
          activity_pct: null,
          scheduled_shift: null,
        }];
      });
    });

    const unsub2 = on('chatter:clocked-out', (data: ChatterClockEvent) => {
      setStatuses(prev =>
        prev.map(s =>
          s.chatter_id === data.userId
            ? { ...s, status: 'offline' as const, clock_in: null }
            : s
        )
      );
    });

    const unsub3 = on('chatter:on-break', (data: { userId: string }) => {
      setStatuses(prev =>
        prev.map(s =>
          s.chatter_id === data.userId ? { ...s, status: 'on_break' as const } : s
        )
      );
    });

    const unsub4 = on('chatter:resumed', (data: { userId: string }) => {
      setStatuses(prev =>
        prev.map(s =>
          s.chatter_id === data.userId ? { ...s, status: 'online' as const } : s
        )
      );
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [connected, on]);

  return { statuses, isTrackerConnected: connected };
}
