import PropTypes from 'prop-types';
import { Trash2 } from 'lucide-react';
import { Field, IconButton, Input, Select, StatusTag } from '@/components/ui';
import {
  ageCutoffYear, ageOnCutoff, eligibleAgeGroups, lowestAgeGroup,
} from '@/utils/competition/ageEligibility';
import { APPARATUS_LABEL, CheckBox, ageLabel, genderWord } from './deskShared';

/** Below this the reader was unsure: the box is flagged for a second look. */
const LOW_CONFIDENCE = 0.8;

/** Names on the form are English capitals; anything else is shown as typed and flagged. */
const toCapitals = (value) => value.toUpperCase();

/**
 * One player on the review screen: the photo of what the coach wrote, the
 * fields the reader made of it, and what the rules say.
 *
 * Age and the allowed groups are worked out HERE as the admin types (the Web
 * mirror of the COP rule), so the dropdown is right before saving; the server
 * repeats every check on save and on submit, and its `issues` are what blocks.
 * Nothing is moved for the admin: a child written in a group too young for
 * them stays there, in red, until the admin picks one.
 */
const DeskReviewRow = ({ index, row, crop = null, competition, onChange, onRemove, locked = false }) => {
  const sections = competition.sections || [];
  const forGender = sections.find((s) => s.gender === row.gender) || { ageGroups: [], apparatus: [] };
  const cutoff = ageCutoffYear(competition);
  const age = row.dateOfBirth ? ageOnCutoff(row.dateOfBirth, cutoff) : null;
  const lowest = row.gender && age !== null ? lowestAgeGroup(age, row.gender) : null;
  const eligible = row.gender && age !== null ? eligibleAgeGroups(age, row.gender, forGender.ageGroups) : [];
  // The chosen group stays listed even when it is not allowed, so the select
  // shows what the coach wrote instead of silently showing another value.
  const groupOptions = [...new Set([...(row.ageGroup && !eligible.includes(row.ageGroup) ? [row.ageGroup] : []), ...eligible])];

  const issues = row.issues || [];
  const errorFor = (field) => issues.filter((i) => i.field === field && i.level === 'error').map((i) => i.message).join(' ') || null;
  const notes = issues.filter((i) => i.level !== 'error');
  const hasError = issues.some((i) => i.level === 'error');
  const unsure = (field) => typeof row.confidence?.[field] === 'number' && row.confidence[field] < LOW_CONFIDENCE;
  const help = (field) => (unsure(field) ? 'Unclear on the paper — check against the photo' : null);
  const id = (field) => `desk-row-${row._id || index}-${field}`;
  const set = (patch) => onChange({ ...row, ...patch });
  const needsDuplicateConfirm = issues.some((i) => /exists \(/.test(i.message)) || row.confirmDuplicate;

  return (
    <li className={`grid gap-3 p-4 border rounded-lg ${hasError ? 'border-line-strong bg-danger-tint' : 'border-line'}`} data-state={hasError ? 'error' : 'ok'} data-testid="desk-review-row">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="type-body-s font-bold m-0">
          {index + 1}. {genderWord(row.gender)}
          {row.writtenAgeGroup ? ` · written under ${ageLabel(row.writtenAgeGroup)}` : ''}
          {row.page ? ` · page ${row.page}, row ${row.rowNo}` : ' · typed in'}
        </p>
        <div className="flex items-center gap-2">
          {locked
            ? <StatusTag status="success">{row.entered ? `Entered · ${row.loginId}` : `Registered · ${row.loginId}`}</StatusTag>
            : hasError ? <StatusTag status="danger">Fix before submitting</StatusTag> : <StatusTag status="success">Ready</StatusTag>}
          {!locked && <IconButton label={`Remove row ${index + 1}`} icon={Trash2} variant="ghost" onClick={onRemove} />}
        </div>
      </div>

      {crop && (
        <img src={crop} alt={`What was written in row ${row.rowNo} on page ${row.page}`}
          className="w-full h-auto rounded-md border border-line bg-surface" />
      )}

      <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 m-0 p-0 border-0 min-w-0">
        <Field id={id('first')} label="First name" error={errorFor('firstName')} help={help('firstName')}>
          <Input autoComplete="off" autoCapitalize="characters" value={row.firstName}
            onChange={(e) => set({ firstName: toCapitals(e.target.value) })} />
        </Field>
        <Field id={id('last')} label="Last name" error={errorFor('lastName')} help={help('lastName')}>
          <Input autoComplete="off" autoCapitalize="characters" value={row.lastName}
            onChange={(e) => set({ lastName: toCapitals(e.target.value) })} />
        </Field>
        <Field id={id('dob')} label="Date of birth" error={errorFor('dateOfBirth')}
          help={help('dateOfBirth') || (row.dobRaw && !row.dateOfBirth ? `Paper says “${row.dobRaw}”` : null)}>
          <Input type="date" value={row.dateOfBirth || ''} onChange={(e) => set({ dateOfBirth: e.target.value })} />
        </Field>
        <Field id={id('gender')} label="Gender" error={errorFor('gender')}>
          <Select value={row.gender || ''} onChange={(e) => set({ gender: e.target.value || null, apparatus: [] })}>
            <option value="" disabled>Select</option>
            <option value="Male">Boy</option>
            <option value="Female">Girl</option>
          </Select>
        </Field>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <p className="ui-field__label type-tag m-0">Player age</p>
          <p className="type-body-s m-0" data-testid="desk-row-age">
            {age === null ? '—' : `${age} yrs (on 31 Dec ${cutoff})`}
            {lowest ? ` · belongs in ${ageLabel(lowest)}` : ''}
          </p>
        </div>
        <Field id={id('group')} label="Age group" error={errorFor('ageGroup')}>
          <Select value={row.ageGroup || ''} disabled={locked || groupOptions.length === 0}
            onChange={(e) => set({ ageGroup: e.target.value })}>
            {groupOptions.length === 0 && <option value="">{age === null ? 'Enter the date of birth' : 'No group fits'}</option>}
            {groupOptions.map((group) => (
              <option key={group} value={group} disabled={!eligible.includes(group)}>
                {ageLabel(group)}{!eligible.includes(group) ? ' (not allowed)' : group === lowest ? '' : ' (playing up)'}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-1">
        <p className="ui-field__label type-tag m-0">Apparatus</p>
        <div className="flex flex-wrap gap-4">
          {forGender.apparatus.length === 0 && <span className="type-body-s text-fg-muted">{row.gender ? 'None offered' : 'Choose the gender first'}</span>}
          {forGender.apparatus.map((name) => (
            <CheckBox key={name} id={id(`app-${name}`)} disabled={locked}
              checked={(row.apparatus || []).includes(name)}
              onChange={(on) => set({ apparatus: on ? [...(row.apparatus || []), name] : (row.apparatus || []).filter((a) => a !== name) })}>
              {APPARATUS_LABEL[name] || name}
            </CheckBox>
          ))}
        </div>
        {errorFor('apparatus') && <p className="ui-field__error type-caption m-0" role="alert">{errorFor('apparatus')}</p>}
      </div>

      {!locked && needsDuplicateConfirm && (
        <CheckBox id={id('dup')} checked={Boolean(row.confirmDuplicate)} onChange={(on) => set({ confirmDuplicate: on })}>
          This is a different child from the player already registered with this name and date of birth.
        </CheckBox>
      )}

      {notes.length > 0 && (
        <ul className="m-0 pl-5 grid gap-1">
          {notes.map((note) => (
            <li key={`${note.field}-${note.message}`} className="type-caption text-fg-muted">{note.message}</li>
          ))}
        </ul>
      )}
    </li>
  );
};

DeskReviewRow.propTypes = {
  index: PropTypes.number.isRequired,
  row: PropTypes.object.isRequired,
  crop: PropTypes.string,
  competition: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  locked: PropTypes.bool,
};

export default DeskReviewRow;
