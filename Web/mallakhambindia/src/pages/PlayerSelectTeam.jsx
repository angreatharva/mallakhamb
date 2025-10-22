import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Trophy, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '../services/api';
import Dropdown from '../components/Dropdown';

const PlayerSelectTeam = () => {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <Trophy className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Select Your Team</h2>
            <p className="text-gray-600 mt-2">Choose the team you want to join</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline h-4 w-4 mr-1" />
                Team
              </label>
              <Dropdown
                options={teams}
                value={selectedTeam}
                onChange={(option) => setValue('team', option)}
                placeholder="Select a team"
                loading={teamsLoading}
              />
              {errors.team && (
                <p className="mt-1 text-sm text-red-600">Please select a team</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !selectedTeam}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining Team...' : 'Join Team'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/player/dashboard')}
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerSelectTeam;
