// hooks/useAppointments.js
import { useState, useCallback, useRef } from 'react';
import { appointmentsAPI } from '../api';
import toast from 'react-hot-toast';

/**
 * useAppointments
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source-of-truth for appointment data.
 * - Fetches once; callers call `refresh()` when they need fresh data.
 * - Deduplicates concurrent requests via an in-flight ref.
 * - Splits the raw list into `upcoming` and `history` for the patient view.
 * - Exposes `all` for views that need the unfiltered list (doctor / admin).
 */
export const useAppointments = (options = {}) => {
  const { limit = 1000, offset = 0 } = options;

  const [all, setAll]         = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  // Prevent concurrent identical requests
  const inFlightRef = useRef(false);

  const fetch = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await appointmentsAPI.getAppointments({ limit, offset });
      const payload  = response?.data ?? response;
      const data     = Array.isArray(payload) ? payload : payload?.appointments ?? [];

      setAll(data);

      // Split for patient dashboard
      const now = new Date();
      setUpcoming(
        data.filter(
          (a) =>
            ['pending', 'pending_confirmation', 'approved'].includes(a.status) &&
            new Date(a.start) > now
        )
      );
      setHistory(
        data.filter(
          (a) =>
            a.status === 'completed' ||
            a.status === 'cancelled' ||
            new Date(a.start) <= now
        )
      );

      return data;
    } catch (err) {
      const msg = err?.response?.data?.message ?? 'Failed to fetch appointments';
      setError(msg);
      toast.error(msg);
      return [];
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [limit, offset]);

  return { all, upcoming, history, loading, error, refresh: fetch };
};