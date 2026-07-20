const API = ''; // meme domaine (le backend sert aussi le frontend)
let hoursMax = parseInt(localStorage.getItem('hoursMax') || '18', 10);
function getHours() {
  const arr = [];
  for (let h = 10; h <= hoursMax; h++) arr.push(h);
  return arr;
}
function updateHoursLabel() {
  $('hoursRangeLabel').textContent = `10h - ${hoursMax}h`;
}

let token = localStorage.getItem('token') || null;
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let rooms = [];
let services = [];
let reservations = [];
let selectedRoomId = null;
let selectedHour = null;
let editingResId = null;
let currentDate = todayStr();
let popupViewDate = null;
let popupMode = 'month'; // 'month' ou 'year'

const $ = (id) => document.getElementById(id);
const MOIS_FR = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
const JOURS_FR = ['dim','lun','mar','mer','jeu','ven','sam'];
const JOURS_FR_LONG = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ---------- Init ----------
function init() {
  if (token && currentUser) {
    showMain();
  } else {
    showLogin();
  }

  $('loginBtn').addEventListener('click', doLogin);
  $('logoutBtn').addEventListener('click', doLogout);
  $('cancelResBtn').addEventListener('click', closeModal);
  $('saveResBtn').addEventListener('click', saveReservation);
  $('deleteResBtn').addEventListener('click', deleteReservation);
  $('prevDayBtn').addEventListener('click', () => shiftCalendar(-1));
  $('nextDayBtn').addEventListener('click', () => shiftCalendar(1));
  $('todayBtn').addEventListener('click', goToday);
  $('dateDisplay').addEventListener('click', openCalPopup);
  $('calPopupClose').addEventListener('click', closeCalPopup);
  $('calPopupOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'calPopupOverlay') closeCalPopup();
  });
  $('calPopupMonthBtn').addEventListener('click', () => {
    popupMode = popupMode === 'month' ? 'year' : 'month';
    renderCalPopup();
  });
  $('calPopupPrev').addEventListener('click', () => {
    if (popupMode === 'month') popupViewDate.setMonth(popupViewDate.getMonth() - 1);
    else popupViewDate.setFullYear(popupViewDate.getFullYear() - 1);
    renderCalPopup();
  });
  $('calPopupNext').addEventListener('click', () => {
    if (popupMode === 'month') popupViewDate.setMonth(popupViewDate.getMonth() + 1);
    else popupViewDate.setFullYear(popupViewDate.getFullYear() + 1);
    renderCalPopup();
  });
  $('addHourBtn').addEventListener('click', () => {
    if (hoursMax < 21) {
      hoursMax += 1;
      localStorage.setItem('hoursMax', hoursMax);
      updateHoursLabel();
      renderGrid();
    } else {
      alert('Heure maximum atteinte (21h).');
    }
  });
  $('removeHourBtn').addEventListener('click', () => {
    if (hoursMax > 18) {
      hoursMax -= 1;
      localStorage.setItem('hoursMax', hoursMax);
      updateHoursLabel();
      renderGrid();
    } else {
      alert('Heure minimum atteinte (18h).');
    }
  });
  updateHoursLabel();
  $('cancelMoveBtn').addEventListener('click', cancelMove);
  $('cancelCopyBtn').addEventListener('click', cancelCopy);
  $('includedSkipBtn').addEventListener('click', () => $('includedModal').classList.add('hidden'));
  $('includedAddBtn').addEventListener('click', confirmIncludedMassage);
  $('gratuitBtn').addEventListener('click', () => {
    $('fPrix').value = 0;
    updateLivePreview();
  });

  // Glisser-deposer a la souris (desktop) - en plus du "toucher pour deplacer" (mobile)
  $('grid').addEventListener('dragstart', (e) => {
    const entry = e.target.closest('[data-res-id]');
    if (!entry) return;
    e.dataTransfer.setData('text/plain', entry.dataset.resId);
    entry.style.opacity = '0.4';
  });
  $('grid').addEventListener('dragend', (e) => {
    const entry = e.target.closest('[data-res-id]');
    if (entry) entry.style.opacity = '';
  });
  let lastDragHoverCell = null;
  $('grid').addEventListener('dragover', (e) => {
    const cell = e.target.closest('.res-cell');
    if (!cell) return;
    e.preventDefault();
    if (lastDragHoverCell && lastDragHoverCell !== cell) lastDragHoverCell.classList.remove('drag-hover');
    cell.classList.add('drag-hover');
    lastDragHoverCell = cell;
  });
  $('grid').addEventListener('dragleave', (e) => {
    const cell = e.target.closest('.res-cell');
    if (cell) cell.classList.remove('drag-hover');
  });
  $('grid').addEventListener('drop', async (e) => {
    const cell = e.target.closest('.res-cell');
    if (lastDragHoverCell) { lastDragHoverCell.classList.remove('drag-hover'); lastDragHoverCell = null; }
    if (!cell) return;
    e.preventDefault();
    const resId = e.dataTransfer.getData('text/plain');
    const room = rooms.find((rm) => rm.id == cell.dataset.roomId);
    const hour = parseInt(cell.dataset.hour, 10);
    if (!resId || !room) return;
    moveMode = parseInt(resId, 10);
    await doMove(room, hour);
  });
}

