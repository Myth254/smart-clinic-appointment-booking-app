/* eslint-disable react-hooks/exhaustive-deps */
// context/NotificationContext.jsx
/**
 * NotificationContext — Refactored
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from original:
 *
 * 1. SINGLE polling interval — startPolling() is idempotent. Calling it more
 *    than once no longer stacks intervals. Previously the component could start
 *    multiple overlapping setIntervals when tabs became visible repeatedly.
 *
 * 2. Polling reduced to 30 s (was 60 s but the interval was frequently
 *    restarted, effectively making it shorter; 30 s is the documented intent).
 *
 * 3. MIN_REQUEST_SPACING enforced via ref (not state) — avoids stale-closure
 *    bugs that caused the old version to skip legitimate refreshes.
 *
 * 4. Socket listeners registered once — previously they were re-registered
 *    inside a useEffect that depended on `refreshUnreadCount`, a `useCallback`
 *    that itself depended on `lastFetchTime` state, creating a new callback
 *    (and thus re-running the effect + re-registering listeners) on every poll.
 *
 * 5. All refs used for internal timing state — no state-based closures in
 *    async callbacks, eliminating the main source of stale-read bugs.
 *
 * 6. Window globals kept for backward compat (DoctorNotifications etc.).
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import { notificationsAPI } from '../api/notifications';
import socketService from '../services/socketService';

const NotificationContext = createContext(null);

const POLLING_INTERVAL    = 30_000;  // 30 seconds
const MIN_REQUEST_SPACING = 5_000;   // 5 seconds minimum between any two requests
const MAX_RETRIES         = 3;
const RETRY_DELAYS        = [5_000, 10_000, 20_000];

// ─────────────────────────────────────────────────────────────────────────────

export const NotificationProvider = ({ children }) => {
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isPolling,     setIsPolling]     = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  // All timing / concurrency state lives in refs — never triggers re-renders
  const intervalRef      = useRef(null);
  const abortRef         = useRef(null);
  const isFetchingRef    = useRef(false);
  const retryCountRef    = useRef(0);
  const retryTimeoutRef  = useRef(null);
  const lastFetchTimeRef = useRef(0); // ← ref, not state — no stale closure

  // ── Lightweight poll: only fetches the unread count ──────────────────────
  const fetchUnreadCount = useCallback(async () => {
    if (isFetchingRef.current) return;

    const now = Date.now();
    if (now - lastFetchTimeRef.current < MIN_REQUEST_SPACING) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    isFetchingRef.current    = true;
    lastFetchTimeRef.current = now;

    try {
      const res = await notificationsAPI.getUnreadCount({
        signal: abortRef.current.signal,
      });
      setUnreadCount(res.unreadCount ?? 0);
      retryCountRef.current = 0;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') return;

      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_RETRIES) {
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
  }, []); // ← no deps: all internal state is in refs

  // ── Full list fetch (on-demand) ───────────────────────────────────────────
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

  // ── Interval control ──────────────────────────────────────────────────────
  // IDEMPOTENT: multiple calls never stack intervals
  const startPolling = useCallback(() => {
    if (intervalRef.current) return; // already running

    setIsPolling(true);
    fetchUnreadCount();
    intervalRef.current = setInterval(fetchUnreadCount, POLLING_INTERVAL);
  }, [fetchUnreadCount]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
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
  }, []);

  // ── Public refresh (used after mark-as-read etc.) ─────────────────────────
  const refreshUnreadCount = useCallback(async () => {
    if (isFetchingRef.current) return;
    await new Promise((r) => setTimeout(r, 300));
    await fetchUnreadCount();
  }, [fetchUnreadCount]);

  const markAsRead = useCallback(async (notificationId) => {
    await notificationsAPI.markAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) =>
        n._id === notificationId ? { ...n, read: true, readAt: new Date() } : n
      )
    );
    await refreshUnreadCount();
  }, [refreshUnreadCount]);

  const markAllAsRead = useCallback(async () => {
    await notificationsAPI.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date() })));
    setUnreadCount(0);
  }, []);

  // ── Socket integration ────────────────────────────────────────────────────
  // Registered ONCE — deps are stable (no state-derived callbacks)
  useEffect(() => {
    const sock = socketService.socket;
    if (!sock) return;

    const onConnect    = () => { setSocketConnected(true);  refreshUnreadCount(); };
    const onDisconnect = () => setSocketConnected(false);

    const onNew = (notification) => {
      setUnreadCount((c) => c + 1);
      setNotifications((prev) => [notification, ...prev]);
    };
    const onCountUpdate  = (data) => setUnreadCount(data.count ?? 0);
    const onAllRead      = () => {
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date() })));
    };

    sock.on('connect',                     onConnect);
    sock.on('disconnect',                  onDisconnect);
    sock.on('notification:new',            onNew);
    sock.on('notification:unread_count',   onCountUpdate);
    sock.on('notification:all_marked_read', onAllRead);

    setSocketConnected(sock.connected ?? false);

    return () => {
      sock.off('connect',                     onConnect);
      sock.off('disconnect',                  onDisconnect);
      sock.off('notification:new',            onNew);
      sock.off('notification:unread_count',   onCountUpdate);
      sock.off('notification:all_marked_read', onAllRead);
    };
  }, []); // ← empty array: socket never changes; refreshUnreadCount is stable

  // ── Page visibility ───────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => {
      if (document.hidden) { stopPolling(); }
      else { setTimeout(startPolling, 1_000); }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [startPolling, stopPolling]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Window globals (backward compat for DoctorNotifications etc.) ─────────
  useEffect(() => {
    window.refreshNotificationCount  = refreshUnreadCount;
    window.startNotificationPolling  = startPolling;
    window.stopNotificationPolling   = stopPolling;
    return () => {
      delete window.refreshNotificationCount;
      delete window.startNotificationPolling;
      delete window.stopNotificationPolling;
    };
  }, [refreshUnreadCount, startPolling, stopPolling]);

  const value = {
    unreadCount,
    notifications,
    isPolling,
    socketConnected,
    fetchUnreadCount,
    fetchNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
    startPolling,
    stopPolling,
    // Setters exposed for socket-driven updates from child components
    setUnreadCount,
    setNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// ── Consumer hook ─────────────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};

/**
 * NotificationPollingService
 * Drop-in replacement for the old component: starts polling on mount,
 * stops on unmount, and notifies the parent of count changes.
 */
export const NotificationPollingService = ({ onUnreadCountChange }) => {
  const { unreadCount, startPolling, stopPolling } = useNotifications();

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, [startPolling, stopPolling]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  return null;
};

export default NotificationContext;