const API = ''; // meme domaine (le backend sert aussi le frontend)
const HOURS = Array.from({ length: 13 }, (_, i) => 9 + i); // 9h -> 21h

let token = localStorage.getItem('token') || null;
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let rooms = [];
let reservations = [];
let selectedRoomId = null;
let selectedHour = null;
let editingResId = null;

const $ = (id) => document.getElementById(id);

// ---------- Init ----------
function init() {
  $('datePicker').value = todayStr();
  if (token && currentUser) {
    showMain();
  } else {
    showLogin();
  }

  $('loginBtn').addEventListener('click', doLogin);
  $('logoutBtn').addEventListener('click', doLogout);
  $('prevDay').addEventListener('click', () => shiftDay(-1));
  $('nextDay').addEventListener('click', () => shiftDay(1));
  $('datePicker').addEventListener('change', loadReservations);
  $('cancelResBtn').addEventListener('click', closeModal);
  $('saveResBtn').addEventListener('click', saveReservation);
  $('deleteResBtn').addEventListener('click', deleteReservation);
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function shiftDay(delta) {
  const d = new Date($('datePicker').value);
  d.setDate(d.getDate() + delta);
  $('datePicker').value = d.toISOString().slice(0, 10);
  loadReservations();
}

// ---------- Auth ----------
async function doLogin() {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  $('loginError').textContent = '';
  if (!username || !password) {
    $('loginError').textContent = 'Rempli username o password';
    return;
  }
  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      $('loginError').textContent = data.error || 'Erreur de connexion';
      return;
    }
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    showMain();
  } catch (e) {
    $('loginError').textContent = 'Impossible de contacter le serveur';
  }
}

function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token = null;
  currentUser = null;
  showLogin();
}

function showLogin() {
  $('loginScreen').classList.remove('hidden');
  $('mainScreen').classList.add('hidden');
}

function showMain() {
  $('loginScreen').classList.add('hidden');
  $('mainScreen').classList.remove('hidden');
  $('userLabel').textContent = currentUser.full_name;
  loadRoomsAndReservations();
}

async function authFetch(url, options = {}) {
  const opts = { ...options };
  opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, opts);
  if (res.status === 401) {
    doLogout();
    throw new Error('Session expiree');
  }
  return res;
}

// ---------- Data loading ----------
async function loadRoomsAndReservations() {
  const res = await authFetch(`${API}/api/rooms`);
  rooms = await res.json();
  await loadReservations();
}

async function loadReservations() {
  const date = $('datePicker').value;
  const res = await authFetch(`${API}/api/reservations?date=${date}`);
  reservations = await res.json();
  renderGrid();
}

// ---------- Rendering ----------
const SECTION_COLORS = {
  TAMAZIGHT: '#f28b6b',
  TIFAWIN: '#7fb3d5',
  TANIRT: '#82c785',
  TAFOKT: '#c39bd3',
  HAMMAM: '#f5d76e',
};

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  grid.style.setProperty('--n-cols', rooms.length);

  // Ligne 1: sections
  const sectionRow = document.createElement('div');
  sectionRow.className = 'grid-row';
  sectionRow.style.setProperty('--n-cols', rooms.length);
  const corner1 = document.createElement('div');
  corner1.className = 'hour-corner';
  sectionRow.appendChild(corner1);
  rooms.forEach((r) => {
    const cell = document.createElement('div');
    cell.className = 'cell-section';
    cell.style.background = SECTION_COLORS[r.section] || '#999';
    cell.textContent = r.section;
    sectionRow.appendChild(cell);
  });
  grid.appendChild(sectionRow);

  // Ligne 2: noms des rooms
  const headerRow = document.createElement('div');
  headerRow.className = 'grid-row';
  headerRow.style.setProperty('--n-cols', rooms.length);
  const corner2 = document.createElement('div');
  corner2.className = 'hour-corner';
  corner2.textContent = 'H';
  headerRow.appendChild(corner2);
  rooms.forEach((r) => {
    const cell = document.createElement('div');
    cell.className = 'cell-header';
    cell.textContent = r.name;
    headerRow.appendChild(cell);
  });
  grid.appendChild(headerRow);

  // Lignes: heures
  HOURS.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.style.setProperty('--n-cols', rooms.length);

    const hourCell = document.createElement('div');
    hourCell.className = 'hour-cell';
    hourCell.textContent = h;
    row.appendChild(hourCell);

    rooms.forEach((r) => {
      const cell = document.createElement('div');
      const existing = reservations.find((res) => res.room_id === r.id && res.hour === h);
      cell.className = 'res-cell' + (existing ? ' filled' : '');
      if (existing) {
        cell.innerHTML = `
          <div class="res-client">${escapeHtml(existing.client_type || '')}</div>
          <div class="res-detail">${existing.nb_personnes || ''} ${escapeHtml(existing.sexe || '')}</div>
          ${existing.prix ? `<div class="res-prix">${existing.prix} dh</div>` : ''}
          ${existing.staff_names ? `<div class="res-staff">${escapeHtml(existing.staff_names)}</div>` : ''}
        `;
      }
      cell.addEventListener('click', () => openModal(r.id, h, existing));
      row.appendChild(cell);
    });

    grid.appendChild(row);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- Modal / CRUD ----------
function openModal(roomId, hour, existing) {
  selectedRoomId = roomId;
  selectedHour = hour;
  editingResId = existing ? existing.id : null;

  $('modalTitle').textContent = existing ? 'Modifier reservation' : 'Nouvelle reservation';
  $('fClient').value = existing ? existing.client_type || '' : '';
  $('fNbPersonnes').value = existing ? existing.nb_personnes || 1 : 1;
  $('fSexe').value = existing ? existing.sexe || '' : '';
  $('fPrix').value = existing ? existing.prix || '' : '';
  $('fDuration').value = existing ? existing.duration || 1 : 1;
  $('fOrigine').value = existing ? existing.origine || '' : '';
  $('fStaff').value = existing ? existing.staff_names || '' : '';
  $('fNote').value = existing ? existing.note || '' : '';

  $('deleteResBtn').classList.toggle('hidden', !existing);
  $('resModal').classList.remove('hidden');
}

function closeModal() {
  $('resModal').classList.add('hidden');
  editingResId = null;
}

async function saveReservation() {
  const payload = {
    room_id: selectedRoomId,
    date: $('datePicker').value,
    hour: selectedHour,
    duration: parseInt($('fDuration').value, 10) || 1,
    client_type: $('fClient').value.trim(),
    nb_personnes: parseInt($('fNbPersonnes').value, 10) || 1,
    sexe: $('fSexe').value,
    origine: $('fOrigine').value.trim(),
    prix: $('fPrix').value ? parseFloat($('fPrix').value) : null,
    note: $('fNote').value.trim(),
    staff_names: $('fStaff').value.trim(),
  };

  try {
    let res;
    if (editingResId) {
      res = await authFetch(`${API}/api/reservations/${editingResId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await authFetch(`${API}/api/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Erreur');
      return;
    }
    closeModal();
    loadReservations();
  } catch (e) {
    alert('Erreur de connexion');
  }
}

async function deleteReservation() {
  if (!editingResId) return;
  if (!confirm('Supprimer cette reservation ?')) return;
  await authFetch(`${API}/api/reservations/${editingResId}`, { method: 'DELETE' });
  closeModal();
  loadReservations();
}

init();
