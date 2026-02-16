import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, Trophy, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '../services/api';
import Dropdown from '../components/Dropdown';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveForm, ResponsiveFormField, ResponsiveButton } from '../components/responsive/ResponsiveForm';
import { useAuth } from '../App';

const PlayerSelectTeamContent = () => {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const navigate = useNavigate();
  const { login } = useAuth();

  const {
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
      setTeamsLoading(true);
      const response = await playerAPI.getTeams();
      const teamOptions = (response.data.teams || []).map((team) => ({
        value: team._id,
        competitionId: team.competitionId,
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
    const option = data.team && typeof data.team === 'object' ? data.team : teams.find((t) => t.value === data.team);
    const teamId = option?.value ?? data.team;
    const competitionId = option?.competitionId;
    if (!teamId || !competitionId) {
      toast.error('Please select a team');
      return;
    }
    setLoading(true);
    try {
      const response = await playerAPI.updateTeam({ teamId, competitionId });
      const { token } = response.data;
      if (token) {
        localStorage.setItem('player_token', token);
        const userData = localStorage.getItem('player_user');
        if (userData) {
          login(JSON.parse(userData), token, 'player');
        }
      }
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
            <div className="text-center mb-6 md:mb-8">
              <div className="flex justify-center mb-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Trophy className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Select Your Team</h2>
              <p className="text-gray-600 mt-2 text-sm md:text-base">
                Choose the team you want to join.
              </p>
            </div>

            {teams.length === 0 && !teamsLoading && (
              <div className="text-center py-6 text-gray-600">
                No teams available to join right now. Competitions may not have opened registration yet.
              </div>
            )}

            <ResponsiveForm onSubmit={handleSubmit(onSubmit)}>
              <ResponsiveFormField
                label={
                  <span className="flex items-center">
                    <Users className="inline h-4 w-4 mr-1" />
                    Team
                  </span>
                }
                error={errors.team && 'Please select a team'}
                required
              >
                <div className="relative">
                  <Dropdown
                    options={teams}
                    value={selectedTeam}
                    onChange={(option) => setValue('team', option)}
                    placeholder={teamsLoading ? 'Loading teams...' : 'Select a team'}
                    loading={teamsLoading}
                    className="w-full"
                  />
                </div>
              </ResponsiveFormField>

              <ResponsiveButton
                type="submit"
                disabled={loading || !selectedTeam || teams.length === 0}
                loading={loading}
                variant="primary"
                className="w-full"
              >
                {loading ? 'Joining Team...' : 'Join Team'}
              </ResponsiveButton>
            </ResponsiveForm>

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

const PlayerSelectTeam = () => <PlayerSelectTeamContent />;

export default PlayerSelectTeam;
