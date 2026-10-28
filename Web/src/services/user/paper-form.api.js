/**
 * Paper form (OCR) for a coach's own team — `/api/coaches/paper-form/*`.
 *
 * The same method names as `deskAPI`, so the desk's form and slip screens run
 * unchanged against it. The competition is the one in the coach's session;
 * there is no payment here (the coach uses Pay Fees on the dashboard).
 * See Server/src/routes/coach.routes.js.
 */
import api from '../api-client.js';

const draft = (id) => `/coaches/paper-form/draft/${id}`;

export const paperFormAPI = {
  ocrStatus: () => api.get('/coaches/paper-form/ocr/status'),
  /** The printable form — the same one the desk prints — as a Blob. */
  formPdf: () => api.get('/coaches/paper-form/form', { responseType: 'blob' }),
  /** The coach's unfinished form for this competition, or `{ draft: null }`. */
  current: () => api.get('/coaches/paper-form/draft'),
  open: () => api.post('/coaches/paper-form/draft'),
  getDraft: (id) => api.get(draft(id)),
  cancelDraft: (id) => api.delete(draft(id)),
  scan: (id, blob, page) => api.post(`${draft(id)}/scan`, blob, {
    params: page ? { page } : undefined,
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    timeout: 90000,
  }),
  saveRows: (id, data) => api.put(`${draft(id)}/rows`, data),
  submit: (id) => api.post(`${draft(id)}/submit`, undefined, { timeout: 120000 }),
  slip: (id) => api.get(`${draft(id)}/slip`),
};

export default paperFormAPI;
