import { useState, useEffect } from 'react';
import {
  Users,
  Filter,
  UserPlus,
  Save,
  Edit,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveForm, ResponsiveFormField, ResponsiveInput, ResponsiveButton } from '../components/responsive/ResponsiveForm';
import { ResponsiveTable } from '../components/responsive/ResponsiveTable';
import { useResponsive } from '../hooks/useResponsive';

const Judges = () => {
  // State management
  const [judges, setJudges] = useState([]);
  const [judgeFormData, setJudgeFormData] = useState([
    { judgeNo: 1, judgeType: 'Senior Judge', name: '', username: '', password: '' },
    { judgeNo: 2, judgeType: 'Judge 1', name: '', username: '', password: '' },
    { judgeNo: 3, judgeType: 'Judge 2', name: '', username: '', password: '' },
    { judgeNo: 4, judgeType: 'Judge 3', name: '', username: '', password: '' },
    { judgeNo: 5, judgeType: 'Judge 4', name: '', username: '', password: '' }
  ]);
  const [editingJudge, setEditingJudge] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', username: '', password: '' });

  // Filters
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [judgeType, setJudgeType] = useState('add'); // 'add', 'list'
  const [judgesExistForSelection, setJudgesExistForSelection] = useState(false);
  const [checkingExistingJudges, setCheckingExistingJudges] = useState(false);
  const [loadingJudges, setLoadingJudges] = useState(false);

  // Responsive hook
  const { isMobile, isTablet } = useResponsive();

  // Filter options
  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  const boysAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' }
  ];

  const girlsAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' }
  ];

  const judgeTypes = [
    { value: 'add', label: 'Add Judge' },
    { value: 'list', label: 'Judge List' }
  ];

  // Get available age groups based on selected gender
  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender.value === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };

  // Reset age group when gender changes
  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null);
      setJudgesExistForSelection(false);
      setCheckingExistingJudges(false);
      setLoadingJudges(false);
      // Clear judges list when gender changes
      if (judgeType === 'list') {
        setJudges([]);
      }
    }
  }, [selectedGender]);

  // Check for existing judges when age group is selected
  const checkForExistingJudges = async (gender, ageGroup) => {
    if (!gender || !ageGroup) return false;

    try {
      const params = {
        gender: gender.value,
        ageGroup: ageGroup.value
      };
      const response = await adminAPI.getJudges(params);
      // Check if there are any actual judges (not empty placeholders)
      const actualJudges = response.data.judges.filter(judge =>
        judge._id &&
        !judge.isEmpty &&
        judge.name &&
        judge.name.trim() !== ''
      );
      return actualJudges.length > 0;
    } catch (error) {
      console.error('Error checking existing judges:', error);
      return false;
    }
  };

  // Handle age group selection with validation
  const handleAgeGroupChange = async (ageGroupOption) => {
    if (!selectedGender || !ageGroupOption) {
      setSelectedAgeGroup(ageGroupOption);
      setJudgesExistForSelection(false);
      setCheckingExistingJudges(false);
      return;
    }

    setCheckingExistingJudges(true);
    
    try {
      // Check if judges already exist for this combination
      const judgesExist = await checkForExistingJudges(selectedGender, ageGroupOption);
      setJudgesExistForSelection(judgesExist);
      
      if (judgesExist && judgeType === 'add') {
        toast.error(`Judges already exist for ${selectedGender.label} - ${ageGroupOption.label}. Switch to "Judge List" to view or edit existing judges.`);
        return; // Don't set the age group if judges already exist
      }

      setSelectedAgeGroup(ageGroupOption);

      // Auto-load judges if in "list" mode and both gender and age group are selected
      if (judgeType === 'list' && selectedGender && ageGroupOption) {
        await fetchJudgesWithParams(selectedGender.value, ageGroupOption.value);
      }
    } finally {
      setCheckingExistingJudges(false);
    }
  };

  // Reset judge form when gender or age group changes for judges
  useEffect(() => {
    if (judgeType === 'add') {
      setJudgeFormData([
        { judgeNo: 1, judgeType: 'Senior Judge', name: '', username: '', password: '' },
        { judgeNo: 2, judgeType: 'Judge 1', name: '', username: '', password: '' },
        { judgeNo: 3, judgeType: 'Judge 2', name: '', username: '', password: '' },
        { judgeNo: 4, judgeType: 'Judge 3', name: '', username: '', password: '' },
        { judgeNo: 5, judgeType: 'Judge 4', name: '', username: '', password: '' }
      ]);
    }
    // Reset judges exist state when switching judge types
    if (judgeType === 'list') {
      setJudgesExistForSelection(false);
      setCheckingExistingJudges(false);
      setLoadingJudges(false);
    }
  }, [selectedGender, selectedAgeGroup, judgeType]);

  // Auto-load judges when switching to list mode with both filters selected
  useEffect(() => {
    if (judgeType === 'list' && selectedGender && selectedAgeGroup) {
      fetchJudges();
    } else if (judgeType === 'list') {
      // Clear judges when switching to list mode without both filters
      setJudges([]);
    }
  }, [judgeType]);

  // API Functions
  const fetchJudges = async () => {
    setLoadingJudges(true);
    try {
      const params = {};
      if (selectedGender) params.gender = selectedGender.value;
      if (selectedAgeGroup) params.ageGroup = selectedAgeGroup.value;

      const response = await adminAPI.getJudges(params);
      setJudges(response.data.judges);
    } catch (error) {
      toast.error('Failed to load judges');
    } finally {
      setLoadingJudges(false);
    }
  };

  const fetchJudgesWithParams = async (gender, ageGroup) => {
    setLoadingJudges(true);
    try {
      const params = { gender, ageGroup };
      const response = await adminAPI.getJudges(params);
      setJudges(response.data.judges);
    } catch (error) {
      toast.error('Failed to load judges');
    } finally {
      setLoadingJudges(false);
    }
  };

  const handleJudgeFormChange = (index, field, value) => {
    const updatedFormData = [...judgeFormData];
    updatedFormData[index][field] = value;
    setJudgeFormData(updatedFormData);
  };

  const generateUsername = (name, judgeType) => {
    if (!name) return '';

    // Split name into words and get first letter of each word
    const nameWords = name.trim().split(/\s+/);
    const initials = nameWords.map(word => word.charAt(0).toLowerCase()).join('');

    // Generate prefix based on judge type
    let prefix = '';
    if (judgeType === 'Senior Judge') {
      prefix = 'srj';
    } else if (judgeType === 'Judge 1') {
      prefix = 'j1';
    } else if (judgeType === 'Judge 2') {
      prefix = 'j2';
    } else if (judgeType === 'Judge 3') {
      prefix = 'j3';
    } else if (judgeType === 'Judge 4') {
      prefix = 'j4';
    }

    return `${prefix}_${initials}`;
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const checkExistingJudges = async () => {
    if (!selectedGender || !selectedAgeGroup) return false;

    try {
      const params = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      };
      const response = await adminAPI.getJudges(params);
      // Check if there are any actual judges (not empty placeholders)
      const actualJudges = response.data.judges.filter(judge =>
        judge._id &&
        !judge.isEmpty &&
        judge.name &&
        judge.name.trim() !== ''
      );
      return actualJudges.length > 0;
    } catch (error) {
      return false;
    }
  };

  const handleSaveJudges = async () => {
    if (!selectedGender || !selectedAgeGroup) {
      toast.error('Please select gender and age group first');
      return;
    }

    // Check if judges already exist
    const judgesExist = await checkExistingJudges();
    if (judgesExist) {
      toast.error('Judges already exist for this gender and age group. Use the Judge List to edit existing judges.');
      return;
    }

    // Validate at least one judge has name and password
    const validJudges = judgeFormData.filter(judge => judge.name.trim() && judge.password.trim());
    if (validJudges.length === 0) {
      toast.error('Please fill in at least one judge with name and password');
      return;
    }

    try {
      // Clean and validate judge data before sending
      const cleanedJudges = judgeFormData.map(judge => ({
        judgeNo: judge.judgeNo,
        judgeType: judge.judgeType,
        name: judge.name ? judge.name.trim() : '',
        username: judge.username ? judge.username.trim() : '',
        password: judge.password ? judge.password.trim() : ''
      }));

      const judgesData = {
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        judges: cleanedJudges
      };

      const response = await adminAPI.saveJudges(judgesData);
      toast.success(`Judge panel created! ${response.data.filledSlots} judges added, ${response.data.emptySlots} slots available for editing.`);

      // Reset form
      setJudgeFormData([
        { judgeNo: 1, judgeType: 'Senior Judge', name: '', username: '', password: '' },
        { judgeNo: 2, judgeType: 'Judge 1', name: '', username: '', password: '' },
        { judgeNo: 3, judgeType: 'Judge 2', name: '', username: '', password: '' },
        { judgeNo: 4, judgeType: 'Judge 3', name: '', username: '', password: '' },
        { judgeNo: 5, judgeType: 'Judge 4', name: '', username: '', password: '' }
      ]);
    } catch (error) {
      console.error('Save judges error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else if (error.response?.data?.errors) {
        toast.error('Validation error: ' + error.response.data.errors.map(e => e.msg).join(', '));
      } else {
        toast.error('Failed to save judges. Please check the console for details.');
      }
    }
  };

  const handleEditJudge = (judge) => {
    setEditingJudge(judge);
    const initialUsername = judge.username || (judge.name ? generateUsername(judge.name, judge.judgeType) : '');
    setEditFormData({
      name: judge.name || '',
      username: initialUsername,
      password: judge.password || ''
    });
  };

  const handleUpdateJudge = async () => {
    if (!editFormData.name.trim() || !editFormData.password.trim()) {
      toast.error('Please fill in name and password');
      return;
    }

    if (!editFormData.username || !editFormData.username.trim()) {
      toast.error('Please provide a username. You can click "Auto" to generate one from the name.');
      return;
    }

    try {
      const updatedData = {
        name: editFormData.name.trim(),
        username: editFormData.username.trim(),
        password: editFormData.password.trim()
      };

      if (editingJudge._id && !editingJudge.isEmpty) {
        // Update existing judge
        await adminAPI.updateJudge(editingJudge._id, updatedData);
        toast.success('Judge updated successfully!');
      } else {
        // Create new judge for empty slot
        const newJudgeData = {
          gender: editingJudge.gender,
          ageGroup: editingJudge.ageGroup,
          judgeNo: editingJudge.judgeNo,
          judgeType: editingJudge.judgeType,
          ...updatedData
        };
        await adminAPI.createSingleJudge(newJudgeData);
        toast.success('Judge added successfully!');
      }

      // Refresh judges list
      fetchJudges();

      // Close edit modal
      setEditingJudge(null);
      setEditFormData({ name: '', username: '', password: '' });
    } catch (error) {
      console.error('Update judge error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to save judge');
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingJudge(null);
    setEditFormData({ name: '', username: '', password: '' });
  };

  return (
    <ResponsiveContainer maxWidth="full" className="py-6">
      <div className="bg-white rounded-2xl shadow-lg p-4 md:p-8">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Judge Management</h2>

        {/* Judge Type Selection - Mobile-first responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Judge Action</label>
            <Dropdown
              options={judgeTypes}
              value={judgeTypes.find(j => j.value === judgeType)}
              onChange={(option) => {
                setJudgeType(option.value);
                // If switching to 'add' and both gender and age group are selected, check for existing judges
                if (option.value === 'add' && selectedGender && selectedAgeGroup) {
                  handleAgeGroupChange(selectedAgeGroup);
                }
              }}
              placeholder="Select action"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gender <span className="text-red-500">*</span>
            </label>
            <Dropdown
              options={genders}
              value={selectedGender}
              onChange={setSelectedGender}
              placeholder="Select gender first"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Age Group</label>
            <Dropdown
              options={getAvailableAgeGroups()}
              value={selectedAgeGroup}
              onChange={handleAgeGroupChange}
              placeholder={selectedGender ? "Select age group" : "Select gender first"}
              disabled={!selectedGender}
            />
            {!selectedGender && (
              <p className="text-xs text-gray-500 mt-1">Please select gender first to see available age groups</p>
            )}
            {selectedGender && !checkingExistingJudges && (
              <p className="text-xs text-blue-600 mt-1">
                {selectedGender.value === 'Male'
                  ? 'Available: U10, U12, U14, U18, Above 18'
                  : 'Available: U10, U12, U14, U16, Above 16'
                }
              </p>
            )}
            {checkingExistingJudges && (
              <p className="text-xs text-orange-600 mt-1">
                {judgeType === 'add' ? 'Checking for existing judges...' : 'Loading judges...'}
              </p>
            )}
          </div>
        </div>

        {judgeType === 'list' && (selectedGender || selectedAgeGroup) && (
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 space-y-2 md:space-y-0">
            <div className="text-sm text-gray-600">
              {selectedGender && selectedAgeGroup ? (
                <span>Showing judges for: <strong>{selectedGender.label} - {selectedAgeGroup.label}</strong></span>
              ) : (
                <span>Select both gender and age group to view judges</span>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedGender(null);
                setSelectedAgeGroup(null);
                setJudges([]);
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 min-h-[44px]"
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* Judge Content */}
        {judgeType === 'add' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Add Judges</h3>

            {!selectedGender || !selectedAgeGroup ? (
              <div className="text-center py-8">
                <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Please select gender and age group first to add judges.</p>
              </div>
            ) : judgesExistForSelection ? (
              <div className="text-center py-8">
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center justify-center mb-2">
                    <Users className="h-8 w-8 text-yellow-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                    Judges Already Exist
                  </h3>
                  <p className="text-yellow-700 mb-3">
                    A judge panel already exists for <strong>{selectedGender.label} - {selectedAgeGroup.label}</strong>
                  </p>
                  <p className="text-sm text-yellow-600 mb-4">
                    You cannot create a new judge panel for this combination. Use "Judge List" to view or edit existing judges.
                  </p>
                  <button
                    onClick={() => setJudgeType('list')}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors min-h-[44px]"
                  >
                    Switch to Judge List
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800 mb-2">
                    <strong>Adding judges for:</strong> {selectedGender.label} - {selectedAgeGroup.label}
                  </p>
                  <div className="text-xs text-blue-600 space-y-1">
                    <p>• All 5 judge slots will be created (minimum 1 judge required, maximum 5 judges allowed)</p>
                    <p>• Empty slots can be filled later using the "Judge List" feature</p>
                    <p>• Usernames are auto-generated but can be edited</p>
                  </div>
                </div>

                {/* Mobile-friendly judge form */}
                {isMobile ? (
                  <div className="space-y-6">
                    {judgeFormData.map((judge, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 border">
                        <div className="mb-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-gray-900">Judge {judge.judgeNo}</span>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              judge.judgeType === 'Senior Judge'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {judge.judgeType}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <ResponsiveInput
                              type="text"
                              value={judge.name}
                              onChange={(e) => {
                                const newName = e.target.value;
                                handleJudgeFormChange(index, 'name', newName);
                                // Auto-generate username when name changes
                                if (newName) {
                                  const username = generateUsername(newName, judge.judgeType);
                                  handleJudgeFormChange(index, 'username', username);
                                }
                              }}
                              placeholder="Enter judge name"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                            <ResponsiveInput
                              type="text"
                              value={judge.username}
                              onChange={(e) => handleJudgeFormChange(index, 'username', e.target.value)}
                              placeholder="Auto-generated"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <div className="flex space-x-2">
                              <ResponsiveInput
                                type="text"
                                value={judge.password}
                                onChange={(e) => handleJudgeFormChange(index, 'password', e.target.value)}
                                placeholder="Enter password"
                                className="flex-1"
                              />
                              <button
                                type="button"
                                onClick={() => handleJudgeFormChange(index, 'password', generatePassword())}
                                className="px-3 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm min-h-[44px] min-w-[60px]"
                              >
                                Gen
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Desktop table layout
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Judge No
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Judge Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Username
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Password
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {judgeFormData.map((judge, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {judge.judgeNo}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${judge.judgeType === 'Senior Judge'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                                }`}>
                                {judge.judgeType}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="text"
                                value={judge.name}
                                onChange={(e) => {
                                  const newName = e.target.value;
                                  handleJudgeFormChange(index, 'name', newName);
                                  // Auto-generate username when name changes
                                  if (newName) {
                                    const username = generateUsername(newName, judge.judgeType);
                                    handleJudgeFormChange(index, 'username', username);
                                  }
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter judge name"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="text"
                                value={judge.username}
                                onChange={(e) => handleJudgeFormChange(index, 'username', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Auto-generated"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex space-x-2">
                                <input
                                  type="text"
                                  value={judge.password}
                                  onChange={(e) => handleJudgeFormChange(index, 'password', e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                  placeholder="Enter password"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleJudgeFormChange(index, 'password', generatePassword())}
                                  className="px-2 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-xs"
                                >
                                  Gen
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <ResponsiveButton
                    onClick={handleSaveJudges}
                    variant="success"
                    className="flex items-center space-x-2"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Judges</span>
                  </ResponsiveButton>
                </div>
              </div>
            )}
          </div>
        )}

        {judgeType === 'list' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Judge List</h3>

            {loadingJudges ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading judges...</p>
              </div>
            ) : judges.length > 0 ? (
              <div>
                <div className="mb-4 p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-800">
                    <strong>Judge Panel for:</strong> {selectedGender?.label} - {selectedAgeGroup?.label}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Showing all 5 judge slots. Empty slots can be filled by clicking "Add" button.
                  </p>
                </div>

                {/* Mobile-friendly judge list */}
                {isMobile ? (
                  <div className="space-y-4">
                    {judges.map((judge, index) => (
                      <div key={index} className={`bg-white border rounded-lg p-4 ${judge.isEmpty ? 'bg-gray-50 border-gray-200' : 'border-gray-300'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-gray-900">Judge {judge.judgeNo}</span>
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                judge.judgeType === 'Senior Judge'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {judge.judgeType}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-900">
                              {judge.name || <span className="text-gray-400 italic">Empty Slot</span>}
                            </p>
                            {judge.username && (
                              <p className="text-sm text-gray-600">Username: {judge.username}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            {judge.name ? (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                Available
                              </span>
                            )}
                            <button
                              onClick={() => handleEditJudge(judge)}
                              className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm min-h-[44px] ${
                                judge.name
                                  ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                  : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                              }`}
                            >
                              <Edit className="h-4 w-4" />
                              <span>{judge.name ? 'Edit' : 'Add Judge'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Desktop table layout
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Judge No
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Judge Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Username
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {judges.map((judge, index) => (
                          <tr key={index} className={judge.isEmpty ? 'bg-gray-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {judge.judgeNo}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${judge.judgeType === 'Senior Judge'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                                }`}>
                                {judge.judgeType}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {judge.name || <span className="text-gray-400 italic">Empty Slot</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {judge.username || <span className="text-gray-400 italic">-</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {judge.name ? (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                  Active
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                  Available
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <button
                                onClick={() => handleEditJudge(judge)}
                                className={`flex items-center space-x-1 ${judge.name
                                  ? 'text-blue-600 hover:text-blue-800'
                                  : 'text-green-600 hover:text-green-800'
                                  }`}
                              >
                                <Edit className="h-4 w-4" />
                                <span>{judge.name ? 'Edit' : 'Add Judge'}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                {!selectedGender || !selectedAgeGroup ? (
                  <>
                    <p className="text-gray-500">Select gender and age group to view judges.</p>
                    <p className="text-gray-400 text-sm mt-2">Judges will be loaded automatically when both filters are selected.</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500">No judges found for this combination.</p>
                    <p className="text-gray-400 text-sm mt-2">
                      No judge panel exists for <strong>{selectedGender.label} - {selectedAgeGroup.label}</strong>. 
                      Switch to "Add Judge" to create a new panel.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Edit Judge Modal - Mobile-optimized */}
        {editingJudge && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="p-6 md:p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900">
                    {editingJudge?.name ? 'Edit Judge' : 'Add Judge'}
                  </h3>
                  <button
                    onClick={handleCancelEdit}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Judge Type:</strong> {editingJudge.judgeType} |{' '}
                      <strong>Gender:</strong> {editingJudge.gender} |{' '}
                      <strong>Age Group:</strong> {editingJudge.ageGroup}
                    </p>
                  </div>

                  <ResponsiveFormField
                    label="Name"
                    required
                  >
                    <ResponsiveInput
                      type="text"
                      value={editFormData.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setEditFormData({
                          ...editFormData,
                          name: newName,
                          // Auto-generate username if it's empty or was auto-generated
                          username: (!editFormData.username || editFormData.username === generateUsername(editFormData.name, editingJudge.judgeType))
                            ? (newName ? generateUsername(newName, editingJudge.judgeType) : '')
                            : editFormData.username
                        });
                      }}
                      placeholder="Enter judge name"
                    />
                  </ResponsiveFormField>

                  <ResponsiveFormField
                    label="Username"
                    required
                  >
                    <div className="flex space-x-2">
                      <ResponsiveInput
                        type="text"
                        value={editFormData.username}
                        onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                        placeholder="Enter username or click Auto"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (editFormData.name.trim()) {
                            const newUsername = generateUsername(editFormData.name, editingJudge.judgeType);
                            setEditFormData({
                              ...editFormData,
                              username: newUsername
                            });
                            toast.success(`Username generated: ${newUsername}`);
                          } else {
                            toast.error('Please enter a name first');
                          }
                        }}
                        className={`px-3 py-3 text-white rounded-md text-sm min-h-[44px] min-w-[60px] ${editFormData.name.trim()
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : 'bg-gray-400 cursor-not-allowed'
                          }`}
                        disabled={!editFormData.name.trim()}
                      >
                        Auto
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Username is required. {editFormData.name ? 'Click "Auto" to generate from name.' : 'Enter a name first, then click "Auto".'}
                    </p>
                  </ResponsiveFormField>

                  <ResponsiveFormField
                    label="Password"
                    required
                  >
                    <div className="flex space-x-2">
                      <ResponsiveInput
                        type="text"
                        value={editFormData.password}
                        onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                        placeholder="Enter new password"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setEditFormData({ ...editFormData, password: generatePassword() })}
                        className="px-3 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm min-h-[44px] min-w-[80px]"
                      >
                        Generate
                      </button>
                    </div>
                  </ResponsiveFormField>

                  <div className="flex flex-col md:flex-row justify-end space-y-3 md:space-y-0 md:space-x-3 pt-4">
                    <ResponsiveButton
                      onClick={handleCancelEdit}
                      variant="secondary"
                      className="order-2 md:order-1"
                    >
                      Cancel
                    </ResponsiveButton>
                    <ResponsiveButton
                      onClick={handleUpdateJudge}
                      variant="primary"
                      className="order-1 md:order-2 flex items-center justify-center space-x-2"
                    >
                      <Save className="h-4 w-4" />
                      <span>{editingJudge?.name ? 'Update Judge' : 'Add Judge'}</span>
                    </ResponsiveButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
};

export default Judges;