import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, Trophy, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '../services/api';
import { ResponsiveContainer, ResponsiveFormContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveForm, ResponsiveFormField, ResponsiveInput, ResponsiveButton } from '../components/responsive/ResponsiveForm';
import { useResponsive } from '../hooks/useResponsive';

const CoachCreateTeam = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isMobile, isTablet } = useResponsive();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await coachAPI.createTeam(data);
      toast.success('Team created successfully! Now register it for a competition.');
      navigate('/coach/select-competition');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <ResponsiveContainer 
        maxWidth="tablet" 
        className="flex items-center justify-center py-8 md:py-12"
      >
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            {/* Header Section */}
            <div className="text-center mb-6 md:mb-8">
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <Trophy className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Create Your Team</h2>
              <p className="text-gray-600 mt-2 text-sm md:text-base">Set up your team to start managing players</p>
            </div>

            {/* Form Section */}
            <ResponsiveForm onSubmit={handleSubmit(onSubmit)}>
              <ResponsiveFormField
                label={
                  <span className="flex items-center">
                    <Trophy className="inline h-4 w-4 mr-1" />
                    Team Name
                  </span>
                }
                error={errors.name?.message}
                required
              >
                <ResponsiveInput
                  {...register('name', {
                    required: 'Team name is required'
                  })}
                  type="text"
                  placeholder="Enter team name"
                  error={!!errors.name}
                />
              </ResponsiveFormField>

              <ResponsiveFormField
                label={
                  <span className="flex items-center">
                    <Users className="inline h-4 w-4 mr-1" />
                    Team Description (Optional)
                  </span>
                }
              >
                <textarea
                  {...register('description')}
                  rows={isMobile ? 3 : 4}
                  className="block w-full border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-green-500 px-3 py-3 md:py-2 text-base md:text-sm resize-none"
                  placeholder="Enter team description"
                />
              </ResponsiveFormField>

              <ResponsiveButton
                type="submit"
                disabled={loading}
                loading={loading}
                variant="success"
                className="w-full"
              >
                {loading ? 'Creating Team...' : 'Create Team'}
              </ResponsiveButton>
            </ResponsiveForm>
          </div>
        </div>
      </ResponsiveContainer>
    </div>
  );
};

export default CoachCreateTeam;
