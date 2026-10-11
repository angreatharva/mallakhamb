import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '@/services/api';
import { Button, Field, Heading, Input, Panel, Textarea } from '@/components/ui';

const CoachCreateTeam = () => {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm();

  // Check if coach already has a team and should skip this page
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await coachAPI.getStatus();
        
        // Handle nested response structure
        const statusData = response.data?.data || response.data;
        const { hasTeam, step } = statusData;
        
        console.log('[Create Team] Full response:', response.data);
        console.log('[Create Team] Status data:', statusData);
        console.log('[Create Team] Status check:', { hasTeam, step });
        
        // If coach has team, redirect to select competition
        // (Coach can always select a different competition)
        if (hasTeam && step === 'select-competition') {
          console.log('[Create Team] Redirecting to select-level - already has team');
          // Into the level chooser, not straight at the competition list: the
          // competition screen needs a level and bounces back here without one.
          navigate('/coach/select-level', { replace: true });
          return; // Don't set checkingStatus to false, keep showing loading
        }
        
        // Otherwise, coach needs to create a team, show the form
        console.log('[Create Team] Showing create team form');
        setCheckingStatus(false);
      } catch (error) {
        console.error('[Create Team] Failed to check coach status:', error);
        // On error, allow them to stay on this page
        setCheckingStatus(false);
      }
    };
    
    checkStatus();
  }, [navigate]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await coachAPI.createTeam(data);
      toast.success('Team created successfully! Now register it for a competition.');
      // Small delay to ensure the team is available in the backend
      setTimeout(() => {
        navigate('/coach/select-level', { state: { teamCreated: true } });
      }, 500);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create team');
      setLoading(false);
    }
  };

  // Show loading while checking status
  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Checking your status...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg flex items-center justify-center py-12 px-[var(--pad)]">
      <div className="w-full max-w-md grid gap-6 ui-fade-in">
        {/* Step indicator: the current step carries the accent rule. */}
        <ol className="shell-steps shell-steps--3" aria-label="Progress">
          {['Register', 'Create Team', 'Select Competition'].map((step, i) => (
            <li key={step} className="shell-steps__step" data-state={i < 1 ? 'done' : i === 1 ? 'current' : 'todo'}
              aria-current={i === 1 ? 'step' : undefined}>
              <span className="type-num-m" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span className="type-tag hidden sm:inline">{step}</span>
            </li>
          ))}
        </ol>

        <Panel variant="feature" className="grid gap-6">
          <div className="grid gap-2">
            <Heading level={1} step="display-l">Create Your Team</Heading>
            <p className="type-body-s text-fg-muted m-0">Set up your team to start managing players</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
            <Field id="team-name" label="Team Name" required error={errors.name?.message}>
              <Input
                type="text"
                placeholder="Enter team name"
                {...register('name', { required: 'Team name is required' })}
              />
            </Field>

            <Field id="team-desc" label="Team Description (Optional)">
              <Textarea
                rows={3}
                placeholder="Enter team description"
                {...register('description')}
              />
            </Field>

            <Button type="submit" size="lg" block loading={loading} iconRight={loading ? null : ArrowRight}>
              {loading ? 'Creating Team...' : 'Create Team'}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
};

export default CoachCreateTeam;
