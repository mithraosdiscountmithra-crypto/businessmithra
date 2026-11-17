// Small helper so every route handler passes errors to the error middleware.
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const optStr = (max) => (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
};
