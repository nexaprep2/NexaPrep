// Shared fetch helper for the student-facing app.
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('studentToken');
}
function setToken(token) {
  localStorage.setItem('studentToken', token);
}
function clearSession() {
  localStorage.removeItem('studentToken');
  localStorage.removeItem('studentInfo');
}
function getStudentInfo() {
  try {
    return JSON.parse(localStorage.getItem('studentInfo') || 'null');
  } catch {
    return null;
  }
}
function setStudentInfo(info) {
  localStorage.setItem('studentInfo', JSON.stringify(info));
}

async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = {};
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    const message = data.error || 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return data;
}

function requireStudentAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
  }
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
