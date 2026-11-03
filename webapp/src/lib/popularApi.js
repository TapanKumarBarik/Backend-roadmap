// The lessons read most, for the home page (api/routes/popular.js): [{ path, views }], newest window first. A failure is an ApiError.
import { apiError } from './errors.js';

export async function fetchPopularLessons() {
  const res = await fetch('/api/popular');
  if (!res.ok) throw await apiError(res, 'failed to load the popular lessons');
  return (await res.json()).lessons;
}