// ---------- Deplacement (toucher pour deplacer) ----------
let moveMode = null;

function startMove(resId) {
  moveMode = resId;
  closeModal();
  $('moveBanner').classList.remove('hidden');
}

function cancelMove() {
  moveMode = null;
  $('moveBanner').classList.add('hidden');
}

async function doMove(room, hour) {
  const resId = moveMode;
  cancelMove();
  try {
    const res = await authFetch(`${API}/api/reservations/${resId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, hour, date: currentDate }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Impossible de deplacer ce rendez-vous ici.');
      return;
    }
    await loadReservations();
  } catch (e) {
    alert('Erreur de connexion');
  }
}

// ---------- Copier / Coller ----------
let copyMode = null;

function startCopy(res) {
  copyMode = { ...res };
  closeModal();
  $('copyBanner').classList.remove('hidden');
}

function cancelCopy() {
  copyMode = null;
  $('copyBanner').classList.add('hidden');
}

async function doPaste(room, hour) {
  const data = copyMode;
  cancelCopy();
  try {
    const res = await authFetch(`${API}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: room.id,
        service_id: data.service_id,
        date: currentDate,
        hour,
        duration: data.duration,
        client_type: data.client_type,
        nb_personnes: data.nb_personnes,
        sexe: data.sexe,
        origine: data.origine,
        auberge: data.auberge,
        sans_commission: data.sans_commission,
        remise: data.remise,
        alerte: data.alerte,
        taxi: data.taxi,
        prix: data.prix,
        note: data.note,
        staff_names: data.staff_names,
      }),
    });
    if (!res.ok) {
      const errData = await res.json();
      alert(errData.error || 'Impossible de coller ici.');
      return;
    }
    const savedRes = await res.json();
    await loadReservations();
    renderCalendar();
    currentRoom = room;
    currentHour = hour;
    selectedRoomId = room.id;
    selectedHour = hour;
    $('modalTitle').textContent = room.section + ' - ' + room.name;
    $('modalSub').textContent = hour + 'h00';
    $('resModal').classList.remove('hidden');
    showForm(savedRes);
  } catch (e) {
    alert('Erreur de connexion');
  }
}

// ---------- Calendrier ----------
// ---------- Calendrier ----------
function renderCalendar() {
  const d = new Date(currentDate + 'T00:00:00');
  const label = JOURS_FR_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_FR[d.getMonth()] + ' ' + d.getFullYear();
  const hasResToday = reservations.length > 0;
  $('dateDisplay').innerHTML = label + (hasResToday ? '<span class="date-res-dot"></span>' : '');
}

function selectDate(ds) {
  currentDate = ds;
  renderCalendar();
  loadReservations();
}

function shiftCalendar(days) {
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  currentDate = fmtDate(d);
  renderCalendar();
  loadReservations();
}

function goToday() {
  currentDate = todayStr();
  renderCalendar();
  loadReservations();
}

// ---------- Popup calendrier (mois / annee) ----------
function openCalPopup() {
  popupViewDate = new Date(currentDate + 'T00:00:00');
  popupMode = 'month';
  $('calPopupOverlay').classList.add('show');
  renderCalPopup();
}

function closeCalPopup() {
  $('calPopupOverlay').classList.remove('show');
}

