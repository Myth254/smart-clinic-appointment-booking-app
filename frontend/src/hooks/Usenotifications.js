// hooks/useNotifications.js
import { useState, useCallback, useRef, useEffect } from 'react';
import { notificationsAPI } from '../api';

/**
 * useNotifications
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages notification state with a single, controlled polling interval.
 *
 * Key guarantees:
 * 1. Only ONE interval is ever active at a time (idempotent start/stop).
 * 2. Concurrent fetch requests are deduplicated via `isFetchingRef`.
 * 3. Minimum 5-second spacing between any two API calls.
 * 4. Exponential backoff on consecutive failures (max 3 retries → 1-min pause).
 * 5. Pauses automatically when the browser tab is hidden.
 */

const POLLING_INTERVAL    = 30_000; // 30 s – safe & responsive
const MIN_REQUEST_SPACING = 5_000;  // 5 s  – debounce burst calls
const MAX_RETRIES         = 3;
const RETRY_DELAYS        = [5_000, 10_000, 20_000];

export const useNotifications = () => {
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isPolling,     setIsPolling]     = useState(false);

  // ── internal refs (never trigger re-renders) ─────────────────────────────
  const intervalRef      = useRef(null);
  const abortRef         = useRef(null);
  const isFetchingRef    = useRef(false);
  const retryCountRef    = useRef(0);
  const retryTimeoutRef  = useRef(null);
  const lastFetchTimeRef = useRef(0);

  // ── fetchUnreadCount (lightweight) ───────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    if (isFetchingRef.current) return;

    const now = Date.now();
    if (now - lastFetchTimeRef.current < MIN_REQUEST_SPACING) return;

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    isFetchingRef.current    = true;
    lastFetchTimeRef.current = now;

    try {
      const res = await notificationsAPI.getUnreadCount({
        signal: abortRef.current.signal,
      });
      setUnreadCount(res.unreadCount ?? 0);
      retryCountRef.current = 0; // reset on success
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') return;

      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_RETRIES) {
        // Pause polling for 1 minute then resume
        stopPolling();
        retryTimeoutRef.current = setTimeout(() => {
          retryCountRef.current = 0;
          startPolling();
        }, 60_000);
      } else {
        const delay = RETRY_DELAYS[retryCountRef.current - 1] ?? RETRY_DELAYS.at(-1);
        retryTimeoutRef.current = setTimeout(fetchUnreadCount, delay);
      }
    } finally {
      isFetchingRef.current = false;
      abortRef.current      = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── fetchNotifications (full list – call on demand) ───────────────────────
  const fetchNotifications = useCallback(async (params = {}) => {
    if (isFetchingRef.current) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    isFetchingRef.current = true;

    try {
      const res = await notificationsAPI.getNotifications(params, {
        signal: abortRef.current.signal,
      });
      setNotifications(res.notifications ?? []);
      setUnreadCount(res.unreadCount    ?? 0);
      return res;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') return;
      throw err;
    } finally {
      isFetchingRef.current = false;
      abortRef.current      = null;
    }
  }, []);

  // ── start / stop helpers ─────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current      = null;
    isFetchingRef.current = false;
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    // Idempotent – do nothing if already running
    if (intervalRef.current) return;

    setIsPolling(true);
    fetchUnreadCount(); // immediate first hit

    intervalRef.current = setInterval(fetchUnreadCount, POLLING_INTERVAL);
  }, [fetchUnreadCount]);

  // ── mark helpers ─────────────────────────────────────────────────────────
  const refreshUnreadCount = useCallback(async () => {
    if (isFetchingRef.current) return;
    // Small delay so the backend has time to persist the change
    await new Promise((r) => setTimeout(r, 300));
    await fetchUnreadCount();
  }, [fetchUnreadCount]);

  const markAsRead = useCallback(
    async (notificationId) => {
      await notificationsAPI.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notificationId ? { ...n, read: true, readAt: new Date() } : n
        )
      );
      await refreshUnreadCount();
    },
    [refreshUnreadCount]
  );

  const markAllAsRead = useCallback(async () => {
    await notificationsAPI.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date() })));
    setUnreadCount(0);
  }, []);

  // ── page-visibility pause / resume ───────────────────────────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        setTimeout(startPolling, 1_000);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [startPolling, stopPolling]);

  // ── cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    unreadCount,
    notifications,
    isPolling,
    fetchUnreadCount,
    fetchNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
    startPolling,
    stopPolling,
    // Convenience setters for socket-driven updates
    setUnreadCount,
    setNotifications,
  };
};