/**
 * The one matcher behind every list search: case-insensitive, and every word
 * of the query must appear in one of the fields ("pune senior" finds the
 * Senior meet in Pune). An empty query matches everything.
 */
export const matchesSearch = (query, ...fields) => {
  const words = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.flat().filter((f) => f != null && f !== '').map((f) => String(f).toLowerCase()).join(' ');
  return words.every((w) => hay.includes(w));
};
