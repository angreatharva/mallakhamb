import { useState, useEffect } from 'react';
import { Shield, UserPlus, Edit, Trash2, UserCheck, UserX, Trophy, Plus, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../services/api';
import { ResponsiveContainer } from '../components/responsive';
import { ResponsiveHeading, ResponsiveText } from '../components/responsive/ResponsiveTypography';

const SuperAdminManagement = () => {
  const [activeSection, setActiveSection] = useState('competitions');
  const [admins, setAdmins] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [showCompetitionModal, setShowCompetitionModal] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);
  const [showAdminManagementModal, setShowAdminManagementModal] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  
  // Add Player state
  const [teams, setTeams] = useState([]);
  const [playerFormData, setPlayerFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    dateOfBirth: '',
    gender: 'Male',
    teamId: '',
    competitionId: '',
    paymentStatus: 'pending'
  });
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin'
  });

  const [competitionFormData, setCompetitionFormData] = useState({
    name: '',
    level: 'state',
    competitionTypes: ['competition_1'],
    place: '',
    year: new Date().getFullYear(),
    startDate: '',
    endDate: '',
    description: '',
    admins: [],
    ageGroups: []
  });

  // Default age groups list
  const defaultAgeGroups = [
    'Under8',
    'Under10',
    'Under12',
    'Under14',
    'Under16',
    'Under18',
    'Above18'
  ];

  const ageGroupLabels = {
    'Under8': 'Under 8',
    'Under10': 'Under 10',
    'Under12': 'Under 12',
    'Under14': 'Under 14',
    'Under16': 'Under 16',
    'Under18': 'Under 18',
    'Above18': 'Above 18'
  };

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
      } else if (activeSection === 'competitions') {
        const [competitionsResponse, adminsResponse] = await Promise.all([
          superAdminAPI.getAllCompetitions(),
          superAdminAPI.getAllAdmins()
        ]);
        setCompetitions(competitionsResponse.data.competitions);
        setAdmins(adminsResponse.data.admins);
      } else if (activeSection === 'addPlayer') {
        const [competitionsResponse, teamsResponse] = await Promise.all([
          superAdminAPI.getAllCompetitions(),
          superAdminAPI.getAllTeams()
        ]);
        setCompetitions(competitionsResponse.data.competitions);
        setTeams(teamsResponse.data.teams || []);
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

  const handleCreateCompetition = async (e) => {
    e.preventDefault();
    
    if (competitionFormData.admins.length === 0) {
      toast.error('At least one admin must be assigned to the competition');
      return;
    }

    if (competitionFormData.ageGroups.length === 0) {
      toast.error('At least one age group must be selected');
      return;
    }

    if (competitionFormData.competitionTypes.length === 0) {
      toast.error('At least one competition type must be selected');
      return;
    }

    try {
      await superAdminAPI.createCompetition(competitionFormData);
      toast.success('Competition created successfully');
      setShowCompetitionModal(false);
      resetCompetitionForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create competition');
    }
  };

  const handleUpdateCompetition = async (e) => {
    e.preventDefault();

    if (competitionFormData.competitionTypes.length === 0) {
      toast.error('At least one competition type must be selected');
      return;
    }

    try {
      const updateData = {
        name: competitionFormData.name,
        level: competitionFormData.level,
        competitionTypes: competitionFormData.competitionTypes,
        place: competitionFormData.place,
        startDate: competitionFormData.startDate,
        endDate: competitionFormData.endDate,
        description: competitionFormData.description,
        ageGroups: competitionFormData.ageGroups
      };
      
      await superAdminAPI.updateCompetition(editingCompetition._id, updateData);
      toast.success('Competition updated successfully');
      setShowCompetitionModal(false);
      setEditingCompetition(null);
      resetCompetitionForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update competition');
    }
  };

  const handleDeleteCompetition = async (competitionId) => {
    if (!window.confirm('Are you sure you want to delete this competition? This action cannot be undone.')) return;
    
    try {
      await superAdminAPI.deleteCompetition(competitionId);
      toast.success('Competition deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete competition');
    }
  };

  const handleAssignAdmin = async (adminId) => {
    try {
      await superAdminAPI.assignAdminToCompetition(selectedCompetition._id, { adminId });
      toast.success('Admin assigned successfully');
      fetchData();
      // Refresh selected competition data
      const response = await superAdminAPI.getCompetitionById(selectedCompetition._id);
      setSelectedCompetition(response.data.competition);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to assign admin');
    }
  };

  const handleRemoveAdmin = async (adminId) => {
    if (!window.confirm('Are you sure you want to remove this admin from the competition?')) return;
    
    try {
      await superAdminAPI.removeAdminFromCompetition(selectedCompetition._id, adminId);
      toast.success('Admin removed successfully');
      fetchData();
      // Refresh selected competition data
      const response = await superAdminAPI.getCompetitionById(selectedCompetition._id);
      setSelectedCompetition(response.data.competition);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove admin');
    }
  };

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    
    if (!playerFormData.competitionId) {
      toast.error('Please select a competition');
      return;
    }
    
    if (!playerFormData.teamId) {
      toast.error('Please select a team');
      return;
    }

    try {
      await superAdminAPI.addPlayerToTeam({
        ...playerFormData,
        team: playerFormData.teamId,
        competition: playerFormData.competitionId
      });
      toast.success('Player added successfully');
      setPlayerFormData({
        name: '',
        email: '',
        password: '',
        phone: '',
        dateOfBirth: '',
        gender: 'Male',
        teamId: '',
        competitionId: '',
        paymentStatus: 'pending'
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add player');
    }
  };

  const openCompetitionModal = (competition = null) => {
    if (competition) {
      setEditingCompetition(competition);
      setCompetitionFormData({
        name: competition.name,
        level: competition.level,
        competitionTypes: competition.competitionTypes || [],
        place: competition.place,
        year: competition.year || new Date().getFullYear(),
        startDate: competition.startDate.split('T')[0],
        endDate: competition.endDate.split('T')[0],
        description: competition.description || '',
        admins: competition.admins.map(a => a._id),
        ageGroups: competition.ageGroups || []
      });
    } else {
      setEditingCompetition(null);
      resetCompetitionForm();
    }
    setAdminSearchQuery('');
    setShowCompetitionModal(true);
  };

  const openAdminManagementModal = (competition) => {
    setSelectedCompetition(competition);
    setShowAdminManagementModal(true);
  };

  const resetCompetitionForm = () => {
    setCompetitionFormData({
      name: '',
      level: 'state',
      competitionTypes: ['competition_1'],
      place: '',
      year: new Date().getFullYear(),
      startDate: '',
      endDate: '',
      description: '',
      admins: [],
      ageGroups: []
    });
  };

  const toggleAdminSelection = (adminId) => {
    setCompetitionFormData(prev => ({
      ...prev,
      admins: prev.admins.includes(adminId)
        ? prev.admins.filter(id => id !== adminId)
        : [...prev.admins, adminId]
    }));
  };

  const toggleAgeGroup = (ageGroup, gender) => {
    setCompetitionFormData(prev => {
      const ageGroups = [...prev.ageGroups];
      const index = ageGroups.findIndex(
        ag => ag.ageGroup === ageGroup && ag.gender === gender
      );
      
      if (index >= 0) {
        // Remove if exists
        ageGroups.splice(index, 1);
      } else {
        // Add if doesn't exist
        ageGroups.push({ ageGroup, gender });
      }
      
      return {
        ...prev,
        ageGroups
      };
    });
  };

  const isAgeGroupSelected = (ageGroup, gender) => {
    return competitionFormData.ageGroups.some(
      ag => ag.ageGroup === ageGroup && ag.gender === gender
    );
  };

  const toggleCompetitionType = (type) => {
    setCompetitionFormData(prev => {
      const types = [...prev.competitionTypes];
      const index = types.indexOf(type);
      
      if (index >= 0) {
        // Remove if exists
        types.splice(index, 1);
      } else {
        // Add if doesn't exist
        types.push(type);
      }
      
      return {
        ...prev,
        competitionTypes: types
      };
    });
  };

  const isCompetitionTypeSelected = (type) => {
    return competitionFormData.competitionTypes.includes(type);
  };

  const filteredAdmins = admins
    .filter(admin => admin.role !== 'super_admin')
    .filter(admin => {
      if (!adminSearchQuery) return true;
      const query = adminSearchQuery.toLowerCase();
      return (
        admin.name.toLowerCase().includes(query) ||
        admin.email.toLowerCase().includes(query)
      );
    });

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
          <div className="flex space-x-4 overflow-x-auto">
            <button
              onClick={() => setActiveSection('competitions')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
                activeSection === 'competitions'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Trophy className="h-5 w-5" />
                <span>Competitions</span>
              </div>
            </button>
            <button
              onClick={() => setActiveSection('admins')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
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
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
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
            <button
              onClick={() => setActiveSection('addPlayer')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
                activeSection === 'addPlayer'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5" />
                <span>Add Player</span>
              </div>
            </button>
          </div>
        </div>

        {/* Competitions Section */}
        {activeSection === 'competitions' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <ResponsiveHeading level={3} className="text-gray-900">
                Competition Management
              </ResponsiveHeading>
              <button
                onClick={() => openCompetitionModal()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2"
              >
                <Plus className="h-5 w-5" />
                <span>Create Competition</span>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Place</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dates</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned Admins</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {competitions.map((competition) => (
                      <tr key={competition._id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{competition.name}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {competition.competitionTypes && competition.competitionTypes.length > 0 ? (
                              competition.competitionTypes.map((type) => (
                                <span key={type} className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 whitespace-nowrap">
                                  {type === 'competition_1' && 'Type I'}
                                  {type === 'competition_2' && 'Type II'}
                                  {type === 'competition_3' && 'Type III'}
                                </span>
                              ))
                            ) : (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">N/A</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                            {competition.level}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{competition.place}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {new Date(competition.startDate).toLocaleDateString()} - {new Date(competition.endDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            competition.status === 'ongoing'
                              ? 'bg-green-100 text-green-800'
                              : competition.status === 'upcoming'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {competition.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col space-y-1">
                            {competition.admins && competition.admins.length > 0 ? (
                              competition.admins.map((admin) => (
                                <span key={admin._id} className="text-sm text-gray-700">
                                  {admin.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-gray-400">No admins assigned</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openAdminManagementModal(competition)}
                              className="text-green-600 hover:text-green-800"
                              title="Manage Admins"
                            >
                              <UserPlus className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => openCompetitionModal(competition)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Edit Competition"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCompetition(competition._id)}
                              className="text-red-600 hover:text-red-800"
                              title="Delete Competition"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {competitions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No competitions found. Create your first competition to get started.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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

        {/* Add Player Section */}
        {activeSection === 'addPlayer' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <ResponsiveHeading level={3} className="text-gray-900 mb-6">
              Add Player to Team
            </ResponsiveHeading>

            <form onSubmit={handleAddPlayer} className="max-w-2xl space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Player Name *</label>
                  <input
                    type="text"
                    value={playerFormData.name}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={playerFormData.email}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input
                    type="password"
                    value={playerFormData.password}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={playerFormData.phone}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    value={playerFormData.dateOfBirth}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                  <select
                    value={playerFormData.gender}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Competition *</label>
                  <select
                    value={playerFormData.competitionId}
                    onChange={(e) => {
                      setPlayerFormData({ ...playerFormData, competitionId: e.target.value, teamId: '' });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="">Select Competition</option>
                    {competitions.map((comp) => (
                      <option key={comp._id} value={comp._id}>
                        {comp.name} {comp.year ? `(${comp.year})` : ''} - {comp.level} - {comp.place}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team *</label>
                  <select
                    value={playerFormData.teamId}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, teamId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                    disabled={!playerFormData.competitionId}
                  >
                    <option value="">Select Team</option>
                    {teams
                      .filter(team => team.competition?._id === playerFormData.competitionId || team.competitionId === playerFormData.competitionId)
                      .map((team) => (
                        <option key={team._id} value={team._id}>
                          {team.name}
                        </option>
                      ))}
                  </select>
                  {!playerFormData.competitionId && (
                    <p className="text-xs text-gray-500 mt-1">Select a competition first</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status *</label>
                  <select
                    value={playerFormData.paymentStatus}
                    onChange={(e) => setPlayerFormData({ ...playerFormData, paymentStatus: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setPlayerFormData({
                      name: '',
                      email: '',
                      password: '',
                      phone: '',
                      dateOfBirth: '',
                      gender: 'Male',
                      teamId: '',
                      competitionId: '',
                      paymentStatus: 'pending'
                    });
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
                >
                  Add Player
                </button>
              </div>
            </form>
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

        {/* Create/Edit Competition Modal */}
        {showCompetitionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl">
              {/* Modal Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-200 flex-shrink-0">
                <ResponsiveHeading level={3} className="text-gray-900">
                  {editingCompetition ? 'Edit Competition' : 'Create New Competition'}
                </ResponsiveHeading>
              </div>
              
              {/* Scrollable Content */}
              <form 
                id="competition-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingCompetition) {
                    handleUpdateCompetition(e);
                  } else {
                    handleCreateCompetition(e);
                  }
                }}
                className="flex-1 overflow-y-auto"
              >
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Competition Name *</label>
                    <input
                      type="text"
                      value={competitionFormData.name}
                      onChange={(e) => setCompetitionFormData({ ...competitionFormData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Level *</label>
                    <select
                      value={competitionFormData.level}
                      onChange={(e) => setCompetitionFormData({ ...competitionFormData, level: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    >
                      <option value="state">State</option>
                      <option value="national">National</option>
                      <option value="international">International</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Place *</label>
                    <input
                      type="text"
                      value={competitionFormData.place}
                      onChange={(e) => setCompetitionFormData({ ...competitionFormData, place: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
                    <select
                      value={competitionFormData.year}
                      onChange={(e) => setCompetitionFormData({ ...competitionFormData, year: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    >
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={competitionFormData.startDate}
                      onChange={(e) => setCompetitionFormData({ ...competitionFormData, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                    <input
                      type="date"
                      value={competitionFormData.endDate}
                      onChange={(e) => setCompetitionFormData({ ...competitionFormData, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                </div>

                {/* Competition Types Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Competition Type * (Select at least one)
                  </label>
                  <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 space-y-3">
                    <label className="flex items-start space-x-3 p-3 rounded-md hover:bg-purple-50 cursor-pointer transition-colors bg-white border border-gray-200">
                      <input
                        type="checkbox"
                        checked={isCompetitionTypeSelected('competition_1')}
                        onChange={() => toggleCompetitionType('competition_1')}
                        className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-900 block">Competition I</span>
                        <span className="text-xs text-gray-600">Team Championship & Qualifier</span>
                      </div>
                    </label>
                    <label className="flex items-start space-x-3 p-3 rounded-md hover:bg-purple-50 cursor-pointer transition-colors bg-white border border-gray-200">
                      <input
                        type="checkbox"
                        checked={isCompetitionTypeSelected('competition_2')}
                        onChange={() => toggleCompetitionType('competition_2')}
                        className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-900 block">Competition II</span>
                        <span className="text-xs text-gray-600">All Round Individual Final</span>
                      </div>
                    </label>
                    <label className="flex items-start space-x-3 p-3 rounded-md hover:bg-purple-50 cursor-pointer transition-colors bg-white border border-gray-200">
                      <input
                        type="checkbox"
                        checked={isCompetitionTypeSelected('competition_3')}
                        onChange={() => toggleCompetitionType('competition_3')}
                        className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-900 block">Competition III</span>
                        <span className="text-xs text-gray-600">Apparatus Championship</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={competitionFormData.description}
                    onChange={(e) => setCompetitionFormData({ ...competitionFormData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    rows="3"
                  />
                </div>

                {/* Age Groups Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age Groups * (Select at least one)
                  </label>
                  <div className="border border-gray-300 rounded-lg p-4 max-h-64 overflow-y-auto bg-gray-50">
                    <div className="space-y-3">
                      {defaultAgeGroups.map((ageGroup) => (
                        <div key={ageGroup} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="font-medium text-gray-800 mb-2 text-sm">{ageGroupLabels[ageGroup]}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center space-x-2 p-2 rounded-md hover:bg-purple-50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={isAgeGroupSelected(ageGroup, 'Male')}
                                onChange={() => toggleAgeGroup(ageGroup, 'Male')}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                              />
                              <span className="text-sm text-gray-700 font-medium">Male</span>
                            </label>
                            <label className="flex items-center space-x-2 p-2 rounded-md hover:bg-purple-50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={isAgeGroupSelected(ageGroup, 'Female')}
                                onChange={() => toggleAgeGroup(ageGroup, 'Female')}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                              />
                              <span className="text-sm text-gray-700 font-medium">Female</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                </div>

                {!editingCompetition && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Assign Admins * (Select at least one)
                    </label>
                    
                    {/* Search Bar */}
                    <div className="relative mb-3">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search admins by name or email..."
                        value={adminSearchQuery}
                        onChange={(e) => setAdminSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>

                    <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                      {filteredAdmins.map((admin) => (
                        <label key={admin._id} className="flex items-center space-x-2 py-2 px-2 rounded-md hover:bg-purple-50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={competitionFormData.admins.includes(admin._id)}
                            onChange={() => toggleAdminSelection(admin._id)}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                          />
                          <span className="text-sm text-gray-700">{admin.name} ({admin.email})</span>
                        </label>
                      ))}
                      {filteredAdmins.length === 0 && adminSearchQuery && (
                        <p className="text-sm text-gray-500 p-2">No admins found matching "{adminSearchQuery}"</p>
                      )}
                      {admins.filter(admin => admin.role !== 'super_admin').length === 0 && (
                        <p className="text-sm text-gray-500 p-2">No admins available. Create an admin first.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </form>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 bg-gray-50 rounded-b-xl">
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCompetitionModal(false);
                      setEditingCompetition(null);
                      resetCompetitionForm();
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="competition-form"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
                  >
                    {editingCompetition ? 'Update Competition' : 'Create Competition'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin Management Modal */}
        {showAdminManagementModal && selectedCompetition && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 my-8">
              <div className="flex justify-between items-center mb-4">
                <ResponsiveHeading level={3} className="text-gray-900">
                  Manage Admins - {selectedCompetition.name}
                </ResponsiveHeading>
                <button
                  onClick={() => {
                    setShowAdminManagementModal(false);
                    setSelectedCompetition(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Currently Assigned Admins */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Currently Assigned Admins</h4>
                <div className="space-y-2">
                  {selectedCompetition.admins && selectedCompetition.admins.length > 0 ? (
                    selectedCompetition.admins.map((admin) => (
                      <div key={admin._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{admin.name}</p>
                          <p className="text-sm text-gray-600">{admin.email}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveAdmin(admin._id)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                          disabled={selectedCompetition.admins.length === 1}
                          title={selectedCompetition.admins.length === 1 ? 'Cannot remove the last admin' : 'Remove admin'}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No admins assigned</p>
                  )}
                </div>
              </div>

              {/* Available Admins to Assign */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Available Admins</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {admins
                    .filter(admin => 
                      admin.role !== 'super_admin' && 
                      !selectedCompetition.admins.some(a => a._id === admin._id)
                    )
                    .map((admin) => (
                      <div key={admin._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{admin.name}</p>
                          <p className="text-sm text-gray-600">{admin.email}</p>
                        </div>
                        <button
                          onClick={() => handleAssignAdmin(admin._id)}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm"
                        >
                          Assign
                        </button>
                      </div>
                    ))}
                  {admins.filter(admin => 
                    admin.role !== 'super_admin' && 
                    !selectedCompetition.admins.some(a => a._id === admin._id)
                  ).length === 0 && (
                    <p className="text-sm text-gray-500">No available admins to assign</p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => {
                    setShowAdminManagementModal(false);
                    setSelectedCompetition(null);
                  }}
                  className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
};

export default SuperAdminManagement;