function renderCalPopup() {
  $('calPopupMonthBtn').textContent = MOIS_FR[popupViewDate.getMonth()] + ' ' + popupViewDate.getFullYear();
  const body = $('calPopupBody');
  if (popupMode === 'month') {
    body.innerHTML = '<div class="cal-popup-dows">' + JOURS_FR.map((j) => '<span>' + j + '</span>').join('') + '</div>' +
      '<div class="cal-popup-days" id="calPopupDays"></div>';
    renderPopupMonthDays();
  } else {
    body.innerHTML = '<div class="cal-popup-yeargrid" id="calPopupYear"></div>';
    renderPopupYear();
  }
}

async function renderPopupMonthDays() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr2 = fmtDate(today);
  const year = popupViewDate.getFullYear(), month = popupViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - firstDay.getDay());
  const rangeStart = fmtDate(gridStart);
  const rangeEndDate = new Date(gridStart); rangeEndDate.setDate(gridStart.getDate() + 41);
  const rangeEnd = fmtDate(rangeEndDate);

  let datesSet = new Set();
  try {
    const res = await authFetch(`${API}/api/reservations-dates?start=${rangeStart}&end=${rangeEnd}`);
    datesSet = new Set(await res.json());
  } catch (e) { /* ignore */ }

  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const ds = fmtDate(d);
    const isOtherMonth = d.getMonth() !== month;
    const isSel = ds === currentDate;
    const isToday = ds === todayStr2;
    const hasRes = datesSet.has(ds);
    let cls = 'cal-popup-day';
    if (isOtherMonth) cls += ' otherm';
    if (isSel) cls += ' selected';
    if (isToday) cls += ' today';
    html += '<div class="' + cls + '" data-date="' + ds + '">' + d.getDate() +
      (hasRes ? '<div class="pd-dot"></div>' : '<div style="height:5px;"></div>') +
    '</div>';
  }
  const el = $('calPopupDays');
  el.innerHTML = html;
  el.querySelectorAll('.cal-popup-day').forEach((day) => {
    day.addEventListener('click', () => {
      selectDate(day.dataset.date);
      closeCalPopup();
    });
  });
}

async function renderPopupYear() {
  const year = popupViewDate.getFullYear();
  let monthsWithRes = new Set();
  try {
    const res = await authFetch(`${API}/api/reservations-dates?start=${year}-01-01&end=${year}-12-31`);
    const list = await res.json();
    monthsWithRes = new Set(list.map((ds) => ds.slice(0, 7)));
  } catch (e) { /* ignore */ }

  let html = '';
  const curYear = new Date(currentDate + 'T00:00:00').getFullYear();
  for (let m = 0; m < 12; m++) {
    const ym = year + '-' + String(m + 1).padStart(2, '0');
    const isSel = m === popupViewDate.getMonth() && year === curYear;
    html += '<div class="cal-popup-yearmonth' + (isSel ? ' selected' : '') + '" data-month="' + m + '">' +
      MOIS_FR[m] +
      (monthsWithRes.has(ym) ? '<div class="ym-dot"></div>' : '<div style="height:9px;"></div>') +
    '</div>';
  }
  const el = $('calPopupYear');
  el.innerHTML = html;
  el.querySelectorAll('.cal-popup-yearmonth').forEach((div) => {
    div.addEventListener('click', () => {
      popupViewDate = new Date(year, parseInt(div.dataset.month, 10), 1);
      popupMode = 'month';
      renderCalPopup();
    });
  });
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
  renderCalendar();
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
  const svcRes = await authFetch(`${API}/api/services`);
  services = await svcRes.json();
  populateServiceSelect();
  populateSectionFilter();
  await loadReservations();
  renderCalendar();
}

let selectedSection = null;

function populateSectionFilter() {
  const bar = $('sectionFilter');
  const sections = [...new Set(rooms.map((r) => r.section))];
  bar.innerHTML = '';
  const makeBtn = (label, value) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'white-space:nowrap;padding:8px 14px;border-radius:20px;border:1px solid #d1d5db;font-size:13px;font-weight:600;background:' + (selectedSection === value ? '#ff7a5c' : '#f3f4f6') + ';color:' + (selectedSection === value ? 'white' : '#374151') + ';';
    btn.onclick = () => { selectedSection = value; populateSectionFilter(); renderGrid(); };
    return btn;
  };
  bar.appendChild(makeBtn('Tout', null));
  sections.forEach((s) => bar.appendChild(makeBtn(s, s)));
}

