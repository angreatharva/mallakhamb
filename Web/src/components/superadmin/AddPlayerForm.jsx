import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { UserPlus, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../../services/api';
import { ADMIN_COLORS, ADMIN_EASE_OUT } from '../../styles/tokens';
import Dropdown from '../Dropdown';
import { logger } from '../../utils/logger';
import { useAgeGroups } from '../../hooks/useAgeGroups';

// ─── Dark Input Component ─────────────────────────────────────────────────────
const DarkInput = ({ label, required, error, hint, id, ...props }) => (
  <div>
    {label && (
      <label htmlFor={id} className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: ADMIN_COLORS.saffronLight }}>
        {label}{required && <span style={{ color: ADMIN_COLORS.red }}> *</span>}
      </label>
    )}
    <input
      id={id}
      className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${error ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid}`, padding: '0.625rem 0.875rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; }}
      onBlur={(e) => { e.target.style.borderColor = error ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
    {hint && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{hint}</p>}
  </div>
);

// ─── Dark Button Component ────────────────────────────────────────────────────
const DarkBtn = ({ children, onClick, disabled, variant = 'primary', size = 'md', type = 'button', className = '' }) => {
  const bg = {
    primary: `linear-gradient(135deg, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.saffronDark})`,
    ghost: 'transparent',
  }[variant];
  const h = size === 'sm' ? '32px' : '44px';
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-xl font-bold text-sm text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{ background: bg, border: variant === 'ghost' ? `1px solid ${ADMIN_COLORS.darkBorderSubtle}` : 'none', minHeight: h, padding: size === 'sm' ? '0 0.75rem' : '0 1.25rem' }}
      whileHover={!disabled ? { scale: 1.02, filter: 'brightness(1.1)' } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}>
      {children}
    </motion.button>
  );
};

// ─── Password Strength Indicator ──────────────────────────────────────────────
const PasswordStrengthIndicator = ({ password }) => {
  const getStrength = (pwd) => {
    if (!pwd) return { level: 0, label: '', color: '' };
    
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (pwd.length >= 12) strength++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^a-zA-Z0-9]/.test(pwd)) strength++;
    
    const levels = [
      { level: 0, label: '', color: '' },
      { level: 1, label: 'Weak', color: '#EF4444' },
      { level: 2, label: 'Fair', color: '#F59E0B' },
      { level: 3, label: 'Good', color: '#10B981' },
      { level: 4, label: 'Strong', color: '#10B981' },
      { level: 5, label: 'Very Strong', color: '#059669' },
    ];
    
    return levels[strength];
  };
  
  const strength = getStrength(password);
  
  if (!password) return null;
  
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background: level <= strength.level ? strength.color : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
      {strength.label && (
        <p className="text-xs mt-1" style={{ color: strength.color }}>
          Password strength: {strength.label}
        </p>
      )}
    </div>
  );
};

// ─── Password Requirements Checklist ──────────────────────────────────────────
const PasswordRequirements = ({ password }) => {
  const requirements = [
    { label: 'At least 8 characters', test: (pwd) => pwd.length >= 8 },
    { label: 'Contains uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
    { label: 'Contains lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
    { label: 'Contains number', test: (pwd) => /\d/.test(pwd) },
  ];
  
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-white/40 mb-2">Password requirements:</p>
      {requirements.map((req, index) => {
        const met = password && req.test(password);
        return (
          <div key={index} className="flex items-center gap-2">
            {met ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-white/20" />
            )}
            <span className={`text-xs ${met ? 'text-white/60' : 'text-white/30'}`}>
              {req.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * AddPlayerForm Component
 * 
 * Form component for super admins to add players directly to teams.
 * Includes validation for all required fields, password strength checking,
 * and error handling for common scenarios.
 * 
 * @param {Object} props
 * @param {Array} props.teams - List of available teams (will be populated after competition selection)
 * @param {Array} props.competitions - List of available competitions
 * @param {Function} props.onSuccess - Callback function called after successful player addition
 * @param {Function} props.onFetchTeams - Callback function to fetch teams based on competition selection
 */
const AddPlayerForm = ({ teams, competitions, onSuccess, onFetchTeams }) => {
  const { register, handleSubmit, formState: { errors }, watch, setError, reset } = useForm();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Form state for dropdowns
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  
  // Age group limits for validation
  const ageGroupLimits = {
    'Under10': { minAge: 0, maxAge: 9 }, 'Under12': { minAge: 0, maxAge: 11 },
    'Under14': { minAge: 0, maxAge: 13 }, 'Under16': { minAge: 0, maxAge: 15 },
    'Under18': { minAge: 0, maxAge: 17 }, 'Above16': { minAge: 16, maxAge: 100 },
    'Above18': { minAge: 18, maxAge: 100 },
  };
  
  // Get age groups based on selected gender
  const competitionAgeGroups = useAgeGroups(selectedGender?.value || 'Male');
  
  // Calculate age from date of birth
  const calculateAge = (dob) => {
    if (!dob) return null;
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  
  // Get available age groups based on player's age
  const getAvailableAgeGroups = (gender, playerAge) => {
    if (!playerAge || !competitionAgeGroups.length) return [];
    
    const ageGroups = competitionAgeGroups.map(ag => ({ ...ag, ...ageGroupLimits[ag.value] }));
    const sorted = [...ageGroups].sort((a, b) => {
      if (a.value.startsWith('Under') && b.value.startsWith('Under')) return a.maxAge - b.maxAge;
      if (a.value.startsWith('Above') && b.value.startsWith('Above')) return a.minAge - b.minAge;
      return a.value.startsWith('Under') ? -1 : 1;
    });
    
    let idx = -1;
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      if (g.value.startsWith('Under') && playerAge <= g.maxAge) { idx = i; break; }
      if (g.value.startsWith('Above') && playerAge >= g.minAge) { idx = i; break; }
    }
    return idx >= 0 ? sorted.slice(idx) : sorted;
  };
  
  // Watch date of birth to calculate age and reset age group
  const dateOfBirth = watch('dateOfBirth', '');
  const playerAge = calculateAge(dateOfBirth);
  
  // Reset age group when gender or date of birth changes
  useEffect(() => {
    setSelectedAgeGroup(null);
  }, [selectedGender, dateOfBirth]);
  
  // Fetch teams when competition is selected
  useEffect(() => {
    if (selectedCompetition && onFetchTeams) {
      setLoadingTeams(true);
      setSelectedTeam(null); // Reset team selection when competition changes
      onFetchTeams(selectedCompetition.value)
        .finally(() => setLoadingTeams(false));
    }
  }, [selectedCompetition]); // Removed onFetchTeams from dependencies to prevent infinite calls
  
  // Watch password fields for validation
  const password = watch('password', '');
  const confirmPassword = watch('confirmPassword', '');
  
  // Gender options
  const genderOptions = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];
  
  // Competition options
  const competitionOptions = competitions.map(c => ({
    value: c._id,
    label: `${c.name}${c.year ? ` (${c.year})` : ''}${c.place ? ` — ${c.place}` : ''}`
  }));
  
  // Team options (teams are now pre-filtered by competition on the backend)
  const teamOptions = teams.map(t => ({ 
    value: t._id, 
    label: t.team?.name || t.name || 'Unnamed Team' 
  }));
  
  /**
   * Handle form submission
   */
  const onSubmit = async (data) => {
    // Validate password length
    if (data.password.length < 8) {
      setError('password', { message: 'Password must be at least 8 characters long' });
      return;
    }
    
    // Validate password match
    if (data.password !== data.confirmPassword) {
      setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    
    // Validate gender selection
    if (!selectedGender) {
      toast.error('Please select a gender');
      return;
    }
    
    // Validate age group selection
    if (!selectedAgeGroup) {
      toast.error('Please select an age group');
      return;
    }
    
    // Validate age group eligibility
    if (playerAge !== null && selectedAgeGroup) {
      const ageGroup = ageGroupLimits[selectedAgeGroup.value];
      if (ageGroup) {
        if (selectedAgeGroup.value.startsWith('Under') && playerAge > ageGroup.maxAge) {
          toast.error(`Player is ${playerAge} years old and cannot play in ${selectedAgeGroup.label} (max: ${ageGroup.maxAge})`);
          return;
        }
        if (selectedAgeGroup.value.startsWith('Above') && playerAge < ageGroup.minAge) {
          toast.error(`Player is ${playerAge} years old and cannot play in ${selectedAgeGroup.label} (min: ${ageGroup.minAge})`);
          return;
        }
      }
    }
    
    // Validate team selection
    if (!selectedTeam) {
      toast.error('Please select a team');
      return;
    }
    
    // Validate competition selection
    if (!selectedCompetition) {
      toast.error('Please select a competition');
      return;
    }
    
    setLoading(true);
    try {
      const response = await superAdminAPI.addPlayerToTeam({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        dateOfBirth: data.dateOfBirth,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        teamId: selectedTeam.value,
        competitionId: selectedCompetition.value,
        password: data.password
      });
      
      // Show success message with player details
      const playerData = response.data?.data || response.data;
      toast.success(`Player ${data.firstName} ${data.lastName} added successfully to ${selectedTeam.label}!`, {
        duration: 4000,
        icon: '✅'
      });
      
      // Reset form
      reset();
      setSelectedGender(null);
      setSelectedTeam(null);
      setSelectedCompetition(null);
      setSelectedAgeGroup(null);
      
      // Call success callback with competition info
      if (onSuccess) {
        onSuccess({
          ...playerData,
          competitionId: selectedCompetition.value
        });
      }
    } catch (error) {
      logger.error('Error adding player:', error);
      
      // Handle specific error cases
      if (error.response?.data?.message?.includes('email already exists') || 
          error.response?.data?.message?.includes('Email already registered')) {
        toast.error('Player email already exists. Please use a different email.');
      } else if (error.response?.data?.message?.includes('Team not found')) {
        toast.error('Team not found in the specified competition. Please select a valid team.');
      } else if (error.response?.status === 429) {
        toast.error('Too many requests. Please wait a moment and try again.');
      } else {
        toast.error(error.response?.data?.message || 'Failed to add player. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Handle form reset
   */
  const handleReset = () => {
    reset();
    setSelectedGender(null);
    setSelectedTeam(null);
    setSelectedCompetition(null);
    setSelectedAgeGroup(null);
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-2xl space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* First Name */}
        <div>
          <DarkInput
            id="firstName"
            label="First Name"
            required
            placeholder="Enter first name"
            error={errors.firstName?.message}
            {...register('firstName', {
              required: 'First name is required',
              minLength: { value: 2, message: 'First name must be at least 2 characters' }
            })}
          />
          <AnimatePresence>
            {errors.firstName && (
              <motion.p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: ADMIN_COLORS.red }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertCircle className="w-3 h-3" />
                {errors.firstName.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        
        {/* Last Name */}
        <div>
          <DarkInput
            id="lastName"
            label="Last Name"
            required
            placeholder="Enter last name"
            error={errors.lastName?.message}
            {...register('lastName', {
              required: 'Last name is required',
              minLength: { value: 2, message: 'Last name must be at least 2 characters' }
            })}
          />
          <AnimatePresence>
            {errors.lastName && (
              <motion.p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: ADMIN_COLORS.red }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertCircle className="w-3 h-3" />
                {errors.lastName.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        
        {/* Email */}
        <div>
          <DarkInput
            id="email"
            label="Email"
            required
            type="email"
            placeholder="player@example.com"
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^\S+@\S+$/i,
                message: 'Invalid email format'
              }
            })}
          />
          <AnimatePresence>
            {errors.email && (
              <motion.p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: ADMIN_COLORS.red }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertCircle className="w-3 h-3" />
                {errors.email.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        
        {/* Date of Birth */}
        <div>
          <DarkInput
            id="dateOfBirth"
            label="Date of Birth"
            required
            type="date"
            error={errors.dateOfBirth?.message}
            {...register('dateOfBirth', {
              required: 'Date of birth is required',
              validate: (value) => {
                const date = new Date(value);
                const today = new Date();
                if (date > today) return 'Date of birth cannot be in the future';
                return true;
              }
            })}
          />
          <AnimatePresence>
            {errors.dateOfBirth && (
              <motion.p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: ADMIN_COLORS.red }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertCircle className="w-3 h-3" />
                {errors.dateOfBirth.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        
        {/* Gender */}
        <div>
          <Dropdown
            label="Gender"
            options={genderOptions}
            value={selectedGender}
            onChange={setSelectedGender}
            placeholder="Select gender"
            error={!selectedGender && errors.gender}
          />
        </div>
        
        {/* Age Group */}
        <div>
          <Dropdown
            label="Age Group"
            options={selectedGender && playerAge !== null ? getAvailableAgeGroups(selectedGender.value, playerAge) : []}
            value={selectedAgeGroup}
            onChange={setSelectedAgeGroup}
            placeholder="Select age group"
            disabled={!selectedGender || !dateOfBirth}
            error={!selectedAgeGroup && errors.ageGroup}
          />
          {!selectedGender && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Select gender first
            </p>
          )}
          {selectedGender && !dateOfBirth && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Enter date of birth first
            </p>
          )}
          {selectedGender && dateOfBirth && playerAge !== null && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Player age: {playerAge} years. Showing eligible categories.
            </p>
          )}
        </div>
        
        {/* Competition */}
        <div>
          <Dropdown
            label="Competition"
            options={competitionOptions}
            value={selectedCompetition}
            onChange={(option) => {
              setSelectedCompetition(option);
              setSelectedTeam(null); // Reset team when competition changes
            }}
            placeholder="Select competition"
            error={!selectedCompetition && errors.competition}
          />
        </div>
        
        {/* Team */}
        <div>
          <Dropdown
            label="Team"
            options={teamOptions}
            value={selectedTeam}
            onChange={setSelectedTeam}
            placeholder={loadingTeams ? "Loading teams..." : "Select team"}
            disabled={!selectedCompetition || loadingTeams}
            error={!selectedTeam && errors.team}
          />
          {!selectedCompetition && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Select a competition first
            </p>
          )}
          {selectedCompetition && loadingTeams && (
            <p className="text-xs mt-1" style={{ color: ADMIN_COLORS.saffron }}>
              Loading teams for selected competition...
            </p>
          )}
          {selectedCompetition && !loadingTeams && teamOptions.length === 0 && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              No teams found for this competition
            </p>
          )}
        </div>
      </div>
      
      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: ADMIN_COLORS.saffronLight }}>
          Password <span style={{ color: ADMIN_COLORS.red }}>*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all duration-200 pr-12"
            style={{ 
              background: 'rgba(255,255,255,0.04)', 
              border: `1px solid ${errors.password ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid}`, 
              padding: '0.625rem 0.875rem' 
            }}
            onFocus={(e) => { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; }}
            onBlur={(e) => { e.target.style.borderColor = errors.password ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Password must be at least 8 characters' }
            })}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4 text-white/25" />
            ) : (
              <Eye className="w-4 h-4 text-white/25" />
            )}
          </button>
        </div>
        <AnimatePresence>
          {errors.password && (
            <motion.p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: ADMIN_COLORS.red }}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <AlertCircle className="w-3 h-3" />
              {errors.password.message}
            </motion.p>
          )}
        </AnimatePresence>
        <PasswordStrengthIndicator password={password} />
        <PasswordRequirements password={password} />
      </div>
      
      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-bold tracking-wide uppercase mb-1.5" style={{ color: ADMIN_COLORS.saffronLight }}>
          Confirm Password <span style={{ color: ADMIN_COLORS.red }}>*</span>
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            className="w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] transition-all duration-200 pr-12"
            style={{ 
              background: 'rgba(255,255,255,0.04)', 
              border: `1px solid ${errors.confirmPassword ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid}`, 
              padding: '0.625rem 0.875rem' 
            }}
            onFocus={(e) => { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; }}
            onBlur={(e) => { e.target.style.borderColor = errors.confirmPassword ? ADMIN_COLORS.red + '60' : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (value) => value === password || 'Passwords do not match'
            })}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? (
              <EyeOff className="w-4 h-4 text-white/25" />
            ) : (
              <Eye className="w-4 h-4 text-white/25" />
            )}
          </button>
        </div>
        <AnimatePresence>
          {errors.confirmPassword && (
            <motion.p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: ADMIN_COLORS.red }}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <AlertCircle className="w-3 h-3" />
              {errors.confirmPassword.message}
            </motion.p>
          )}
          {!errors.confirmPassword && confirmPassword && password === confirmPassword && (
            <motion.div className="flex items-center gap-1.5 mt-1.5"
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <p className="text-xs text-green-500">Passwords match</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Form Actions */}
      <div className="flex gap-3 pt-2">
        <DarkBtn type="button" variant="ghost" onClick={handleReset} disabled={loading}>
          Reset
        </DarkBtn>
        <DarkBtn type="submit" variant="primary" disabled={loading}>
          {loading ? (
            <>
              <motion.div
                className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
              Adding Player...
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Add Player
            </>
          )}
        </DarkBtn>
      </div>
    </form>
  );
};

export default AddPlayerForm;
