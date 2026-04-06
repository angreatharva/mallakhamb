import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, Trophy, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '../../services/api';
import { COLORS, GradientText, useReducedMotion } from '../public/Home';

const CoachCreateTeam = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { register, handleSubmit, formState: { errors } } = useForm();

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
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative overflow-hidden"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {!reduced && (
        <>
          <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: `${COLORS.saffron}08`, filter: 'blur(100px)', transform: 'translate(-50%,-50%)' }} />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: `#22C55E08`, filter: 'blur(80px)', transform: 'translate(50%,50%)' }} />
        </>
      )}

      <motion.div className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {['Register', 'Create Team', 'Select Competition'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: i === 1 ? '#22C55E' : i < 1 ? `${COLORS.saffron}30` : 'rgba(255,255,255,0.08)',
                    color: i === 1 ? '#fff' : i < 1 ? COLORS.saffron : 'rgba(255,255,255,0.3)',
                  }}>
                  {i + 1}
                </div>
                <span className="text-xs hidden sm:block"
                  style={{ color: i === 1 ? '#22C55E' : 'rgba(255,255,255,0.3)' }}>
                  {step}
                </span>
              </div>
              {i < 2 && <div className="w-6 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />}
            </div>
          ))}
        </div>

        <div className="rounded-3xl border p-8"
          style={{
            background: COLORS.darkCard,
            borderColor: COLORS.darkBorderSubtle,
            boxShadow: `0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px ${COLORS.darkBorderSubtle}`,
          }}>

          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.saffron}28` }}>
              <Trophy className="w-8 h-8" style={{ color: COLORS.saffron }} aria-hidden="true" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white mb-2">Create Your Team</h1>
            <p className="text-white/45 text-sm">Set up your team to start managing players</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <label htmlFor="team-name" className="block text-xs font-semibold tracking-wide uppercase mb-2"
                style={{ color: COLORS.saffronLight }}>
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="w-3 h-3" aria-hidden="true" />
                  Team Name
                </span>
                <span aria-hidden="true" style={{ color: COLORS.saffron }}> *</span>
              </label>
              <input
                id="team-name"
                type="text"
                placeholder="Enter team name"
                className="w-full px-4 py-3 rounded-xl text-white placeholder-white/25 outline-none transition-all duration-200 min-h-[44px]"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${errors.name ? '#EF4444' : COLORS.darkBorderSubtle}`,
                }}
                onFocus={e => e.target.style.borderColor = COLORS.saffron}
                onBlur={e => e.target.style.borderColor = errors.name ? '#EF4444' : COLORS.darkBorderSubtle}
                {...register('name', { required: 'Team name is required' })}
              />
              {errors.name && <p className="mt-1.5 text-xs text-red-400" role="alert">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="team-desc" className="block text-xs font-semibold tracking-wide uppercase mb-2"
                style={{ color: COLORS.saffronLight }}>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3 h-3" aria-hidden="true" />
                  Team Description
                </span>
                <span className="ml-1 text-white/25 normal-case font-normal">(Optional)</span>
              </label>
              <textarea
                id="team-desc"
                rows={3}
                placeholder="Enter team description"
                className="w-full px-4 py-3 rounded-xl text-white placeholder-white/25 outline-none transition-all duration-200 resize-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${COLORS.darkBorderSubtle}`,
                }}
                onFocus={e => e.target.style.borderColor = COLORS.saffron}
                onBlur={e => e.target.style.borderColor = COLORS.darkBorderSubtle}
                {...register('description')}
              />
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-white min-h-[44px] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
              whileHover={loading ? {} : { scale: 1.01 }}
              whileTap={loading ? {} : { scale: 0.98 }}>
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating Team...
                </>
              ) : (
                <>
                  Create Team
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default CoachCreateTeam;