function populateServiceSelect() {
  const select = $('fService');
  select.innerHTML = '<option value="">Service (massage / hammam)</option>';
  const massages = services.filter((s) => s.category === 'massage');
  const hammams = services.filter((s) => s.category === 'hammam');
  if (massages.length) {
    const g = document.createElement('optgroup');
    g.label = 'Massages';
    massages.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.name} - ${s.prix} dh (${formatDuree(s.duration_minutes)})`;
      g.appendChild(o);
    });
    select.appendChild(g);
  }
  if (hammams.length) {
    const g = document.createElement('optgroup');
    g.label = 'Hammams';
    hammams.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.name} - ${s.prix} dh (${formatDuree(s.duration_minutes)})`;
      g.appendChild(o);
    });
    select.appendChild(g);
  }
  select.onchange = () => {
    recalcPrice();
    updateLivePreview();
  };
}

function formatDuree(minutes) {
  const h = minutes / 60;
  return h === 1 ? '1h' : h + 'h';
}

function recalcPrice() {
  const svc = services.find((s) => s.id == $('fService').value);
  const nb = parseInt($('fNbPersonnes').value, 10) || 1;
  const remise = parseFloat($('fRemise').value) || 0;
  if (svc) {
    let total = svc.prix * nb - remise;
    const auberge = $('fAuberge').value.trim();
    const sansCommission = $('fSansCommission').checked;
    if (auberge && sansCommission) {
      const commission = nb * (nb >= 5 ? 100 : 50);
      total -= commission;
    }
    $('fPrix').value = Math.max(0, total);
    $('fDuration').value = Math.max(1, Math.round(svc.duration_minutes / 60));
  }
}

