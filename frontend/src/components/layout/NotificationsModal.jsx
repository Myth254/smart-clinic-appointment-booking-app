/* eslint-disable react-hooks/exhaustive-deps */
// components/layout/NotificationsModal.jsx - Enhanced Version
import React, { useState, useEffect, useRef, useContext } from 'react';
import {
  X,
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Filter,
  ExternalLink,
  Calendar,
  Clock,
} from 'lucide-react';
import { notificationsAPI } from '../../api/notifications';
import { useAuth } from '../../context/AuthContext';
import NotificationContext from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

/**
 * Format relative time
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

    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
};

/**
 * Enhanced NotificationsModal
 * - Full-screen notification center
 * - Advanced filtering
 * - Action buttons for notifications
 * - Navigation support
 * - Real-time updates
 */
const NotificationsModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const notificationContext = useContext(NotificationContext);

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const refreshTimeoutRef = useRef(null);

  // Use context values if available
  const unreadCount = notificationContext?.unreadCount || 0;

  /**
   * Fetch notifications with proper cancellation
   */
  const fetchNotifications = async (showLoader = true) => {
    if (isFetchingRef.current) {
      console.log('[NotificationsModal] Already fetching, skipping...');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    isFetchingRef.current = true;

    try {
      if (showLoader) {
        setLoading(true);
      }

      const params = { limit: 100 };

      // Apply read filter
      if (filter === 'read') {
        params.read = 'true';
      } else if (filter === 'unread') {
        params.read = 'false';
      }

      // Apply type filter
      if (typeFilter !== 'all') {
        params.type = typeFilter;
      }

      const response = await notificationsAPI.getNotifications(params, {
        signal: abortControllerRef.current.signal,
      });

      const sorted = [...(response.notifications || [])].sort((a, b) => {
        // Priority sort first
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const priorityA = priorityOrder[a.priority] ?? 2;
        const priorityB = priorityOrder[b.priority] ?? 2;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // Then by date
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      setNotifications(sorted);
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        console.log('[NotificationsModal] Request cancelled');
        return;
      }

      console.error('[NotificationsModal] Fetch error:', error);

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
   * Debounced refresh
   */
  const scheduleRefresh = (delay = 300) => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      if (isOpen && !isFetchingRef.current) {
        fetchNotifications(false);
      }
    }, delay);
  };

  /**
   * Mark notification as read
   */
  const handleMarkAsRead = async (notificationId) => {
    try {
      await notificationsAPI.markAsRead(notificationId);

      // Update local state immediately
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notificationId
            ? { ...n, read: true, readAt: new Date() }
            : n
        )
      );

      // Refresh context count
      if (notificationContext?.refreshUnreadCount) {
        setTimeout(() => {
          notificationContext.refreshUnreadCount();
        }, 500);
      }

      scheduleRefresh(1000);
    } catch (error) {
      console.error('[NotificationsModal] Mark as read error:', error);
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
      await notificationsAPI.markAllAsRead();

      // Update all notifications to read
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date() }))
      );

      toast.success('All marked as read');

      // Refresh context
      if (notificationContext?.refreshUnreadCount) {
        setTimeout(() => {
          notificationContext.refreshUnreadCount();
        }, 500);
      }

      scheduleRefresh(1000);
    } catch (error) {
      console.error('[NotificationsModal] Mark all as read error:', error);
      toast.error('Failed to mark all as read');
    }
  };

  /**
   * Delete notification
   */
  const handleDelete = async (notificationId) => {
    try {
      await notificationsAPI.deleteNotification(notificationId);

      // Remove from local state immediately
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));

      toast.success('Notification deleted');

      // Refresh context
      if (notificationContext?.refreshUnreadCount) {
        notificationContext.refreshUnreadCount();
      }
    } catch (error) {
      console.error('[NotificationsModal] Delete error:', error);
      toast.error('Failed to delete');
    }
  };

  /**
   * Clear all read notifications
   */
  const handleClearRead = async () => {
    const readCount = notifications.filter((n) => n.read).length;

    if (readCount === 0) {
      toast('No read notifications to clear', { icon: 'ℹ️' });
      return;
    }

    if (
      !window.confirm(
        `Clear ${readCount} read notification${readCount !== 1 ? 's' : ''}?`
      )
    ) {
      return;
    }

    try {
      await notificationsAPI.clearReadNotifications();

      // Remove read notifications from local state
      setNotifications((prev) => prev.filter((n) => !n.read));

      toast.success(
        `Cleared ${readCount} notification${readCount !== 1 ? 's' : ''}`
      );
    } catch (error) {
      console.error('[NotificationsModal] Clear read error:', error);
      toast.error('Failed to clear notifications');
    }
  };

  /**
   * Handle notification action (navigation)
   */
  const handleNotificationAction = (notification) => {
    // Mark as read first
    if (!notification.read) {
      handleMarkAsRead(notification._id);
    }

    // Navigate based on notification type and actionUrl
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
      onClose();
    } else {
      // Default navigation based on type
      const navigationMap = {
        appointment: '/appointments',
        session: '/sessions',
        lab: '/lab-results',
        prescription: '/prescriptions',
        payment: '/payments',
        medical_record: '/records',
      };

      const route = navigationMap[notification.type];
      if (route) {
        navigate(route);
        onClose();
      }
    }
  };

  /**
   * Fetch when modal opens or filter changes
   */
  useEffect(() => {
    if (isOpen && user?._id) {
      fetchNotifications();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      isFetchingRef.current = false;
    };
  }, [isOpen, filter, typeFilter]);

  /**
   * Listen for context updates when modal is open
   */
  useEffect(() => {
    if (isOpen && notificationContext?.unreadCount !== undefined) {
      scheduleRefresh(1500);
    }
  }, [notificationContext?.unreadCount, isOpen]);

  /**
   * Get notification styling
   */
  const getNotificationStyle = (notification) => {
    const { type, priority } = notification;

    if (priority === 'urgent') {
      return {
        icon: '🚨',
        color: 'bg-red-100 text-red-600',
        border: 'border-l-red-500',
        badge: 'bg-red-100 text-red-700',
      };
    }
    if (priority === 'high') {
      return {
        icon: '⚠️',
        color: 'bg-orange-100 text-orange-600',
        border: 'border-l-orange-500',
        badge: 'bg-orange-100 text-orange-700',
      };
    }

    const styles = {
      appointment: {
        icon: '📅',
        color: 'bg-blue-100 text-blue-600',
        border: 'border-l-blue-500',
      },
      session: {
        icon: '🩺',
        color: 'bg-purple-100 text-purple-600',
        border: 'border-l-purple-500',
      },
      lab: {
        icon: '🧪',
        color: 'bg-green-100 text-green-600',
        border: 'border-l-green-500',
      },
      prescription: {
        icon: '💊',
        color: 'bg-indigo-100 text-indigo-600',
        border: 'border-l-indigo-500',
      },
      payment: {
        icon: '💳',
        color: 'bg-yellow-100 text-yellow-600',
        border: 'border-l-yellow-500',
      },
      medical_record: {
        icon: '📋',
        color: 'bg-teal-100 text-teal-600',
        border: 'border-l-teal-500',
      },
      system: {
        icon: '⚙️',
        color: 'bg-gray-100 text-gray-600',
        border: 'border-l-gray-500',
      },
      reminder: {
        icon: '⏰',
        color: 'bg-yellow-100 text-yellow-600',
        border: 'border-l-yellow-500',
      },
      alert: {
        icon: '🔔',
        color: 'bg-red-100 text-red-600',
        border: 'border-l-red-500',
      },
    };

    return (
      styles[type] || {
        icon: '📬',
        color: 'bg-gray-100 text-gray-600',
        border: 'border-l-gray-500',
      }
    );
  };

  if (!isOpen) return null;

  const hasUnread = unreadCount > 0;
  const hasRead = notifications.some((n) => n.read);

  // Available notification types
  const notificationTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'appointment', label: 'Appointments' },
    { value: 'session', label: 'Sessions' },
    { value: 'lab', label: 'Lab Results' },
    { value: 'prescription', label: 'Prescriptions' },
    { value: 'payment', label: 'Payments' },
    { value: 'medical_record', label: 'Medical Records' },
    { value: 'reminder', label: 'Reminders' },
    { value: 'alert', label: 'Alerts' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Modal */}
        <div className="relative inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  Notification Center
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {unreadCount} unread • {notifications.length} total
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          {/* Filter & Actions Bar */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-3">
            {/* Read Status Filters */}
            <div className="flex items-center justify-between">
              <div className="flex space-x-2">
                {['all', 'unread', 'read'].map((filterOption) => (
                  <button
                    key={filterOption}
                    onClick={() => setFilter(filterOption)}
                    disabled={loading}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      filter === filterOption
                        ? 'bg-black text-white shadow-md'
                        : 'bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 border border-gray-200'
                    }`}
                  >
                    {filterOption.charAt(0).toUpperCase() +
                      filterOption.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                >
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                </button>

                {hasUnread && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={loading}
                    className="flex items-center space-x-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Mark all read</span>
                  </button>
                )}

                {hasRead && (
                  <button
                    onClick={handleClearRead}
                    disabled={loading}
                    className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Clear read notifications"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear read</span>
                  </button>
                )}
              </div>
            </div>

            {/* Type Filters */}
            {showFilters && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                {notificationTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setTypeFilter(type.value)}
                    disabled={loading}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      typeFilter === type.value
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 border border-gray-200'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                  <p className="text-sm text-gray-500">
                    Loading notifications...
                  </p>
                </div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Bell className="w-16 h-16 mb-4 text-gray-300" />
                <p className="text-lg font-medium">No notifications</p>
                <p className="text-sm text-gray-400 mt-2">
                  {filter === 'unread'
                    ? "You're all caught up!"
                    : 'Nothing to show'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.map((notification) => {
                  const style = getNotificationStyle(notification);

                  return (
                    <div
                      key={notification._id}
                      className={`p-5 hover:bg-gray-50 transition-all cursor-pointer ${
                        !notification.read
                          ? 'bg-blue-50 border-l-4 ' + style.border
                          : ''
                      }`}
                      onClick={() => handleNotificationAction(notification)}
                    >
                      <div className="flex items-start space-x-4">
                        {/* Icon */}
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl ${style.color}`}
                        >
                          {style.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 pr-4">
                              <div className="flex items-center space-x-2 mb-1">
                                <h3 className="text-base font-semibold text-gray-900">
                                  {notification.title}
                                </h3>
                                {notification.priority === 'urgent' && (
                                  <span className="px-2 py-0.5 text-xs font-bold text-red-700 bg-red-100 rounded-full animate-pulse">
                                    URGENT
                                  </span>
                                )}
                                {notification.priority === 'high' && (
                                  <span className="px-2 py-0.5 text-xs font-medium text-orange-700 bg-orange-100 rounded-full">
                                    High Priority
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                                {notification.message}
                              </p>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span className="flex items-center space-x-1">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {formatRelativeTime(notification.createdAt)}
                                  </span>
                                </span>
                                {notification.actionLabel && (
                                  <span className="flex items-center space-x-1 text-blue-600 font-medium">
                                    <ExternalLink className="w-3 h-3" />
                                    <span>{notification.actionLabel}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center space-x-1 ml-2">
                              {!notification.read && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkAsRead(notification._id);
                                  }}
                                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="Mark as read"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(notification._id);
                                }}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              Showing {notifications.length} notification
              {notifications.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsModal;