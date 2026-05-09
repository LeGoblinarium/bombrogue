const Auth = (() => {
  const KEY = 'bombrogue_token';
  let _user = null; // { id, username, rank, hasMordek }

  function getToken() {
    return localStorage.getItem(KEY);
  }

  function _save(token, user) {
    localStorage.setItem(KEY, token);
    _user = user;
  }

  function logout() {
    localStorage.removeItem(KEY);
    _user = null;
  }

  function getUser() { return _user; }
  function isLoggedIn() { return !!_user; }

  async function _apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur réseau');
    return data;
  }

  async function register(username, password) {
    const data = await _apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    _save(data.token, data.user);
    return data.user;
  }

  async function login(username, password) {
    const data = await _apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    _save(data.token, data.user);
    return data.user;
  }

  // Called on app load — verifies stored token and refreshes user data
  async function init() {
    const token = getToken();
    if (!token) return null;
    try {
      const user = await _apiFetch('/api/auth/me');
      _user = user;
      return user;
    } catch {
      logout(); // token expired or invalid
      return null;
    }
  }

  // Called when the server emits rank-updated with a fresh token
  function updateRank(newRank, newToken) {
    if (_user) _user.rank = newRank;
    if (newToken) localStorage.setItem(KEY, newToken);
  }

  return { init, login, register, logout, getToken, getUser, isLoggedIn, updateRank };
})();