async function loadReservations() {
  const date = currentDate;
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

function findResList(roomId, hour) {
  return reservations.filter((r) => r.room_id === roomId && r.hour === hour);
}

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  const visibleRooms = selectedSection ? rooms.filter((r) => r.section === selectedSection) : rooms;
  grid.style.setProperty('--n-cols', visibleRooms.length);

  // Calcule la largeur des colonnes (plus grande, avec scroll horizontal si besoin)
  const cornerW = 34;
  const available = window.innerWidth - cornerW - 4;
  const colW = Math.max(92, Math.floor(available / visibleRooms.length));
  document.documentElement.style.setProperty('--corner-w', cornerW + 'px');
  document.documentElement.style.setProperty('--col-w', colW + 'px');

  const headerBlock = document.createElement('div');
  headerBlock.style.cssText = 'position:sticky;top:0;z-index:20;background:white;';

  // Ligne 1: sections (fusionnees par groupe consecutif)
  const sectionRow = document.createElement('div');
  sectionRow.style.display = 'flex';
  const corner1 = document.createElement('div');
  corner1.className = 'hour-corner';
  corner1.style.width = cornerW + 'px';
  corner1.style.flex = 'none';
  sectionRow.appendChild(corner1);
  let si = 0;
  while (si < visibleRooms.length) {
    const section = visibleRooms[si].section;
    let count = 0;
    while (si + count < visibleRooms.length && visibleRooms[si + count].section === section) count++;
    const cell = document.createElement('div');
    cell.className = 'cell-section';
    cell.style.background = SECTION_COLORS[section] || '#999';
    cell.style.width = (colW * count) + 'px';
    cell.style.flex = 'none';
    cell.textContent = section;
    sectionRow.appendChild(cell);
    si += count;
  }
  headerBlock.appendChild(sectionRow);

  // Ligne 2: noms des rooms
  const headerRow = document.createElement('div');
  headerRow.className = 'grid-row';
  headerRow.style.setProperty('--n-cols', visibleRooms.length);
  const corner2 = document.createElement('div');
  corner2.className = 'hour-corner';
  corner2.innerHTML = '<span style="writing-mode:vertical-rl;transform:rotate(180deg);font-weight:800;font-size:10px;letter-spacing:1px;">HEURE</span>';
  headerRow.appendChild(corner2);
  visibleRooms.forEach((r) => {
    const cell = document.createElement('div');
    cell.className = 'cell-header';
    cell.innerHTML = r.name
      .replace('home', '<br><span style="color:#2563eb;">home</span>')
      .replace('Feme', '<br><span style="color:#db2777;">Feme</span>')
      .replace('mixte', '<span style="color:#dc2626;">mixte</span>');
    headerRow.appendChild(cell);
  });
  headerBlock.appendChild(headerRow);
  grid.appendChild(headerBlock);

  // Lignes: heures
  getHours().forEach((h) => {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.style.setProperty('--n-cols', visibleRooms.length);

    const hourCell = document.createElement('div');
    hourCell.className = 'hour-cell';
    hourCell.textContent = h + 'H';
    row.appendChild(hourCell);

    visibleRooms.forEach((r) => {
      const cell = document.createElement('div');
      const list = findResList(r.id, h);
      const dejaPris = list.reduce((sum, r2) => sum + (r2.nb_personnes || 0), 0);
      const estPlein = dejaPris >= r.capacity_base;
      const aUneAlerte = list.some((r2) => r2.alerte);
      cell.className = 'res-cell' + (list.length ? ' filled' : '') + (estPlein ? ' full' : '') + (aUneAlerte ? ' alerte' : '');
      if (list.length) {
        cell.innerHTML = list.map((res, idx) => {
          const svc = services.find((s) => s.id === res.service_id);
          const nb = res.nb_personnes || 1;
          const genreColor = res.sexe === 'femme' ? '#db2777' : (res.sexe === 'homme' ? '#2563eb' : '#374151');
          const separator = idx > 0 ? '<hr style="border:none;border-top:2px dashed #d1d5db;margin:6px 0;">' : '';
          const aubergeColor = res.sans_commission ? '#1f2937' : '#ea580c';
          return separator + `
          <div style="margin-bottom:4px;cursor:grab;" draggable="true" data-res-id="${res.id}">
            ${svc ? `<div style="font-weight:700;color:#7c3aed;">${escapeHtml(svc.name)}</div>` : ''}
            ${res.sexe ? `<div style="font-weight:800;color:${genreColor};">${nb} ${escapeHtml(res.sexe)}${nb > 1 ? 's' : ''}</div>` : ''}
            ${res.origine ? `<div class="res-detail">${escapeHtml(res.origine)}</div>` : ''}
            ${res.auberge ? `<div style="font-weight:700;color:${aubergeColor};">${escapeHtml(res.auberge)}</div>` : ''}
            ${res.auberge && res.sans_commission ? `<div style="font-weight:700;color:#7c3aed;">Sans commission</div>` : ''}
            <div class="res-client">${escapeHtml(res.client_type || '')}</div>
            ${res.prix ? `<div class="res-prix">${res.prix} dh</div>` : ''}
            ${res.remise && parseFloat(res.remise) > 0 ? `<div style="color:#7c3aed;font-size:10px;">Remise: ${res.remise} dh</div>` : ''}
            <div style="font-weight:800;color:#000;">${res.hour}H</div>
            ${res.staff_names ? `<div class="res-staff">${escapeHtml(res.staff_names)}</div>` : ''}
            ${res.taxi ? '<div>🚕 taxi</div>' : ''}
            ${res.note ? `<div style="font-weight:700;color:#dc2626;">${escapeHtml(res.note)}</div>` : ''}
          </div>`;
        }).join('');
      }
      cell.dataset.roomId = r.id;
      cell.dataset.hour = h;
      if (moveMode || copyMode) cell.classList.add('drop-target');
      cell.addEventListener('click', () => {
        if (moveMode) {
          doMove(r, h);
        } else if (copyMode) {
          doPaste(r, h);
        } else {
          openSlot(r, h);
        }
      });
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
let currentRoom = null;
let currentHour = null;

function openSlot(room, hour) {
  currentRoom = room;
  currentHour = hour;
  selectedRoomId = room.id;
  selectedHour = hour;

  $('modalTitle').textContent = room.section + ' - ' + room.name;
  $('modalSub').textContent = hour + 'h00' +
    (room.capacity_flexible ? ' - capacite ' + room.capacity_base + '+ (extensible)' : ' - capacite max ' + room.capacity_base) +
    (room.sexe_restriction ? ' - reserve aux ' + room.sexe_restriction + 's' : '');

  $('resModal').classList.remove('hidden');

  const list = findResList(room.id, hour);
  if (list.length === 0) {
    // Case vide : on ouvre directement le formulaire, pas besoin de passer par la liste
    $('slotList').innerHTML = '';
    $('addNewBtn').style.display = 'none';
    showForm(null);
  } else {
    renderSlotList();
    $('resForm').classList.add('hidden');
  }
}

function renderSlotList() {
  const list = findResList(currentRoom.id, currentHour);
  const wrap = $('slotList');
  if (list.length === 0) {
    wrap.innerHTML = '';
  } else {
    wrap.innerHTML = list.map((res) => {
      const genreColor = res.sexe === 'femme' ? '#db2777' : (res.sexe === 'homme' ? '#2563eb' : '#374151');
      return `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:800;color:${genreColor};">${res.nb_personnes || 1} ${escapeHtml(res.sexe || '')}${(res.nb_personnes || 1) > 1 ? 's' : ''}</div>
          <div style="font-size:12px;color:#6b7280;">${res.origine ? escapeHtml(res.origine) + ' - ' : ''}${res.prix ? res.prix + ' dh - ' : ''}${escapeHtml(res.client_type || '')}${res.auberge ? ' - ' + escapeHtml(res.auberge) : ''}${res.staff_names ? ' - ' + escapeHtml(res.staff_names) : ''}${res.taxi ? ' - 🚕' : ''}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button data-edit="${res.id}" style="padding:6px 10px;">Modifier</button>
          <button data-move="${res.id}" style="padding:6px 10px;">Deplacer</button>
          <button data-copy="${res.id}" style="padding:6px 10px;">Copier</button>
          <button data-del="${res.id}" style="padding:6px 10px;color:#dc2626;">Suppr</button>
        </div>
      </div>
    `;
    }).join('');
    wrap.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.onclick = () => showForm(list.find((r) => r.id == btn.dataset.edit));
    });
    wrap.querySelectorAll('[data-move]').forEach((btn) => {
      btn.onclick = () => startMove(parseInt(btn.dataset.move, 10));
    });
    wrap.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = () => startCopy(list.find((r) => r.id == btn.dataset.copy));
    });
    wrap.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Supprimer ce client ?')) return;
        await authFetch(`${API}/api/reservations/${btn.dataset.del}`, { method: 'DELETE' });
        await loadReservations();
        renderCalendar();
        renderSlotList();
      };
    });
  }

  const dejaPris = list.reduce((sum, r) => sum + (r.nb_personnes || 0), 0);
  const peutAjouter = currentRoom.capacity_flexible || dejaPris < currentRoom.capacity_base;
  $('addNewBtn').style.display = peutAjouter ? 'block' : 'none';
  $('addNewBtn').onclick = () => showForm(null);
}

