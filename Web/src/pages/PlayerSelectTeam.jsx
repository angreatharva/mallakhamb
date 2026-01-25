import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, Trophy, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveForm, ResponsiveFormField, ResponsiveButton } from '../components/responsive/ResponsiveForm';
import { useResponsive } from '../hooks/useResponsive';

const PlayerSelectTeam = () => {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const navigate = useNavigate();
  const { isMobile, isTablet } = useResponsive();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm();

  const selectedTeam = watch('team');

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const response = await playerAPI.getTeams();
      const teamOptions = response.data.teams.map(team => ({
        value: team._id,
        label: team.name
      }));
      setTeams(teamOptions);
    } catch (error) {
      toast.error('Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await playerAPI.updateTeam({ teamId: data.team.value });
      toast.success('Team selected successfully!');
      navigate('/player/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to select team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <ResponsiveContainer 
        maxWidth="tablet" 
        className="flex items-center justify-center py-8 md:py-12"
      >
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            {/* Header Section */}
            <div className="text-center mb-6 md:mb-8">
              <div className="flex justify-center mb-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Trophy className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Select Your Team</h2>
              <p className="text-gray-600 mt-2 text-sm md:text-base">Choose the team you want to join</p>
            </div>

            {/* Form Section */}
            <ResponsiveForm onSubmit={handleSubmit(onSubmit)}>
              <ResponsiveFormField
                label={
                  <span className="flex items-center">
                    <Users className="inline h-4 w-4 mr-1" />
                    Team
                  </span>
                }
                error={errors.team && "Please select a team"}
                required
              >
                <div className="relative">
                  <Dropdown
                    options={teams}
                    value={selectedTeam}
                    onChange={(option) => setValue('team', option)}
                    placeholder="Select a team"
                    loading={teamsLoading}
                    className="w-full"
                  />
                </div>
              </ResponsiveFormField>

              <ResponsiveButton
                type="submit"
                disabled={loading || !selectedTeam}
                loading={loading}
                variant="primary"
                className="w-full"
              >
                {loading ? 'Joining Team...' : 'Join Team'}
              </ResponsiveButton>
            </ResponsiveForm>

            {/* Skip Option */}
            <div className="mt-6 text-center">
              <button
                onClick={() => navigate('/player/dashboard')}
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors min-h-[44px] px-2"
              >
                Skip for now
                <ArrowRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </ResponsiveContainer>
    </div>
  );
};

export default PlayerSelectTeam;
