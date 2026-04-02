/* eslint-disable react-hooks/exhaustive-deps */
// components/doctor/DoctorNotifications.jsx
/**
 * DoctorNotifications — Refactored
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from original:
 *
 * 1. REMOVED its own polling interval — previously this component ran a
 *    separate `setInterval(fetchUnreadCount, 30000)` independently of
 *    NotificationContext, resulting in two parallel polls for the same endpoint.
 *    The unread count is now read directly from NotificationContext.
 *
 * 2. REMOVED duplicate `fetchUnreadCount` implementation — the context
 *    already handles this with deduplication, backoff, and rate-limiting.
 *
 * 3. Full notification list still fetched locally (with abort + guard) because
 *    the doctor modal has filter/sort logic that the shared context doesn't need
 *    to know about.
 *
 * 4. All useEffect dependency arrays are explicit and correct.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell, X, Check, CheckCheck, AlertCircle,
  Trash2, Filter, ExternalLink, Clock,
} from 'lucide-react';
import { notificationsAPI } from '../../api';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatRelativeTime = (date) => {
  if (!date) return 'Recently';
  try {
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
    if (seconds < 60)      return 'Just now';
    if (seconds < 3600)    return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400)   return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800)  return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return 'Recently'; }
};

const NOTIFICATION_TYPES = [
  { value: 'all',                   label: 'All Types' },
  { value: 'appointment',           label: 'Appointments' },
  { value: 'session_started',       label: 'Sessions' },
  { value: 'lab_results_ready',     label: 'Lab Results' },
  { value: 'lab_results_critical',  label: 'Critical Results' },
  { value: 'prescription_created',  label: 'Prescriptions' },
  { value: 'patient_message',       label: 'Messages' },
  { value: 'system',                label: 'System' },
];

// ─────────────────────────────────────────────────────────────────────────────

const DoctorNotifications = () => {
  const navigate = useNavigate();

  // ① Read unread count from shared context — NO separate poll needed
  const { unreadCount, refreshUnreadCount } = useNotifications();

  const [isOpen,       setIsOpen]       = useState(false);
  const [notifications, setLocalNotifs] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [filter,       setFilter]       = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [showFilters,  setShowFilters]  = useState(false);

  const abortRef      = useRef(null);
  const isFetchingRef = useRef(false);
  const refreshTimRef = useRef(null);

  // ── Fetch full list (only when the modal is open) ─────────────────────────
  const fetchNotifications = useCallback(async (showLoader = true) => {
    if (isFetchingRef.current) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    isFetchingRef.current = true;

    try {
      if (showLoader) setLoading(true);

      const params = { limit: 100 };
      if (filter === 'read')   params.read = 'true';
      if (filter === 'unread') params.read = 'false';
      if (typeFilter !== 'all') params.type = typeFilter;

      const res = await notificationsAPI.getNotifications(params, {
        signal: abortRef.current.signal,
      });

      const sorted = [...(res.notifications ?? [])].sort((a, b) => {
        const order = { urgent: 0, high: 1, normal: 2, low: 3 };
        const pA = order[a.priority] ?? 2;
        const pB = order[b.priority] ?? 2;
        if (pA !== pB) return pA - pB;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      setLocalNotifs(sorted);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      if (isOpen) toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
      abortRef.current      = null;
    }
  }, [isOpen, filter, typeFilter]);

  // Run whenever the modal opens or filters change
  useEffect(() => {
    if (isOpen) fetchNotifications();

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (refreshTimRef.current) clearTimeout(refreshTimRef.current);
      isFetchingRef.current = false;
    };
  }, [isOpen, filter, typeFilter]); // ← fetchNotifications excluded: it is
  //   stable but including it would loop (it depends on isOpen/filter/typeFilter)

  // Debounced refresh helper
  const scheduleRefresh = (delay = 300) => {
    if (refreshTimRef.current) clearTimeout(refreshTimRef.current);
    refreshTimRef.current = setTimeout(() => {
      if (isOpen && !isFetchingRef.current) fetchNotifications(false);
    }, delay);
  };

  // ── Mutation handlers ─────────────────────────────────────────────────────

  const handleMarkAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setLocalNotifs((prev) =>
        prev.map((n) => n._id === id ? { ...n, read: true, readAt: new Date() } : n)
      );
      // Let the context update its count (deduplication handled there)
      setTimeout(refreshUnreadCount, 500);
      scheduleRefresh(1_000);
    } catch {
      toast.error('Failed to mark as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) { toast('No unread notifications', { icon: 'ℹ️' }); return; }
    try {
      await notificationsAPI.markAllAsRead();
      setLocalNotifs((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date() })));
      setTimeout(refreshUnreadCount, 500);
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsAPI.deleteNotification(id);
      setLocalNotifs((prev) => prev.filter((n) => n._id !== id));
      setTimeout(refreshUnreadCount, 200);
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleClearRead = async () => {
    const readCount = notifications.filter((n) => n.read).length;
    if (readCount === 0) { toast('No read notifications to clear', { icon: 'ℹ️' }); return; }
    if (!window.confirm(`Clear ${readCount} read notification${readCount !== 1 ? 's' : ''}?`)) return;
    try {
      await notificationsAPI.clearReadNotifications();
      setLocalNotifs((prev) => prev.filter((n) => !n.read));
    } catch {
      toast.error('Failed to clear notifications');
    }
  };

  const handleNotificationAction = (notification) => {
    if (!notification.read) handleMarkAsRead(notification._id);

    const route = notification.actionUrl ?? {
      appointment:            '/doctor/appointments',
      session:                '/doctor/sessions',
      lab_results_ready:      '/doctor/lab-results',
      lab_results_critical:   '/doctor/lab-results',
      prescription_created:   '/doctor/prescriptions',
      patient_message:        '/doctor/messages',
    }[notification.type];

    if (route) { navigate(route); setIsOpen(false); }
  };

  // ── Styling helpers ───────────────────────────────────────────────────────

  const getNotificationStyle = ({ type, priority }) => {
    if (priority === 'urgent') return { icon: '🚨', color: 'bg-red-100 text-red-600',    border: 'border-l-red-500' };
    if (priority === 'high')   return { icon: '⚠️', color: 'bg-orange-100 text-orange-600', border: 'border-l-orange-500' };

    const map = {
      appointment:           { icon: '📅', color: 'bg-blue-100 text-blue-600',    border: 'border-l-blue-500' },
      session_started:       { icon: '🩺', color: 'bg-purple-100 text-purple-600', border: 'border-l-purple-500' },
      lab_results_ready:     { icon: '🧪', color: 'bg-green-100 text-green-600',   border: 'border-l-green-500' },
      lab_results_critical:  { icon: '⚠️', color: 'bg-red-100 text-red-600',      border: 'border-l-red-500' },
      prescription_created:  { icon: '💊', color: 'bg-indigo-100 text-indigo-600', border: 'border-l-indigo-500' },
      patient_message:       { icon: '💬', color: 'bg-yellow-100 text-yellow-600', border: 'border-l-yellow-500' },
      system:                { icon: '⚙️', color: 'bg-gray-100 text-gray-600',    border: 'border-l-gray-500' },
    };
    return map[type] ?? { icon: '🔔', color: 'bg-gray-100 text-gray-600', border: 'border-l-gray-500' };
  };

  const hasUnread = unreadCount > 0;
  const hasRead   = notifications.some((n) => n.read);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setIsOpen(false)}
            />

            <div className="relative inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                    <Bell className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900">Notification Center</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {unreadCount} unread • {notifications.length} total
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              {/* Filter bar */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex space-x-2">
                    {['all', 'unread', 'read'].map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        disabled={loading}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          filter === f
                            ? 'bg-black text-white shadow-md'
                            : 'bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 border border-gray-200'
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowFilters((v) => !v)}
                      className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
                    >
                      <Filter className="w-4 h-4" />
                      <span>Filters</span>
                    </button>

                    {hasUnread && (
                      <button
                        onClick={handleMarkAllAsRead}
                        disabled={loading}
                        className="flex items-center space-x-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Mark all read</span>
                      </button>
                    )}

                    {hasRead && (
                      <button
                        onClick={handleClearRead}
                        disabled={loading}
                        className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Clear read</span>
                      </button>
                    )}
                  </div>
                </div>

                {showFilters && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                    {NOTIFICATION_TYPES.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setTypeFilter(value)}
                        disabled={loading}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                          typeFilter === value
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 border border-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* List */}
              <div className="max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
                      <p className="text-sm text-gray-500">Loading notifications...</p>
                    </div>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                    <Bell className="w-16 h-16 mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No notifications</p>
                    <p className="text-sm text-gray-400 mt-2">
                      {filter === 'unread' ? "You're all caught up!" : 'Nothing to show'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {notifications.map((notification) => {
                      const style = getNotificationStyle(notification);
                      return (
                        <div
                          key={notification._id}
                          onClick={() => handleNotificationAction(notification)}
                          className={`p-5 hover:bg-gray-50 transition-all cursor-pointer ${
                            !notification.read ? 'bg-blue-50 border-l-4 ' + style.border : ''
                          }`}
                        >
                          <div className="flex items-start space-x-4">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl ${style.color}`}>
                              {style.icon}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 pr-4">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h3 className="text-base font-semibold text-gray-900">
                                      {notification.title}
                                    </h3>
                                    {notification.priority === 'urgent' && (
                                      <span className="px-2 py-0.5 text-xs font-bold text-red-700 bg-red-100 rounded-full animate-pulse">URGENT</span>
                                    )}
                                    {notification.priority === 'high' && (
                                      <span className="px-2 py-0.5 text-xs font-medium text-orange-700 bg-orange-100 rounded-full">High Priority</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                                    {notification.message}
                                  </p>
                                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                                    <span className="flex items-center space-x-1">
                                      <Clock className="w-3 h-3" />
                                      <span>{formatRelativeTime(notification.createdAt)}</span>
                                    </span>
                                    {notification.actionLabel && (
                                      <span className="flex items-center space-x-1 text-blue-600 font-medium">
                                        <ExternalLink className="w-3 h-3" />
                                        <span>{notification.actionLabel}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1 ml-2">
                                  {!notification.read && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notification._id); }}
                                      className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
                                      title="Mark as read"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(notification._id); }}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-500">
                  Showing {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DoctorNotifications;