function showForm(existing) {
  editingResId = existing ? existing.id : null;
  $('fService').value = existing ? existing.service_id || '' : '';
  $('fClient').value = existing ? existing.client_type || '' : '';
  $('fNbPersonnes').value = existing ? existing.nb_personnes || '' : '';
  $('fSexe').value = existing ? existing.sexe || (currentRoom.sexe_restriction || '') : (currentRoom.sexe_restriction || '');
  $('fOrigine').value = existing ? existing.origine || '' : '';
  $('fAuberge').value = existing ? existing.auberge || '' : '';
  $('fSansCommission').checked = existing ? !!existing.sans_commission : false;
  $('fTaxi').checked = existing ? !!existing.taxi : false;
  $('fPrix').value = existing ? existing.prix || '' : '';
  $('fRemise').value = existing ? existing.remise || '' : '';
  $('fDuration').value = existing ? existing.duration || 1 : 1;
  $('fStaff').value = existing ? existing.staff_names || '' : '';
  $('fNote').value = existing ? existing.note || '' : '';
  $('fAlerte').checked = existing ? !!existing.alerte : false;
  $('deleteResBtn').classList.toggle('hidden', !existing);
  updateChipHighlight();
  updateLivePreview();
  $('resForm').classList.remove('hidden');
}

function updateChipHighlight() {
  const nb = $('fNbPersonnes').value;
  const sexe = $('fSexe').value;
  document.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.nb === nb && c.dataset.sexe === sexe);
  });
}

