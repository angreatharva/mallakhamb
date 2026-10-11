/**
 * Password strength meter and requirement checklist (plan Phase 8).
 *
 * AdminRegister and AddPlayerForm each carried a copy, identical except for the
 * length policy — admin accounts need 12 characters and score length at 12/16,
 * player accounts 8 and 8/12. That policy is now the explicit `minLength` /
 * `strongLength` props, so each form keeps exactly its own rule. The meter's
 * fills keep their hex (they are colour bars, not text); the label takes a
 * status token.
 */
import PropTypes from 'prop-types';
import { CheckCircle2 } from 'lucide-react';
import { FG } from '@/styles/tokens';

const LEVELS = [
  { level: 0, label: '', color: '' },
  { level: 1, label: 'Weak', color: 'rgb(var(--danger-fg))', fg: FG.danger },
  { level: 2, label: 'Fair', color: 'rgb(var(--warning-fg))', fg: FG.warning },
  { level: 3, label: 'Good', color: 'rgb(var(--success-fg))', fg: FG.success },
  { level: 4, label: 'Strong', color: 'rgb(var(--success-fg))', fg: FG.success },
  { level: 5, label: 'Very Strong', color: 'rgb(var(--success-fg))', fg: FG.success },
];

export const PasswordStrengthIndicator = ({ password, minLength = 8, strongLength = 12 }) => {
  if (!password) return null;

  let score = 0;
  if (password.length >= minLength) score++;
  if (password.length >= strongLength) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const strength = LEVELS[score];

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background: level <= strength.level ? strength.color : 'rgb(var(--ink) / 0.1)',
            }}
          />
        ))}
      </div>
      {strength.label && (
        <p className="text-xs mt-1" style={{ color: strength.fg }}>
          Password strength: {strength.label}
        </p>
      )}
    </div>
  );
};

export const PasswordRequirements = ({ password, minLength = 8 }) => {
  const requirements = [
    { label: `At least ${minLength} characters`, test: (pwd) => pwd.length >= minLength },
    { label: 'Contains uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
    { label: 'Contains lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
    { label: 'Contains number', test: (pwd) => /\d/.test(pwd) },
  ];

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-fg-muted mb-2">Password requirements:</p>
      {requirements.map((req, index) => {
        const met = password && req.test(password);
        return (
          <div key={index} className="flex items-center gap-2">
            {met ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-700 dark:text-green-500" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-ink/20" />
            )}
            <span className={`text-xs ${met ? 'text-ink/60' : 'text-fg-muted'}`}>
              {req.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

PasswordStrengthIndicator.propTypes = { password: PropTypes.string, minLength: PropTypes.number, strongLength: PropTypes.number };
PasswordRequirements.propTypes = { password: PropTypes.string, minLength: PropTypes.number };
