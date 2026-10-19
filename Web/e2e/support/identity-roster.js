/**
 * Three players, one per first-screen registration choice — the fixture for
 * checking Player IDs, the guardian email and coach-approved resets end to end.
 *
 * Used against a throwaway local database (the `api-local-check` launch entry);
 * they all join SGAM-A, Rajesh Amrale's team from coach-roster.js, at the
 * district level, so he is the coach who approves their requests.
 *
 * Children's details are invented. The password follows people.js's pattern.
 */

export const IDENTITY_TEAM = { teamName: 'SGAM-A', level: 'district', coachFirstName: 'Rajesh' };

export const IDENTITY_PLAYERS = [
  {
    choice: 'none',
    firstName: 'Aarav', lastName: 'Patil', dateOfBirth: '2016-06-15', gender: 'Male',
    loginId: 'aarav.patil.150616',
    guardian: { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' },
    password: 'Aarav@2026',
  },
  {
    choice: 'guardian',
    firstName: 'Diya', lastName: 'Patil', dateOfBirth: '2017-03-02', gender: 'Female',
    loginId: 'diya.patil.020317',
    email: 'patil.family@example.com',
    guardian: { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' },
    password: 'Diya@2026',
  },
  {
    choice: 'own',
    firstName: 'Kabir', lastName: 'Shah', dateOfBirth: '2008-09-20', gender: 'Male',
    loginId: 'kabir.shah.200908',
    email: 'kabir.shah@example.com',
    phone: '9123456780',
    password: 'Kabir@2026',
  },
];
