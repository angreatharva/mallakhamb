import { useState, useEffect } from 'react';
import { Shield, UserPlus, Edit, Trash2, UserCheck, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../services/api';
import { ResponsiveContainer } from '../components/responsive';
import { ResponsiveHeading, ResponsiveText } from '../components/responsive/ResponsiveTypography';

const SuperAdminManagement = () => {
  const [activeSection, setActiveSection] = useState('admins');
  const [admins, setAdmins] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin'
  });

  useEffect(() => {
    fetchData();
  }, [activeSection]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeSection === 'admins') {
        const response = await superAdminAPI.getAllAdmins();
        setAdmins(response.data.admins);
      } else if (activeSection === 'coaches') {
        const response = await superAdminAPI.getAllCoaches();
        setCoaches(response.data.coaches);
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    try {
      await superAdminAPI.createAdmin(formData);
      toast.success('Admin created successfully');
      setShowAddAdminModal(false);
      setFormData({ name: '', email: '', password: '', role: 'admin' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create admin');
    }
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    try {
      await superAdminAPI.updateAdmin(editingAdmin._id, {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive
      });
      toast.success('Admin updated successfully');
      setEditingAdmin(null);
      setFormData({ name: '', email: '', password: '', role: 'admin' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update admin');
    }
  };

  const handleDeleteAdmin = async (adminId) => {
    if (!window.confirm('Are you sure you want to delete this admin?')) return;
    
    try {
      await superAdminAPI.deleteAdmin(adminId);
      toast.success('Admin deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete admin');
    }
  };

  const handleToggleCoachStatus = async (coachId, currentStatus) => {
    try {
      await superAdminAPI.updateCoachStatus(coachId, { isActive: !currentStatus });
      toast.success(`Coach ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update coach status');
    }
  };

  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name,
      email: admin.email,
      password: '',
      role: admin.role,
      isActive: admin.isActive
    });
  };

  return (
    <ResponsiveContainer maxWidth="desktop" padding="responsive">
      <div className="space-y-6">
        {/* Section Tabs */}
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveSection('admins')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeSection === 'admins'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Admins</span>
              </div>
            </button>
            <button
              onClick={() => setActiveSection('coaches')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeSection === 'coaches'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <UserCheck className="h-5 w-5" />
                <span>Coaches</span>
              </div>
            </button>
          </div>
        </div>

        {/* Admins Section */}
        {activeSection === 'admins' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <ResponsiveHeading level={3} className="text-gray-900">
                Admin Management
              </ResponsiveHeading>
              <button
                onClick={() => setShowAddAdminModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2"
              >
                <UserPlus className="h-5 w-5" />
                <span>Add Admin</span>
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {admins.map((admin) => (
                      <tr key={admin._id}>
                        <td className="px-6 py-4 whitespace-nowrap">{admin.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{admin.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            admin.role === 'super_admin'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            admin.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {admin.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openEditModal(admin)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAdmin(admin._id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Coaches Section */}
        {activeSection === 'coaches' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <ResponsiveHeading level={3} className="text-gray-900 mb-6">
              Coach Management
            </ResponsiveHeading>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {coaches.map((coach) => (
                      <tr key={coach._id}>
                        <td className="px-6 py-4 whitespace-nowrap">{coach.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{coach.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{coach.phone || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            coach.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {coach.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleCoachStatus(coach._id, coach.isActive)}
                            className={`px-3 py-1 rounded text-sm ${
                              coach.isActive
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            {coach.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Admin Modal */}
        {(showAddAdminModal || editingAdmin) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <ResponsiveHeading level={3} className="text-gray-900 mb-4">
                {editingAdmin ? 'Edit Admin' : 'Add New Admin'}
              </ResponsiveHeading>
              
              <form onSubmit={editingAdmin ? handleUpdateAdmin : handleAddAdmin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                {!editingAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                {editingAdmin && (
                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    {editingAdmin ? 'Update' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAdminModal(false);
                      setEditingAdmin(null);
                      setFormData({ name: '', email: '', password: '', role: 'admin' });
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
};

export default SuperAdminManagement;
