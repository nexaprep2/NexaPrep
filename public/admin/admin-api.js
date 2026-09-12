const API_BASE = '/api';

function getAdminToken() { return localStorage.getItem('adminToken'); }
function setAdminToken(t) { localStorage.setItem('adminToken', t); }
function clearAdminSession() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminInfo');
}
function getAdminInfo() {
  try { return JSON.parse(localStorage.getItem('adminInfo') || 'null'); } catch { return null; }
}
function setAdminInfo(info) { localStorage.setItem('adminInfo', JSON.stringify(info)); }

async function adminApiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function requireAdminAuth() {
  if (!getAdminToken()) window.location.href = 'login.html';
}

function showAlert(containerId, message, type = 'error') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}
function hideAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.classList.add('hidden');
}