function updateLivePreview() {
  const svc = services.find((s) => s.id == $('fService').value);
  const nb = $('fNbPersonnes').value;
  const sexe = $('fSexe').value;
  const parts = [];
  if (svc) parts.push(`<strong>${svc.name}</strong> - ${$('fPrix').value || svc.prix} dh`);
  if (nb && sexe) parts.push(`${nb} ${sexe}${nb > 1 ? 's' : ''}`);
  $('livePreview').innerHTML = parts.length ? parts.join(' · ') : '<span style="color:#9ca3af;">Choisis un service et un nombre de personnes...</span>';
}

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $('fNbPersonnes').value = chip.dataset.nb;
    $('fSexe').value = chip.dataset.sexe;
    updateChipHighlight();
    recalcPrice();
    updateLivePreview();
  });
});
$('fNbPersonnes').addEventListener('input', () => { updateChipHighlight(); recalcPrice(); updateLivePreview(); });
$('fSexe').addEventListener('change', () => { updateChipHighlight(); updateLivePreview(); });
$('fRemise').addEventListener('input', () => { recalcPrice(); updateLivePreview(); });
$('fAuberge').addEventListener('input', () => { recalcPrice(); updateLivePreview(); });
$('fSansCommission').addEventListener('change', () => { recalcPrice(); updateLivePreview(); });
$('fPrix').addEventListener('input', updateLivePreview);

function closeModal() {
  $('resModal').classList.add('hidden');
  $('resForm').classList.add('hidden');
  editingResId = null;
}

async function saveReservation() {
  const payload = {
    room_id: selectedRoomId,
    service_id: $('fService').value || null,
    date: currentDate,
    hour: selectedHour,
    duration: parseInt($('fDuration').value, 10) || 1,
    client_type: $('fClient').value.trim(),
    nb_personnes: parseInt($('fNbPersonnes').value, 10) || 1,
    sexe: $('fSexe').value,
    origine: $('fOrigine').value,
    auberge: $('fAuberge').value.trim(),
    sans_commission: $('fSansCommission').checked,
    taxi: $('fTaxi').checked,
    prix: $('fPrix').value ? parseFloat($('fPrix').value) : null,
    remise: $('fRemise').value ? parseFloat($('fRemise').value) : 0,
    note: $('fNote').value.trim(),
    alerte: $('fAlerte').checked,
    staff_names: $('fStaff').value.trim(),
  };

  try {
    const isNew = !editingResId;
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
    $('resForm').classList.add('hidden');
    editingResId = null;
    const savedRes = await res.json().catch(() => null);
    await loadReservations();
    renderCalendar();
    closeModal();

    if (isNew) {
      const svc = savedRes ? services.find((s) => s.id === savedRes.service_id) : null;
      if (svc && (svc.name === 'Taziri' || svc.name === 'Royal')) {
        if (currentRoom.section === 'HAMMAM') {
          offerIncludedSession(savedRes, svc, 'massage');
        } else {
          offerIncludedSession(savedRes, svc, 'hammam');
        }
      }
    }
  } catch (e) {
    alert('Erreur de connexion');
  }
}

// ---------- Session incluse (Taziri / Royal) - fonctionne dans les 2 sens ----------
const PACK_MASSAGES = {
  Taziri: ['Relaxant', 'Tonique', 'Dos'],
  Royal: ['Relaxant', 'Tonique', 'Dos', 'Californien'],
};

let selectedIncludedRoomId = null;

function roomIsFull(room, hourReservations, nb) {
  const dejaPris = hourReservations
    .filter((r) => r.room_id === room.id)
    .reduce((s, r) => s + (r.nb_personnes || 0), 0);
  return dejaPris + (nb || 1) > room.capacity_base;
}

