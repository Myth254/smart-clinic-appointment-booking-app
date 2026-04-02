/* eslint-disable react-hooks/exhaustive-deps */
// components/notifications/NotificationBell.jsx
import React, { useState, useEffect, useRef, useContext } from 'react';
import { Bell, X, Check, CheckCheck, Trash2, Filter } from 'lucide-react';
import { notificationsAPI } from '../../api/notifications';
import NotificationContext from '../../context/NotificationContext';
import socketService from '../../services/socketService';
import toast from 'react-hot-toast';

/**
 * Format relative time without external dependencies
 */
const formatRelativeTime = (date) => {
  if (!date) return 'Recently';

  try {
    const now = new Date();
    const then = new Date(date);

    if (isNaN(then.getTime())) return 'Recently';

    const seconds = Math.floor((now - then) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;

    return then.toLocaleDateString();
  } catch {
    return 'Recently';
  }
};

/**
 * Enhanced NotificationBell Component
 * - Real-time updates via Socket.IO
 * - Optimistic UI updates
 * - Proper error handling
 * - Integrated with NotificationContext
 */
const NotificationBell = () => {
  const notificationContext = useContext(NotificationContext);

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [highlightedIds, setHighlightedIds] = useState(new Set());

  const dropdownRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Get unread count from context
  const unreadCount = notificationContext?.unreadCount || 0;

  /**
   * Close dropdown when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  /**
   * Fetch notifications when dropdown opens
   */
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isFetchingRef.current = false;
    };
  }, [isOpen, filter]);

  /**
   * Listen for real-time notification updates
   */
  useEffect(() => {
    if (!socketService || !socketService.socket) return;

    const handleNewNotification = (notification) => {
      console.log('🔔 New notification received:', notification);

      if (notification.status && notification.status !== 'active') {
        return;
      }

      // Add to list immediately
      setNotifications((prev) => {
        const next = [notification, ...prev].filter(
          (item) => (item.status || 'active') === 'active'
        );

        return next.filter(
          (item, index, all) =>
            all.findIndex((candidate) => candidate._id === item._id) === index
        );
      });

      // Highlight briefly
      highlightNotification(notification.id || notification._id);

      // Show toast for high priority
      if (
        notification.priority === 'urgent' ||
        notification.priority === 'high'
      ) {
        toast.success(notification.title, {
          duration: 5000,
          icon: '🔔',
        });
      }

      // Refresh count
      if (notificationContext?.refreshUnreadCount) {
        setTimeout(() => {
          notificationContext.refreshUnreadCount();
        }, 500);
      }
    };

    const handleUnreadCountUpdate = (data) => {
      console.log('📊 Unread count updated:', data.count);
      // Context handles this automatically
    };

    const handleAllMarkedRead = () => {
      console.log('✅ All notifications marked as read');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date() }))
      );
    };

    // Register socket listeners
    socketService.socket?.on('notification:new', handleNewNotification);
    socketService.socket?.on(
      'notification:unread_count',
      handleUnreadCountUpdate
    );
    socketService.socket?.on(
      'notification:all_marked_read',
      handleAllMarkedRead
    );

    return () => {
      socketService.socket?.off('notification:new', handleNewNotification);
      socketService.socket?.off(
        'notification:unread_count',
        handleUnreadCountUpdate
      );
      socketService.socket?.off(
        'notification:all_marked_read',
        handleAllMarkedRead
      );
    };
  }, [notificationContext]);

  /**
   * Fetch notifications with proper cancellation
   */
  const fetchNotifications = async () => {
    if (isFetchingRef.current) {
      console.log('[NotificationBell] Already fetching, skipping...');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    isFetchingRef.current = true;

    try {
      setLoading(true);

      const params = { limit: 20 };
      if (filter === 'read') params.read = 'true';
      else if (filter === 'unread') params.read = 'false';

      const response = await notificationsAPI.getNotifications(params, {
        signal: abortControllerRef.current.signal,
      });

      const sorted = [...(response.notifications || [])]
        .filter((notification) => (notification.status || 'active') === 'active')
        .sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      setNotifications(sorted);
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        console.log('[NotificationBell] Request cancelled');
        return;
      }

      console.error('[NotificationBell] Fetch error:', error);

      if (isOpen) {
        toast.error('Failed to load notifications');
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  /**
   * Highlight notification briefly
   */
  const highlightNotification = (notificationId) => {
    setHighlightedIds((prev) => new Set([...prev, notificationId]));
    setTimeout(() => {
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }, 3000);
  };

  /**
   * Mark notification as read
   */
  const handleMarkAsRead = async (notificationId) => {
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notificationId
            ? { ...n, read: true, readAt: new Date() }
            : n
        )
      );

      await notificationsAPI.markAsRead(notificationId);

      // Refresh context count
      if (notificationContext?.refreshUnreadCount) {
        setTimeout(() => {
          notificationContext.refreshUnreadCount();
        }, 500);
      }
    } catch (error) {
      console.error('[NotificationBell] Mark as read error:', error);
      // Revert optimistic update
      fetchNotifications();
      toast.error('Failed to mark as read');
    }
  };

  /**
   * Mark all as read
   */
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) {
      toast('No unread notifications', { icon: 'ℹ️' });
      return;
    }

    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date() }))
      );

      await notificationsAPI.markAllAsRead();

      toast.success('All marked as read');

      // Refresh context
      if (notificationContext?.refreshUnreadCount) {
        setTimeout(() => {
          notificationContext.refreshUnreadCount();
        }, 500);
      }
    } catch (error) {
      console.error('[NotificationBell] Mark all as read error:', error);
      fetchNotifications();
      toast.error('Failed to mark all as read');
    }
  };

  /**
   * Delete notification
   */
  const handleDelete = async (notificationId) => {
    try {
      // Optimistic update
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));

      await notificationsAPI.deleteNotification(notificationId);

      // Refresh context
      if (notificationContext?.refreshUnreadCount) {
        notificationContext.refreshUnreadCount();
      }
    } catch (error) {
      console.error('[NotificationBell] Delete error:', error);
      fetchNotifications();
      toast.error('Failed to delete');
    }
  };

  /**
   * Get notification icon and color
   */
  const getNotificationStyle = (notification) => {
    const { type, priority } = notification;

    // Priority-based styling
    if (priority === 'urgent') {
      return { color: 'bg-red-100 text-red-600', border: 'border-l-red-500' };
    }
    if (priority === 'high') {
      return {
        color: 'bg-orange-100 text-orange-600',
        border: 'border-l-orange-500',
      };
    }

    // Type-based styling
    const styles = {
      appointment: {
        color: 'bg-blue-100 text-blue-600',
        border: 'border-l-blue-500',
      },
      session: {
        color: 'bg-purple-100 text-purple-600',
        border: 'border-l-purple-500',
      },
      lab: {
        color: 'bg-green-100 text-green-600',
        border: 'border-l-green-500',
      },
      prescription: {
        color: 'bg-indigo-100 text-indigo-600',
        border: 'border-l-indigo-500',
      },
      payment: {
        color: 'bg-yellow-100 text-yellow-600',
        border: 'border-l-yellow-500',
      },
      medical_record: {
        color: 'bg-teal-100 text-teal-600',
        border: 'border-l-teal-500',
      },
      system: {
        color: 'bg-gray-100 text-gray-600',
        border: 'border-l-gray-500',
      },
      reminder: {
        color: 'bg-yellow-100 text-yellow-600',
        border: 'border-l-yellow-500',
      },
      alert: { color: 'bg-red-100 text-red-600', border: 'border-l-red-500' },
    };

    return (
      styles[type] || {
        color: 'bg-gray-100 text-gray-600',
        border: 'border-l-gray-500',
      }
    );
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Bell className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Notifications
                  </h3>
                  <p className="text-xs text-gray-500">{unreadCount} unread</p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex space-x-2">
              {['all', 'unread', 'read'].map((filterOption) => (
                <button
                  key={filterOption}
                  onClick={() => setFilter(filterOption)}
                  disabled={loading}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    filter === filterOption
                      ? 'bg-black text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 border border-gray-200'
                  }`}
                >
                  {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Actions Bar */}
          {(hasUnread || notifications.some((n) => n.read)) && (
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              {hasUnread && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={loading}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          )}

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
              </div>
            ) : notifications.filter((n) => (n.status || 'active') === 'active').length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Bell className="w-10 h-10 mb-2 text-gray-300" />
                <p className="text-xs font-medium">No notifications</p>
                <p className="text-xs text-gray-400 mt-1">
                  {filter === 'unread'
                    ? "You're all caught up!"
                    : 'Nothing to show'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications
                  .filter((notification) => (notification.status || 'active') === 'active')
                  .map((notification) => {
                  const style = getNotificationStyle(notification);
                  const isHighlighted = highlightedIds.has(notification._id);

                  return (
                    <div
                      key={notification._id}
                      className={`p-3 hover:bg-gray-50 transition-all ${
                        !notification.read
                          ? 'bg-blue-50 border-l-4 ' + style.border
                          : ''
                      } ${isHighlighted ? 'animate-pulse bg-yellow-50' : ''}`}
                    >
                      <div className="flex items-start space-x-3">
                        {/* Icon */}
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.color}`}
                        >
                          <Bell className="w-4 h-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 pr-2">
                              <div className="flex items-center space-x-2">
                                <h4 className="text-xs font-medium text-gray-900 line-clamp-1">
                                  {notification.title}
                                </h4>
                                {notification.priority === 'urgent' && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded">
                                    Urgent
                                  </span>
                                )}
                                {notification.priority === 'high' && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium text-orange-700 bg-orange-100 rounded">
                                    High
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                                {notification.message}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {formatRelativeTime(notification.createdAt)}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center space-x-1 ml-2">
                              {!notification.read && (
                                <button
                                  onClick={() =>
                                    handleMarkAsRead(notification._id)
                                  }
                                  className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                  title="Mark as read"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(notification._id)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
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
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => {
                setIsOpen(false);
                // Navigate to full notifications page if needed
              }}
              className="w-full text-xs text-center text-blue-600 hover:text-blue-700 font-medium"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
