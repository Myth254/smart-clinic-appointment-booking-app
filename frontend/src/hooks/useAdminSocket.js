// hooks/useAdminSocket.js
import { useEffect, useRef } from 'react';
import socketService from '../services/socketService';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook for admin real-time socket integration.
 *
 * Pattern: handlers are stored in a ref so the socket registration
 * runs ONCE on mount (no stale-closure issues, no re-registration churn).
 * Callers can pass a plain object literal — no useCallback needed.
 *
 * Supported handler keys:
 *   Session:      onSessionStarted, onSessionCompleted, onSessionCancelled, onSessionAutoClosed
 *   Appointment:  onAppointmentCreated, onAppointmentUpdated, onAppointmentApproved,
 *                 onAppointmentCancelled, onAppointmentCompleted
 *   Lab:          onLabRequested, onLabStatusChanged, onLabResultsUploaded, onLabCompleted, onLabUpdate
 *   Prescription: onPrescriptionConfirmed, onPrescriptionStatusChanged, onPrescriptionDispensed, onPrescriptionUpdate
 *   Payment:      onPaymentSuccess, onPaymentReceived
 */
export const useAdminSocket = (eventHandlers = {}) => {
  const { token } = useAuth();

  // Always keep the latest handlers available without re-registering listeners
  const handlersRef = useRef(eventHandlers);
  useEffect(() => {
    handlersRef.current = eventHandlers;
  });

  useEffect(() => {
    if (!token) return;

    socketService.connect(token);

    // Stable wrapper functions — these never change, but always delegate to
    // the current handlersRef so callers see up-to-date state closures.
    const wrap = (key) => (data) => {
      handlersRef.current[key]?.(data);
    };

    const wrappers = {
      // Session
      onSessionStarted:    wrap('onSessionStarted'),
      onSessionCompleted:  wrap('onSessionCompleted'),
      onSessionCancelled:  wrap('onSessionCancelled'),
      onSessionAutoClosed: wrap('onSessionAutoClosed'),
      // Appointment
      onAppointmentCreated:   wrap('onAppointmentCreated'),
      onAppointmentUpdated:   wrap('onAppointmentUpdated'),
      onAppointmentApproved:  wrap('onAppointmentApproved'),
      onAppointmentCancelled: wrap('onAppointmentCancelled'),
      onAppointmentCompleted: wrap('onAppointmentCompleted'),
      // Lab
      onLabRequested:       wrap('onLabRequested'),
      onLabStatusChanged:   wrap('onLabStatusChanged'),
      onLabResultsUploaded: wrap('onLabResultsUploaded'),
      onLabCompleted:       wrap('onLabCompleted'),
      onLabUpdate:          wrap('onLabUpdate'),
      // Prescription
      onPrescriptionConfirmed:     wrap('onPrescriptionConfirmed'),
      onPrescriptionStatusChanged: wrap('onPrescriptionStatusChanged'),
      onPrescriptionDispensed:     wrap('onPrescriptionDispensed'),
      onPrescriptionUpdate:        wrap('onPrescriptionUpdate'),
      // Payment
      onPaymentSuccess:  wrap('onPaymentSuccess'),
      onPaymentReceived: wrap('onPaymentReceived'),
    };

    // Register only the handlers the caller actually provided
    if (eventHandlers.onSessionStarted)    socketService.onSessionStarted(wrappers.onSessionStarted);
    if (eventHandlers.onSessionCompleted)  socketService.onSessionCompleted(wrappers.onSessionCompleted);
    if (eventHandlers.onSessionCancelled)  socketService.onSessionCancelled(wrappers.onSessionCancelled);
    if (eventHandlers.onSessionAutoClosed) socketService.onSessionAutoClosed(wrappers.onSessionAutoClosed);

    if (eventHandlers.onAppointmentCreated)   socketService.onAppointmentCreated(wrappers.onAppointmentCreated);
    if (eventHandlers.onAppointmentUpdated)   socketService.onAppointmentUpdated(wrappers.onAppointmentUpdated);
    if (eventHandlers.onAppointmentApproved)  socketService.onAppointmentApproved(wrappers.onAppointmentApproved);
    if (eventHandlers.onAppointmentCancelled) socketService.onAppointmentCancelled(wrappers.onAppointmentCancelled);
    if (eventHandlers.onAppointmentCompleted) socketService.onAppointmentCompleted(wrappers.onAppointmentCompleted);

    if (eventHandlers.onLabRequested)       socketService.onLabRequested(wrappers.onLabRequested);
    if (eventHandlers.onLabStatusChanged)   socketService.onLabStatusChanged(wrappers.onLabStatusChanged);
    if (eventHandlers.onLabResultsUploaded) socketService.onLabResultsUploaded(wrappers.onLabResultsUploaded);
    if (eventHandlers.onLabCompleted)       socketService.onLabCompleted(wrappers.onLabCompleted);
    if (eventHandlers.onLabUpdate)          socketService.onLabUpdate(wrappers.onLabUpdate);

    if (eventHandlers.onPrescriptionConfirmed)     socketService.onPrescriptionConfirmed(wrappers.onPrescriptionConfirmed);
    if (eventHandlers.onPrescriptionStatusChanged) socketService.onPrescriptionStatusChanged(wrappers.onPrescriptionStatusChanged);
    if (eventHandlers.onPrescriptionDispensed)     socketService.onPrescriptionDispensed(wrappers.onPrescriptionDispensed);
    if (eventHandlers.onPrescriptionUpdate)        socketService.onPrescriptionUpdate(wrappers.onPrescriptionUpdate);

    if (eventHandlers.onPaymentSuccess)  socketService.onPaymentSuccess(wrappers.onPaymentSuccess);
    if (eventHandlers.onPaymentReceived) socketService.onPaymentReceived(wrappers.onPaymentReceived);

    // Cleanup: remove only the specific wrapper functions we registered
    return () => {
      if (eventHandlers.onSessionStarted)    socketService.removeListener('session:started', wrappers.onSessionStarted);
      if (eventHandlers.onSessionCompleted)  socketService.removeListener('session:completed', wrappers.onSessionCompleted);
      if (eventHandlers.onSessionCancelled)  socketService.removeListener('session:cancelled', wrappers.onSessionCancelled);
      if (eventHandlers.onSessionAutoClosed) socketService.removeListener('session:auto_closed', wrappers.onSessionAutoClosed);

      if (eventHandlers.onAppointmentCreated)   socketService.removeListener('appointment:created', wrappers.onAppointmentCreated);
      if (eventHandlers.onAppointmentUpdated)   socketService.removeListener('appointment:updated', wrappers.onAppointmentUpdated);
      if (eventHandlers.onAppointmentApproved)  socketService.removeListener('appointment:approved', wrappers.onAppointmentApproved);
      if (eventHandlers.onAppointmentCancelled) socketService.removeListener('appointment:cancelled', wrappers.onAppointmentCancelled);
      if (eventHandlers.onAppointmentCompleted) socketService.removeListener('appointment:completed', wrappers.onAppointmentCompleted);

      if (eventHandlers.onLabRequested)       socketService.removeListener('lab:requested', wrappers.onLabRequested);
      if (eventHandlers.onLabStatusChanged)   socketService.removeListener('lab:status_changed', wrappers.onLabStatusChanged);
      if (eventHandlers.onLabResultsUploaded) socketService.removeListener('lab:results_uploaded', wrappers.onLabResultsUploaded);
      if (eventHandlers.onLabCompleted)       socketService.removeListener('lab:completed', wrappers.onLabCompleted);
      if (eventHandlers.onLabUpdate)          socketService.removeListener('lab:update', wrappers.onLabUpdate);

      if (eventHandlers.onPrescriptionConfirmed)     socketService.removeListener('prescription:confirmed', wrappers.onPrescriptionConfirmed);
      if (eventHandlers.onPrescriptionStatusChanged) socketService.removeListener('prescription:status_changed', wrappers.onPrescriptionStatusChanged);
      if (eventHandlers.onPrescriptionDispensed)     socketService.removeListener('prescription:dispensed', wrappers.onPrescriptionDispensed);
      if (eventHandlers.onPrescriptionUpdate)        socketService.removeListener('prescription:update', wrappers.onPrescriptionUpdate);

      if (eventHandlers.onPaymentSuccess)  socketService.removeListener('payment:success', wrappers.onPaymentSuccess);
      if (eventHandlers.onPaymentReceived) socketService.removeListener('payment:received', wrappers.onPaymentReceived);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Only re-run if token changes (login/logout)

  return {
    isConnected: socketService.getConnectionStatus(),
    socket: socketService.socket,
  };
};

export default useAdminSocket;