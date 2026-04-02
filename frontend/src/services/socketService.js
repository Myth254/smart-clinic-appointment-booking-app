// services/socketService.js
import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.isConnected = false;
  }

  /**
   * Connect to Socket.IO server
   * @param {string} token - JWT authentication token
   */
  connect(token) {
    if (this.socket?.connected) {
      console.log('✅ Already connected to socket server');
      return;
    }

    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to real-time server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from real-time server:', reason);
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.disconnect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  /**
   * ===================
   * SESSION MANAGEMENT
   * ===================
   */
  joinSession(sessionId) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }
    console.log('🔌 Joining session:', sessionId);
    this.socket.emit('join:session', sessionId);
  }

  leaveSession(sessionId) {
    if (!this.socket) return;
    console.log('👋 Leaving session:', sessionId);
    this.socket.emit('leave:session', sessionId);
  }

  onSessionJoined(callback) {
    this.socket?.on('session:joined', callback);
  }

  onSessionInvalid(callback) {
    this.socket?.on('session:invalid', callback);
  }

  onSessionStarted(callback) {
    this.socket?.on('session:started', callback);
  }

  onSessionActive(callback) {
    this.socket?.on('session:active', callback);
  }

  onSessionUpdate(callback) {
    this.socket?.on('session:updated', callback);
  }

  onSessionProgress(callback) {
    this.socket?.on('session:progress', callback);
  }

  onSessionCompleted(callback) {
    this.socket?.on('session:completed', callback);
  }

  onSessionAutoClosed(callback) {
    this.socket?.on('session:auto_closed', callback);
  }

  onSessionCancelled(callback) {
    this.socket?.on('session:cancelled', callback);
  }

  // Send heartbeat to check session status
  sessionHeartbeat(sessionId, callback) {
    this.socket?.emit('session:heartbeat', sessionId);
    this.socket?.once('session:heartbeat_response', callback);
  }

  /**
   * ==================
   * LAB UPDATES
   * ==================
   */
  onLabRequested(callback) {
    this.socket?.on('lab:requested', callback);
  }

  onLabAssigned(callback) {
    this.socket?.on('lab:assigned', callback);
  }

  onLabStatusChanged(callback) {
    this.socket?.on('lab:status_changed', callback);
  }

  onLabUpdate(callback) {
    this.socket?.on('lab:update', callback);
  }

  onLabResultsReady(callback) {
    this.socket?.on('lab:results_ready', callback);
  }

  onLabResultsUploaded(callback) {
    this.socket?.on('lab:results_uploaded', callback);
  }

  onLabResultsAvailable(callback) {
    this.socket?.on('lab:results_available', callback);
  }

  onLabCompleted(callback) {
    this.socket?.on('lab:completed', callback);
  }

  onLabNewRequest(callback) {
    this.socket?.on('lab:new_request', callback);
  }

  onLabRequestCreated(callback) {
    this.socket?.on('lab:request_created', callback);
  }

  onLabPaymentReceived(callback) {
    this.socket?.on('lab:payment_received', callback);
  }

  /**
   * =======================
   * PRESCRIPTION UPDATES
   * =======================
   */
  onPrescriptionConfirmed(callback) {
    this.socket?.on('prescription:confirmed', callback);
  }

  onPrescriptionAlternativeSuggested(callback) {
    this.socket?.on('prescription:alternative_suggested', callback);
  }

  onPrescriptionReady(callback) {
    this.socket?.on('prescription:ready', callback);
  }

  onPrescriptionDispensed(callback) {
    this.socket?.on('prescription:dispensed', callback);
  }

  onPrescriptionStatusChanged(callback) {
    this.socket?.on('prescription:status_changed', callback);
  }

  onPrescriptionUpdate(callback) {
    this.socket?.on('prescription:update', callback);
  }

  onPrescriptionPaymentReceived(callback) {
    this.socket?.on('prescription:payment_received', callback);
  }

  /**
   * ==================
   * PAYMENT UPDATES
   * ==================
   */
  onPaymentSuccess(callback) {
    this.socket?.on('payment:success', callback);
  }

  onPaymentPending(callback) {
    this.socket?.on('payment:pending', callback);
  }

  onPaymentReceived(callback) {
    this.socket?.on('payment:received', callback);
  }

  /**
   * ==================
   * BILLING UPDATES
   * ==================
   */

  /**
   * Fired when the server auto-creates a Bill for a session.
   * Payload: { billId, billNumber, totalAmount, balanceDue, status }
   */
  onBillCreated(callback) {
    this.socket?.on('session:bill_created', callback);
  }

  /**
   * Fired to the admin dashboard when a new bill is opened.
   * Payload: { billId, billNumber, appointmentId, sessionId, doctorId, totalAmount }
   */
  onBillOpened(callback) {
    this.socket?.on('billing:bill_opened', callback);
  }

  /**
   * =======================
   * NOTIFICATION UPDATES
   * =======================
   */

  /**
   * Listen for new notifications
   * Emitted when a new notification is created for the user
   * @param {Function} callback - Callback(notification)
   */
  onNewNotification(callback) {
    this.socket?.on('notification:new', callback);
  }

  /**
   * Listen for unread count updates
   * Emitted when the unread notification count changes
   * @param {Function} callback - Callback({ count: number })
   */
  onUnreadCountUpdate(callback) {
    this.socket?.on('notification:unread_count', callback);
  }

  /**
   * Listen for when all notifications are marked as read
   * Emitted when user marks all notifications as read
   * @param {Function} callback - Callback()
   */
  onAllMarkedRead(callback) {
    this.socket?.on('notification:all_marked_read', callback);
  }

  /**
   * Listen for when a specific notification is marked as read
   * Emitted when a single notification is marked as read
   * @param {Function} callback - Callback({ notificationId: string })
   */
  onNotificationRead(callback) {
    this.socket?.on('notification:read', callback);
  }

  /**
   * Request current unread count from server
   * Useful for sync after reconnection
   */
  requestUnreadCount() {
    this.socket?.emit('notification:get_unread_count');
  }

  /**
   * ========================
   * APPOINTMENT UPDATES
   * ========================
   */

  /**
   * Listen for new appointment creation
   * Emitted when a patient creates an appointment request
   * @param {Function} callback - Callback({ appointmentId, patientName, doctorId, start, end })
   */
  onAppointmentCreated(callback) {
    this.socket?.on('appointment:created', callback);
  }

  /**
   * Listen for appointment status updates
   * Emitted when appointment status changes
   * @param {Function} callback - Callback({ appointmentId, previousStatus, newStatus, updatedBy })
   */
  onAppointmentUpdated(callback) {
    this.socket?.on('appointment:updated', callback);
  }

  /**
   * Listen for appointment approvals
   * Emitted when doctor approves pending appointment
   * @param {Function} callback - Callback({ appointmentId, patientName, doctorName, start })
   */
  onAppointmentApproved(callback) {
    this.socket?.on('appointment:approved', callback);
  }

  /**
   * Listen for appointment cancellations
   * Emitted when appointment is cancelled
   * @param {Function} callback - Callback({ appointmentId, cancelledBy, reason })
   */
  onAppointmentCancelled(callback) {
    this.socket?.on('appointment:cancelled', callback);
  }

  /**
   * Listen for appointment completion
   * Emitted when doctor marks appointment as completed
   * @param {Function} callback - Callback({ appointmentId, patientName, completedAt })
   */
  onAppointmentCompleted(callback) {
    this.socket?.on('appointment:completed', callback);
  }

  /**
   * Listen for appointment no-show
   * Emitted when patient doesn't show up
   * @param {Function} callback - Callback({ appointmentId, patientName })
   */
  onAppointmentNoShow(callback) {
    this.socket?.on('appointment:no_show', callback);
  }

  /**
   * Listen for session expiring soon warning.
   * Emitted by the backend ~5 minutes before appointment.end so the doctor
   * can extend or begin wrapping up. Also fires after every extension at the
   * new -5 min mark.
   * @param {Function} callback - Callback({ sessionId, minutesLeft, appointmentEnd })
   */
  onSessionExpiringSoon(callback) {
    this.socket?.on('session:expiring_soon', callback);
  }

  /**
   * Listen for appointment reschedule
   * Emitted when appointment time is changed
   * @param {Function} callback - Callback({ appointmentId, oldStart, newStart, rescheduledBy })
   */
  onAppointmentRescheduled(callback) {
    this.socket?.on('appointment:rescheduled', callback);
  }

  /**
   * ==================
   * UTILITY METHODS
   * ==================
   */
  removeListener(event, callback) {
    this.socket?.off(event, callback);
  }

  removeAllListeners(event) {
    this.socket?.removeAllListeners(event);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('🔌 Socket disconnected');
    }
  }

  getConnectionStatus() {
    return this.isConnected;
  }
}

// Export singleton instance
export default new SocketService();