const API_BASE = '';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'same-origin',
    ...options,
  });

  if (res.status === 401) {
    // Token expired or invalid — redirect to login
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  if (res.status === 503) {
    const data = await res.json();
    if (data.error === 'CREDENTIALS_MISSING') {
      throw new Error('CREDENTIALS_MISSING');
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  return res.json();
}

export function checkAuth() {
  return request('/auth/status');
}

export function fetchSummary() {
  return request('/api/summary');
}

export function fetchSenders() {
  return request('/api/senders');
}

export function fetchHeatmap() {
  return request('/api/heatmap');
}

export function fetchProfile() {
  return request('/api/profile');
}

export function refreshData() {
  return request('/api/refresh');
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' });
}
