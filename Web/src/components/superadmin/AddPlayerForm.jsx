import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UserPlus, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ADMIN_COLORS, FG, alpha } from '../../styles/tokens';
import Dropdown from '@/components/auth/Dropdown';
import { logger } from '@/infrastructure/logger';
import { useAgeGroups } from '../../hooks/useAgeGroups';
import { getCompetitionPlayerFeeRupees } from '@/utils/scoring/competitionFee';
import { offeredApparatus } from '@/utils/scoring/apparatus';
import { DarkBtn } from '@/components/admin/AdminKit';
import { PasswordRequirements, PasswordStrengthIndicator } from '@/components/auth/PasswordStrength';

/** Keep in sync with SuperAdminAddPlayerPayment.jsx */
const SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY = 'mallakhamb_superadmin_player_checkout_v1';

// ─── Dark Input Component ─────────────────────────────────────────────────────
const DarkInput = ({ label, required, error, hint, id, ...props }) => (
  <div>
    {label && (
      <label htmlFor={id} className="block type-tag mb-1.5 text-accent-fg">
        {label}{required && <span className="text-danger-fg"> *</span>}
      </label>
    )}
    <input
      id={id}
      className="w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 min-h-[44px] transition-all duration-200"
      style={{ background: 'rgb(var(--ink) / 0.04)', border: `1px solid ${error ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid}`, padding: '0.625rem 0.875rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${alpha(ADMIN_COLORS.saffron, 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha(ADMIN_COLORS.saffron, 0x12)}`; }}
      onBlur={(e) => { e.target.style.borderColor = error ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
    {hint && <p className="text-xs mt-1 text-fg-muted">{hint}</p>}
  </div>
);

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
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors }, watch, setError, reset } = useForm();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Form state for dropdowns
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedApparatus, setSelectedApparatus] = useState({});
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
    
    // Add age limits to each age group
    const ageGroups = competitionAgeGroups.map(ag => ({ ...ag, ...ageGroupLimits[ag.value] }));
    
    // Filter age groups where the player is eligible
    const eligibleGroups = ageGroups.filter(ag => {
      if (ag.value.startsWith('Under')) {
        return playerAge <= ag.maxAge;
      } else if (ag.value.startsWith('Above')) {
        return true;
      }
      return false;
    });
    
    return eligibleGroups.sort((a, b) => {
      if (a.value.startsWith('Under') && b.value.startsWith('Under')) {
        return a.maxAge - b.maxAge;
      }
      if (a.value.startsWith('Above') && b.value.startsWith('Above')) {
        return a.minAge - b.minAge;
      }
      return a.value.startsWith('Under') ? -1 : 1;
    });
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
      setSelectedApparatus({}); // Reset apparatus when competition changes
      onFetchTeams(selectedCompetition.value)
        .finally(() => setLoadingTeams(false));
    }
  }, [selectedCompetition]); 
  
  // What the selected competition runs for this athlete's gender, per type.
  // Nothing is offered until the gender is known — the superadmin configures
  // Male and Female separately.
  const availableApparatusesByType = React.useMemo(() => {
    if (!selectedCompetition || !selectedGender) return {};
    const doc = competitions.find(c => c._id === selectedCompetition.value);
    if (!doc || !doc.competitionTypes) return {};

    const config = {};
    doc.competitionTypes.forEach(type => {
      const offered = offeredApparatus(doc, type, selectedGender.value);
      if (offered.length > 0) config[type] = offered;
    });
    return config;
  }, [selectedCompetition, selectedGender, competitions]);

  // A gender change can take apparatus off the menu; drop what was ticked.
  useEffect(() => { setSelectedApparatus({}); }, [selectedGender]);
  
  // Toggle apparatus selection for a specific competition type
  const toggleApparatus = (compType, app) => {
    setSelectedApparatus(prev => {
      const typeList = prev[compType] || [];
      const updatedList = typeList.includes(app)
        ? typeList.filter(a => a !== app)
        : [...typeList, app];
      
      return {
        ...prev,
        [compType]: updatedList
      };
    });
  };
  
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
        // For "Under" categories, player must be at or below the max age
        if (selectedAgeGroup.value.startsWith('Under') && playerAge > ageGroup.maxAge) {
          toast.error(`Player is ${playerAge} years old and cannot play in ${selectedAgeGroup.label} (max age: ${ageGroup.maxAge})`);
          return;
        }
        // For "Above" categories, players can always play up (no minimum age restriction for playing up)
        // This allows younger players to compete in higher age categories
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
    
    // Validate apparatus selection
    if (Object.values(selectedApparatus).flat().length === 0) {
      toast.error('Please select at least one apparatus');
      return;
    }
    
    setLoading(true);
    try {
      const selectedCompetitionDoc = competitions.find(c => c._id === selectedCompetition.value);
      const competitionPlayerFee = getCompetitionPlayerFeeRupees(selectedCompetitionDoc);
      if (competitionPlayerFee === null) {
        toast.error('This competition has no valid per-player fee. Edit the competition under Competitions and set the fee.');
        setLoading(false);
        return;
      }

      const playerData = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        dateOfBirth: data.dateOfBirth,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        teamId: selectedTeam.value,
        competitionId: selectedCompetition.value,
        password: data.password,
        apparatus: selectedApparatus,
      };

      const checkoutPayload = {
        playerData,
        teamLabel: selectedTeam.label,
        competitionLabel: selectedCompetition.label,
        competitionPlayerFee,
        competitionApparatusFees: selectedCompetitionDoc.apparatusFees || {},
        // The fee window travels with the checkout so the payment page can quote
        // the same late fee the server will charge. Carried rather than re-fetched
        // because the payment page has no competition list of its own.
        competitionRegistrationOpenDate: selectedCompetitionDoc.registrationOpenDate || null,
        competitionFeeDueDate: selectedCompetitionDoc.feeDueDate || null,
        competitionEndDate: selectedCompetitionDoc.endDate || null,
        competitionLateFee: Number(selectedCompetitionDoc.lateFee) || 0,
      };

      sessionStorage.setItem(SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY, JSON.stringify(checkoutPayload));
      toast.success('Continue to secure payment to complete registration.', { duration: 3500 });
      navigate('/superadmin/add-player-payment');
    } catch (error) {
      logger.error('Error starting player checkout:', error);
      toast.error(error.response?.data?.message || 'Could not start checkout. Please try again.');
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
    setSelectedApparatus([]);
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
              <p className="text-xs mt-1.5 flex items-center gap-1 text-danger-fg">
                <AlertCircle className="w-3 h-3" />
                {errors.firstName.message}
              </p>
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
              <p className="text-xs mt-1.5 flex items-center gap-1 text-danger-fg">
                <AlertCircle className="w-3 h-3" />
                {errors.lastName.message}
              </p>
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
              <p className="text-xs mt-1.5 flex items-center gap-1 text-danger-fg">
                <AlertCircle className="w-3 h-3" />
                {errors.email.message}
              </p>
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
              <p className="text-xs mt-1.5 flex items-center gap-1 text-danger-fg">
                <AlertCircle className="w-3 h-3" />
                {errors.dateOfBirth.message}
              </p>
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
            <p className="text-xs mt-1 text-fg-muted">
              Select gender first
            </p>
          )}
          {selectedGender && !dateOfBirth && (
            <p className="text-xs mt-1 text-fg-muted">
              Enter date of birth first
            </p>
          )}
          {selectedGender && dateOfBirth && playerAge !== null && (
            <p className="text-xs mt-1 text-fg-muted">
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
          {selectedCompetition && (() => {
            const doc = competitions.find((c) => c._id === selectedCompetition.value);
            const fee = getCompetitionPlayerFeeRupees(doc);
            if (fee === null) {
              return (
                <p className="text-xs mt-2 rounded-lg px-3 py-2" style={{ color: FG.danger, background: 'rgba(239,68,68,0.08)', border: `1px solid ${alpha(ADMIN_COLORS.red, 0x40)}` }}>
                  This competition has no valid per-player fee. Open Competitions, edit this competition, and set the fee.
                </p>
              );
            }
            return (
              <p className="text-xs mt-2 rounded-lg px-3 py-2" style={{ color: 'var(--fg-muted)', background: 'rgb(var(--ink) / 0.04)', border: `1px solid ${ADMIN_COLORS.darkBorderSubtle}` }}>
                Fee for this competition: <span className="font-bold text-ink">₹{fee.toLocaleString()}</span> per player (total is players × this amount; no separate base fee).
              </p>
            );
          })()}
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
            <p className="text-xs mt-1 text-fg-muted">
              Select a competition first
            </p>
          )}
          {selectedCompetition && loadingTeams && (
            <p className="text-xs mt-1 text-accent-fg">
              Loading teams for selected competition...
            </p>
          )}
          {selectedCompetition && !loadingTeams && teamOptions.length === 0 && (
            <p className="text-xs mt-1 text-fg-muted">
              No teams found for this competition
            </p>
          )}
        </div>
      </div>
      
      {/* Apparatus */}
      {selectedCompetition && Object.keys(availableApparatusesByType).length > 0 && (
        <div className="pt-2 border-t mt-4 border-line">
          <label className="block type-tag mb-3 text-accent-fg">
            Apparatus Selection <span className="text-danger-fg">*</span>
          </label>
          <div className="space-y-4">
            {Object.entries(availableApparatusesByType).map(([compType, apparatuses]) => {
              const typeLabel = compType === 'competition_1' ? 'Competition I' : compType === 'competition_2' ? 'Competition II' : 'Competition III';
              return (
                <div key={compType} className="p-3 rounded-xl border bg-surface-sunken border-line">
                  <p className="text-xs font-bold text-ink/60 mb-2">{typeLabel}</p>
                  <div className="flex flex-wrap gap-3">
                    {apparatuses.map((app) => {
                      const isSelected = (selectedApparatus[compType] || []).includes(app);
                      return (
                        <label 
                          key={app}
                          onClick={() => toggleApparatus(compType, app)}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-200"
                          style={{
                            background: isSelected ? `${alpha(ADMIN_COLORS.saffron, 0x15)}` : 'rgb(var(--ink) / 0.04)',
                            border: `1px solid ${isSelected ? ADMIN_COLORS.saffron : ADMIN_COLORS.darkBorderMid}`,
                          }}
                        >
                          <div 
                            className="w-4 h-4 rounded-md flex items-center justify-center transition-colors"
                            style={{
                              background: isSelected ? ADMIN_COLORS.saffron : 'transparent',
                              border: `1px solid ${isSelected ? ADMIN_COLORS.saffron : 'rgb(var(--ink) / 0.2)'}`,
                            }}
                          >
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-dark" />}
                          </div>
                          <span className={`text-sm ${isSelected ? 'text-ink font-medium' : 'text-ink/70'}`}>
                            {app}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {Object.values(selectedApparatus).flat().length === 0 && (
            <p className="text-xs mt-2 text-danger-fg">
              At least one apparatus must be selected across all competitions
            </p>
          )}
        </div>
      )}
      
      {/* Password */}
      <div>
        <label htmlFor="password" className="block type-tag mb-1.5 text-accent-fg">
          Password <span className="text-danger-fg">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            className="w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 transition-all duration-200"
            style={{ 
              background: 'rgb(var(--ink) / 0.04)', 
              border: `1px solid ${errors.password ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid}`, 
              padding: '0.625rem 3rem 0.625rem 0.875rem',
              minHeight: '44px',
              height: '44px'
            }}
            onFocus={(e) => { e.target.style.borderColor = `${alpha(ADMIN_COLORS.saffron, 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha(ADMIN_COLORS.saffron, 0x12)}`; }}
            onBlur={(e) => { e.target.style.borderColor = errors.password ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Password must be at least 8 characters' }
            })}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute flex items-center justify-center rounded hover:bg-ink/10 transition-colors"
            style={{
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '32px',
              height: '32px',
              padding: '0'
            }}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4 text-fg-muted" />
            ) : (
              <Eye className="w-4 h-4 text-fg-muted" />
            )}
          </button>
        </div>
        <AnimatePresence>
          {errors.password && (
            <p className="text-xs mt-1.5 flex items-center gap-1 text-danger-fg">
              <AlertCircle className="w-3 h-3" />
              {errors.password.message}
            </p>
          )}
        </AnimatePresence>
        <PasswordStrengthIndicator password={password} />
        <PasswordRequirements password={password} />
      </div>
      
      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className="block type-tag mb-1.5 text-accent-fg">
          Confirm Password <span className="text-danger-fg">*</span>
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            className="w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 transition-all duration-200"
            style={{ 
              background: 'rgb(var(--ink) / 0.04)', 
              border: `1px solid ${errors.confirmPassword ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid}`, 
              padding: '0.625rem 3rem 0.625rem 0.875rem',
              minHeight: '44px',
              height: '44px'
            }}
            onFocus={(e) => { e.target.style.borderColor = `${alpha(ADMIN_COLORS.saffron, 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha(ADMIN_COLORS.saffron, 0x12)}`; }}
            onBlur={(e) => { e.target.style.borderColor = errors.confirmPassword ? alpha(ADMIN_COLORS.red, 0x60) : ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (value) => value === password || 'Passwords do not match'
            })}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute flex items-center justify-center rounded hover:bg-ink/10 transition-colors"
            style={{
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '32px',
              height: '32px',
              padding: '0'
            }}
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? (
              <EyeOff className="w-4 h-4 text-fg-muted" />
            ) : (
              <Eye className="w-4 h-4 text-fg-muted" />
            )}
          </button>
        </div>
        <AnimatePresence>
          {errors.confirmPassword && (
            <p className="text-xs mt-1.5 flex items-center gap-1 text-danger-fg">
              <AlertCircle className="w-3 h-3" />
              {errors.confirmPassword.message}
            </p>
          )}
          {!errors.confirmPassword && confirmPassword && password === confirmPassword && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-700 dark:text-green-500" />
              <p className="text-xs text-green-700 dark:text-green-500">Passwords match</p>
            </div>
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
              <div
                className="animate-spin w-4 h-4 border-2 border-ink/20 border-t-ink rounded-full"
              />
              Opening payment…
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
