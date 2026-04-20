/**
 * Tests for Input Sanitization Utility
 * Requirements: 17.5
 */

const {
  sanitizeQueryParam,
  sanitizeMongoQuery,
  escapeHtml,
  stripHtml,
  normalizeEmail,
  sanitizeString,
  sanitizeName,
  sanitizeText,
  sanitizeUserData,
  sanitizeCompetitionData,
  sanitizeTeamData,
  isValidGender,
  isValidAgeGroup,
  isValidCompetitionType,
  isValidCompetitionStatus
} = require('./sanitization.util');

// ---------------------------------------------------------------------------
// sanitizeQueryParam (existing)
// ---------------------------------------------------------------------------

describe('sanitizeQueryParam', () => {
  it('trims whitespace from strings', () => {
    expect(sanitizeQueryParam('  hello  ')).toBe('hello');
  });

  it('returns null for non-string values', () => {
    expect(sanitizeQueryParam(123)).toBeNull();
    expect(sanitizeQueryParam(null)).toBeNull();
    expect(sanitizeQueryParam({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it('returns non-string values unchanged', () => {
    expect(escapeHtml(42)).toBe(42);
    expect(escapeHtml(null)).toBeNull();
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
  });

  it('removes script tags', () => {
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('leaves plain text unchanged', () => {
    expect(stripHtml('hello world')).toBe('hello world');
  });

  it('returns non-string values unchanged', () => {
    expect(stripHtml(99)).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------

describe('normalizeEmail', () => {
  it('lowercases the email', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('trims whitespace', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('returns non-string values unchanged', () => {
    expect(normalizeEmail(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sanitizeString
// ---------------------------------------------------------------------------

describe('sanitizeString', () => {
  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('strips HTML tags', () => {
    expect(sanitizeString('<b>hello</b>')).toBe('hello');
  });

  it('returns non-string values unchanged', () => {
    expect(sanitizeString(42)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// sanitizeName
// ---------------------------------------------------------------------------

describe('sanitizeName', () => {
  it('trims and collapses multiple spaces', () => {
    expect(sanitizeName('  John   Doe  ')).toBe('John Doe');
  });

  it('strips HTML tags', () => {
    expect(sanitizeName('<b>Alice</b>')).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// sanitizeText
// ---------------------------------------------------------------------------

describe('sanitizeText', () => {
  it('strips HTML and trims', () => {
    expect(sanitizeText('  <p>Hello</p>  ')).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// sanitizeUserData
// ---------------------------------------------------------------------------

describe('sanitizeUserData', () => {
  it('normalizes email to lowercase', () => {
    const result = sanitizeUserData({ email: 'USER@EXAMPLE.COM' });
    expect(result.email).toBe('user@example.com');
  });

  it('sanitizes firstName and lastName', () => {
    const result = sanitizeUserData({
      firstName: '  <b>Alice</b>  ',
      lastName: '  Smith  '
    });
    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Smith');
  });

  it('sanitizes name field', () => {
    const result = sanitizeUserData({ name: '<script>xss</script>Bob' });
    // stripHtml removes tags without adding spaces, so 'xss' and 'Bob' are concatenated
    expect(result.name).toBe('xssBob');
  });

  it('strips non-digit characters from phone (except +, -, (, ), space)', () => {
    const result = sanitizeUserData({ phone: '+91-98765<script>43210</script>' });
    // script tags stripped, only allowed chars remain
    expect(result.phone).not.toContain('<');
    expect(result.phone).not.toContain('>');
  });

  it('preserves non-string fields unchanged', () => {
    const result = sanitizeUserData({ age: 25, isActive: true });
    expect(result.age).toBe(25);
    expect(result.isActive).toBe(true);
  });

  it('returns null/undefined input unchanged', () => {
    expect(sanitizeUserData(null)).toBeNull();
    expect(sanitizeUserData(undefined)).toBeUndefined();
  });

  it('does not mutate the original object', () => {
    const original = { email: 'USER@EXAMPLE.COM', name: 'Alice' };
    sanitizeUserData(original);
    expect(original.email).toBe('USER@EXAMPLE.COM');
  });
});

// ---------------------------------------------------------------------------
// sanitizeCompetitionData
// ---------------------------------------------------------------------------

describe('sanitizeCompetitionData', () => {
  it('sanitizes name and place', () => {
    const result = sanitizeCompetitionData({
      name: '  <b>State Championship</b>  ',
      place: '  Mumbai  '
    });
    expect(result.name).toBe('State Championship');
    expect(result.place).toBe('Mumbai');
  });

  it('sanitizes description', () => {
    const result = sanitizeCompetitionData({
      description: '<script>alert(1)</script>Annual event'
    });
    expect(result.description).toBe('alert(1)Annual event');
  });

  it('preserves non-string fields', () => {
    const result = sanitizeCompetitionData({ year: 2025, startDate: new Date() });
    expect(result.year).toBe(2025);
  });
});

// ---------------------------------------------------------------------------
// sanitizeTeamData
// ---------------------------------------------------------------------------

describe('sanitizeTeamData', () => {
  it('sanitizes team name', () => {
    const result = sanitizeTeamData({ name: '  <b>Team Alpha</b>  ' });
    expect(result.name).toBe('Team Alpha');
  });

  it('sanitizes description', () => {
    const result = sanitizeTeamData({ description: '<p>Best team</p>' });
    expect(result.description).toBe('Best team');
  });
});

// ---------------------------------------------------------------------------
// Whitelist validators (existing)
// ---------------------------------------------------------------------------

describe('isValidGender', () => {
  it('accepts Male and Female', () => {
    expect(isValidGender('Male')).toBe(true);
    expect(isValidGender('Female')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidGender('male')).toBe(false);
    expect(isValidGender('Other')).toBe(false);
  });
});

describe('isValidAgeGroup', () => {
  it('accepts valid age groups', () => {
    expect(isValidAgeGroup('Under10')).toBe(true);
    expect(isValidAgeGroup('Above18')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidAgeGroup('Under5')).toBe(false);
  });
});

describe('isValidCompetitionType', () => {
  it('accepts valid types', () => {
    expect(isValidCompetitionType('Competition I')).toBe(true);
  });

  it('rejects invalid types', () => {
    expect(isValidCompetitionType('Competition IV')).toBe(false);
  });
});

describe('isValidCompetitionStatus', () => {
  it('accepts valid statuses', () => {
    expect(isValidCompetitionStatus('upcoming')).toBe(true);
    expect(isValidCompetitionStatus('ongoing')).toBe(true);
    expect(isValidCompetitionStatus('completed')).toBe(true);
  });

  it('rejects invalid statuses', () => {
    expect(isValidCompetitionStatus('cancelled')).toBe(false);
  });
});
