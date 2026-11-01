export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'La connexion a échoué.');
  return data;
}
export const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });
