import api from '../api-client.js';

/**
 * The signed-in user's own account, for every role — the profile page behind
 * the top-right account menu (Server/src/routes/auth.routes.js, /auth/me/*).
 */
export const accountAPI = {
  /** Profile (no credentials) plus any email change in progress. */
  get: () => api.get('/auth/me/account'),
  /** Edit the fields this role may change; anything else is ignored. */
  update: (changes) => api.put('/auth/me', changes),
  /** Needs the current password; other sessions are signed out, this one gets a new token. */
  changePassword: (currentPassword, newPassword) => api.put('/auth/me/password', { currentPassword, newPassword }),
  /** Mails a code to the new address; nothing changes until it is confirmed. */
  requestEmailChange: ({ newEmail, emailType, currentPassword }) =>
    api.post('/auth/me/email', { newEmail, emailType, currentPassword }),
  confirmEmailChange: (code) => api.post('/auth/me/email/confirm', { code }),
  cancelEmailChange: () => api.delete('/auth/me/email'),
};
