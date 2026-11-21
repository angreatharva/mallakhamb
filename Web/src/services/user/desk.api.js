/**
 * Walk-in desk API (`/api/desk/*`, Admin and Super Admin).
 *
 * Built on `api`, which picks the admin or super admin token from the page's
 * URL, refreshes on 401 and sends the CSRF header — the same as every other
 * admin call. See Server/src/routes/walk-in.routes.js.
 */
import api from '../api-client.js';

const draft = (id) => `/desk/drafts/${id}`;
const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const deskAPI = {
  openMeets: () => api.get('/desk/meets'),
  ocrStatus: () => api.get('/desk/ocr/status'),

  findCoach: (email) => api.get('/desk/coaches', { params: { email } }),
  /** Up to 10 coaches matching part of a name, phone, email or team name. */
  searchCoaches: (q) => api.get('/desk/coaches', { params: { q } }),
  createCoach: (data) => api.post('/desk/coaches', data),
  setDefaultPassword: (coachId, data) => api.put(`/desk/coaches/${coachId}/player-default-password`, data),
  ensureTeam: (coachId, data) => api.post(`/desk/coaches/${coachId}/team`, data),
  /** The coach's default player password, for the coach to read at the desk. */
  defaultPassword: (coachId) => api.get(`/desk/coaches/${coachId}/player-default-password`),

  /** Is the coach's team submitted at this meet? (the unlock card) */
  teamStatus: (competitionId, coachId) => api.get('/desk/teams/status', { params: { competitionId, coachId } }),
  /** Unlock a submitted team: paid players stay paid, only new ones are charged. */
  unlockTeam: (data) => api.post('/desk/teams/unlock', data),

  /** The Excel template, as a Blob. */
  excelTemplate: () => api.get('/desk/excel-template', { responseType: 'blob' }),
  /** Read a filled template; nothing is saved. */
  parseExcel: (file) => api.post('/desk/excel/parse', file, { headers: { 'Content-Type': EXCEL_TYPE } }),
  /** Add a filled template's players to the form, for review. */
  importExcel: (id, file) => api.post(`${draft(id)}/excel`, file, {
    params: { fileName: file.name || 'players.xlsx' },
    headers: { 'Content-Type': EXCEL_TYPE },
  }),

  /** The printable form — one for every competition — as a Blob. */
  formPdf: () => api.get('/desk/form', { responseType: 'blob' }),

  listDrafts: (competitionId) => api.get('/desk/drafts', { params: { competitionId } }),
  openDraft: (data) => api.post('/desk/drafts', data),
  getDraft: (id) => api.get(draft(id)),
  cancelDraft: (id) => api.delete(draft(id)),
  /**
   * One page photo. The body is the image itself; 60 s because a busy reader
   * on a one-core VM queues pages one at a time.
   */
  scan: (id, blob, page) => api.post(`${draft(id)}/scan`, blob, {
    params: page ? { page } : undefined,
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    timeout: 90000,
  }),
  saveRows: (id, data) => api.put(`${draft(id)}/rows`, data),
  submit: (id) => api.post(`${draft(id)}/submit`, undefined, { timeout: 120000 }),

  createPaymentOrder: (id) => api.post(`${draft(id)}/payment/order`),
  verifyPayment: (id, payload) => api.post(`${draft(id)}/payment/verify`, payload),
  quoteDiscount: (id, discountCode) => api.post(`${draft(id)}/payment/discount/quote`, { discountCode }),
  // A reopened team with nobody new to pay for.
  resubmitPaid: (id) => api.post(`${draft(id)}/payment/resubmit`),
  redeemDiscount: (id, discountCode) => api.post(`${draft(id)}/payment/discount`, { discountCode }),

  slip: (id) => api.get(`${draft(id)}/slip`),
};

export default deskAPI;