async function renderIncludedRoomList(candidateRooms, hour, nb) {
  const wrap = $('fIncludedRoomList');
  wrap.innerHTML = '<p style="font-size:13px;color:#6b7280;">Chargement...</p>';
  const res = await authFetch(`${API}/api/reservations?date=${currentDate}`);
  const dayReservations = await res.json();
  const hourReservations = dayReservations.filter((r) => r.hour === hour);

  wrap.innerHTML = candidateRooms.map((r) => {
    const full = roomIsFull(r, hourReservations, nb);
    return `<div class="room-option" data-room-id="${r.id}" data-full="${full}" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:6px;cursor:${full ? 'not-allowed' : 'pointer'};opacity:${full ? '0.5' : '1'};">
      <span>${r.section} - ${r.name}</span>
      <span style="font-weight:800;color:${full ? '#dc2626' : '#16a34a'};">${full ? 'Ferme' : 'Ouvert'}</span>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.room-option').forEach((el) => {
    if (el.dataset.full === 'true') return;
    el.addEventListener('click', () => {
      selectedIncludedRoomId = parseInt(el.dataset.roomId, 10);
      wrap.querySelectorAll('.room-option').forEach((x) => x.style.outline = 'none');
      el.style.outline = '2px solid #ff7a5c';
    });
  });
  const firstOpen = candidateRooms.find((r) => !roomIsFull(r, hourReservations, nb));
  selectedIncludedRoomId = firstOpen ? firstOpen.id : null;
  if (firstOpen) {
    const firstEl = wrap.querySelector(`[data-room-id="${firstOpen.id}"]`);
    if (firstEl) firstEl.style.outline = '2px solid #ff7a5c';
  }
}

function offerIncludedSession(savedRes, packSvc, direction) {
  $('includedModal').dataset.direction = direction;
  $('includedModal').dataset.baseRes = JSON.stringify(savedRes);
  $('includedModal').dataset.packName = packSvc.name;
  $('includedErrMsg').textContent = '';
  const targetHour = savedRes.hour + 1;

  if (direction === 'massage') {
    // Deja en hammam -> proposer le massage a l'heure suivante
    const allowedNames = PACK_MASSAGES[packSvc.name] || [];
    const options = services.filter((s) => s.category === 'massage' && allowedNames.includes(s.name));
    const massageRooms = rooms.filter((r) => r.section === 'TAMAZIGHT' || r.section === 'TIFAWIN' || r.section === 'TANIRT' || r.section === 'TAFOKT');
    $('includedSub').textContent = `${packSvc.name} inclut un massage a ${targetHour}h00 - choisis lequel et la chambre.`;
    $('fIncludedMassage').classList.remove('hidden');
    $('fIncludedMassage').innerHTML = options.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
    renderIncludedRoomList(massageRooms, targetHour, savedRes.nb_personnes);
  } else {
    // Deja en massage -> proposer le hammam a l'heure suivante (meme pack, pas de choix de type)
    const hammamRooms = rooms.filter((r) => r.section === 'HAMMAM');
    $('includedSub').textContent = `${packSvc.name} inclut le hammam a ${targetHour}h00 - choisis la chambre.`;
    $('fIncludedMassage').classList.add('hidden');
    renderIncludedRoomList(hammamRooms, targetHour, savedRes.nb_personnes);
  }
  $('includedModal').classList.remove('hidden');
}

async function confirmIncludedMassage() {
  const modal = $('includedModal');
  const direction = modal.dataset.direction;
  const base = JSON.parse(modal.dataset.baseRes);
  const targetRoomId = selectedIncludedRoomId;
  if (!targetRoomId) {
    $('includedErrMsg').textContent = 'Choisis une chambre ouverte.';
    return;
  }
  const serviceId = direction === 'massage'
    ? parseInt($('fIncludedMassage').value, 10)
    : base.service_id; // meme pack (Taziri/Royal) pour la partie hammam
  try {
    const res = await authFetch(`${API}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: targetRoomId,
        service_id: serviceId,
        date: base.date,
        hour: base.hour + 1,
        duration: 1,
        client_type: base.client_type,
        nb_personnes: base.nb_personnes,
        sexe: base.sexe,
        origine: base.origine,
        auberge: base.auberge,
        prix: null,
        note: `Inclus dans le pack ${modal.dataset.packName}`,
        staff_names: '',
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Impossible d\'ajouter la session incluse (creneau ou capacite indisponible).');
      return;
    }
    $('includedModal').classList.add('hidden');
    await loadReservations();
    renderCalendar();
  } catch (e) {
    alert('Erreur de connexion');
  }
}

async function deleteReservation() {
  if (!editingResId) return;
  if (!confirm('Supprimer cette reservation ?')) return;
  await authFetch(`${API}/api/reservations/${editingResId}`, { method: 'DELETE' });
  $('resForm').classList.add('hidden');
  editingResId = null;
  await loadReservations();
  renderCalendar();
  renderSlotList();
}

init();
$('closeXBtn').addEventListener('click', closeModal);
window.addEventListener('resize', () => { if (rooms.length) renderGrid(); });
