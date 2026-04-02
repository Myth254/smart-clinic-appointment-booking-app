// hooks/useUsers.js
import { useState, useCallback, useRef } from 'react';
import { adminAPI } from '../api';
import toast from 'react-hot-toast';

/**
 * useUsers
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised user-list fetching for admin views.
 * - Deduplicates concurrent requests.
 * - Filters are stable: changing `params` triggers a new fetch only if
 *   the serialised value actually changed (prevents object identity issues).
 */
export const useUsers = () => {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [total,   setTotal]   = useState(0);

  const inFlightRef    = useRef(false);
  const lastParamsRef  = useRef('');

  const fetchUsers = useCallback(async (params = {}) => {
    const serialised = JSON.stringify(params);

    // Deduplicate: same params already in-flight or already loaded
    if (inFlightRef.current) return;
    if (serialised === lastParamsRef.current && users.length > 0) return;

    inFlightRef.current   = true;
    lastParamsRef.current = serialised;
    setLoading(true);
    setError(null);

    try {
      const res  = await adminAPI.getUsers(params);
      const data = res?.data ?? res;
      const list = Array.isArray(data) ? data : data?.users ?? [];
      setUsers(list);
      setTotal(data?.total ?? list.length);
      return list;
    } catch (err) {
      const msg = err?.response?.data?.message ?? 'Failed to fetch users';
      setError(msg);
      toast.error(msg);
      return [];
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [users.length]);

  const invalidate = useCallback(() => {
    lastParamsRef.current = ''; // Force next fetchUsers to hit the network
  }, []);

  return { users, loading, error, total, fetchUsers, invalidate, setUsers };
};