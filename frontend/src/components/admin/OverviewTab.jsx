/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Users, UserCheck, Calendar, TrendingUp } from 'lucide-react';
import { adminAPI } from '../../api';
import { format, parseISO } from 'date-fns';

const OverviewTab = () => {
  const [stats, setStats] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [appointmentTrends, setAppointmentTrends] = useState([]);
  const [revenueTrends, setRevenueTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentUsers();
    fetchDashboardData();
    // Mock data for trends - replace with actual API calls when available
    setAppointmentTrends([
      { month: 'May', count: 250 },
      { month: 'Jun', count: 320 },
      { month: 'Jul', count: 310 },
      { month: 'Aug', count: 410 },
      { month: 'Sep', count: 450 },
      { month: 'Oct', count: 420 }
    ]);
    setRevenueTrends([
      { month: 'May', revenue: 0 },
      { month: 'Jun', revenue: 0 },
      { month: 'Jul', revenue: 0 },
      { month: 'Aug', revenue: 0 },
      { month: 'Sep', revenue: 0 },
      { month: 'Oct', revenue: 0 }
    ]);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [statsRes, appointmentsRes, revenueRes] = await Promise.all([
        adminAPI.getDashboardStats(),
        adminAPI.getAppointmentAnalytics(),
        adminAPI.getRevenueAnalytics(),
      ]);

      setStats(statsRes);
      setAppointmentTrends(appointmentsRes?.monthlyStats || []);
      setRevenueTrends(revenueRes?.monthlyRevenue || []);

      // Optional: get recent users if your API supports it
      if (statsRes?.recentUsers) {
        setRecentUsers(statsRes.recentUsers);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentUsers = async () => {
    try {
      const data = await adminAPI.getRecentUsers();
      setRecentUsers(data.users || data || []);
    } catch (error) {
      console.error('Failed to fetch recent users:', error);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
       <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Patients */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Total Patients</h3>
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats?.users?.byRole?.patient ?? 0}</p>
            <p className="text-sm text-green-600">
              {stats?.users?.growth?.patients ?? '+0%'} from last month
            </p>
          </div>
        </div>

        {/* Active Doctors */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Active Doctors</h3>
            <UserCheck className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats?.users?.byRole?.doctor ?? 0}</p>
            <p className="text-sm text-gray-500">{stats?.users?.onLeave ?? 0} on leave</p>
          </div>
        </div>

        {/* Appointments this month */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">This Month</h3>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">
              {stats?.appointments?.recentBookings ?? 0}
            </p>
            <p className="text-sm text-gray-500">Appointments booked</p>
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Revenue</h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">
              ${stats?.revenue?.total?.toLocaleString() ?? '0'}
            </p>
            <p className="text-sm text-green-600">
              {stats?.revenue?.growth ?? '+0%'} from last month
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Appointment Trends */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold">Appointment Trends</h3>
            <p className="text-sm text-gray-500">Monthly appointment statistics</p>
          </div>
          <div className="h-64 flex items-end justify-between space-x-2">
            {appointmentTrends.map((data, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-black rounded-t"
                  style={{
                    height: `${(data.count / 600) * 100}%`,
                    minHeight: '20px'
                  }}
                ></div>
                <span className="text-xs text-gray-600 mt-2">{data.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue Growth */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold">Revenue Growth</h3>
            <p className="text-sm text-gray-500">Monthly revenue overview</p>
          </div>
          <div className="h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">Revenue tracking coming soon</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent User Registrations */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Recent User Registrations</h3>
          <p className="text-sm text-gray-500">New users who joined the platform</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    No recent registrations
                  </td>
                </tr>
              ) : (
                recentUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                          <span className="text-xs font-medium">
                            {user.firstName?.[0]}{user.lastName?.[0]}
                          </span>
                        </div>
                        <span className="text-sm font-medium">
                          {user.firstName} {user.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                      {user.role}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {user.createdAt ? format(parseISO(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 text-xs font-medium bg-black text-white rounded-full">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-black hover:underline">Manage</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;