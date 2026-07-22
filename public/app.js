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
let lastDragEndAt = 0;
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
  $('profileBtn').addEventListener('click', openProfileModal);
  $('profileCloseBtn').addEventListener('click', closeProfileModal);
  $('profileCancelBtn').addEventListener('click', closeProfileModal);
  $('profileSaveBtn').addEventListener('click', saveProfile);
  $('sidebarToggleBtn').addEventListener('click', toggleSidebar);
  $('sidebarOverlay').addEventListener('click', closeSidebar);
  document.querySelectorAll('.sidebar-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  $('fAubergeSearch').addEventListener('input', renderAubergesList);
  $('addAubergeBtn').addEventListener('click', addAuberge);
  $('fExtraSearch').addEventListener('input', renderExtrasList);
  $('addExtraBtn').addEventListener('click', addExtra);
  $('fStaffSearch').addEventListener('input', renderStaffSuggestions);
  document.querySelectorAll('.extras-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchExtrasTab(btn.dataset.etab));
  });
  $('fStatsMode').addEventListener('change', renderExtrasStats);
  $('fStatsMonth').addEventListener('change', renderExtrasStats);
  $('fStatsYear').addEventListener('change', renderExtrasStats);
  $('fStatsSearch').addEventListener('input', renderStatsRows);
  $('fCommissionAuberge').addEventListener('change', renderCommissionLedger);
  $('fCommissionSearch').addEventListener('input', () => fillCommissionSelect($('fCommissionSearch').value));
  document.querySelectorAll('.comm-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchCommTab(btn.dataset.ctab));
  });
  $('adminResetBtn').addEventListener('click', handleAdminReset);
  $('chkReservations').addEventListener('change', () => {
    $('scopeReservationsBox').style.display = $('chkReservations').checked ? 'block' : 'none';
    updateAdminSummary();
  });
  $('chkCaisse').addEventListener('change', () => {
    $('scopeCaisseBox').style.display = $('chkCaisse').checked ? 'block' : 'none';
    updateAdminSummary();
  });
  $('chkCommissions').addEventListener('change', updateAdminSummary);
  $('chkAuberges').addEventListener('change', updateAdminSummary);
  $('scopeReservations').addEventListener('change', () => { toggleScopeInputs('Reservations'); updateAdminSummary(); });
  $('scopeCaisse').addEventListener('change', () => { toggleScopeInputs('Caisse'); updateAdminSummary(); });
  ['scopeReservationsDay', 'scopeReservationsMonth', 'scopeReservationsYear'].forEach((id) => $(id).addEventListener('change', updateAdminSummary));
  ['scopeCaisseDay', 'scopeCaisseMonth', 'scopeCaisseYear'].forEach((id) => $(id).addEventListener('change', updateAdminSummary));
  $('cashDayDate').addEventListener('change', () => loadCashDay($('cashDayDate').value));
  $('cashDayPrevBtn').addEventListener('click', () => {
    const d = new Date($('cashDayDate').value + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    $('cashDayDate').value = fmtDate(d);
    loadCashDay(fmtDate(d));
  });
  $('cashDayNextBtn').addEventListener('click', () => {
    const d = new Date($('cashDayDate').value + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    $('cashDayDate').value = fmtDate(d);
    loadCashDay(fmtDate(d));
  });
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
  $('cancelCopyBtn').addEventListener('click', cancelCopy);
  $('includedAddBtn').addEventListener('click', confirmIncludedMassage);
  $('splitCloseBtn').addEventListener('click', closeSplitModal);
  $('splitCancelBtn').addEventListener('click', closeSplitModal);
  $('splitConfirmBtn').addEventListener('click', confirmSplit);
  $('fGratuit').addEventListener('change', () => {
    if ($('fGratuit').checked) {
      $('fCarteCadeaux').checked = false;
      $('fPrix').value = 0;
      $('fPrix').disabled = true;
    } else {
      $('fPrix').disabled = false;
    }
    updateLivePreview();
  });
  $('fCarteCadeaux').addEventListener('change', () => {
    if ($('fCarteCadeaux').checked) {
      $('fGratuit').checked = false;
      $('fPrix').value = 0;
      $('fPrix').disabled = true;
    } else {
      $('fPrix').disabled = false;
    }
    updateLivePreview();
  });

  // Glisser-deposer fluide (souris ET tactile, via Pointer Events) : on prend la
  // reservation directement dans la grille et on la depose sur la case cible.
  $('grid').addEventListener('pointerdown', onGridPointerDown);
  $('grid').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.res-cell')) e.preventDefault();
  });
}

// ---------- Deplacement par glisser-deposer fluide ----------
const DRAG_MOVE_THRESHOLD = 8; // px avant de considerer que c'est un glissement, pas un tap
const DRAG_PRESS_DELAY = 160; // ms d'appui avant d'engager le glissement (mobile)
let dragGhostEl = null;
let dragHoverCell = null;

function onGridPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const entry = e.target.closest('[data-res-id]');
  if (!entry) return;
  const resId = parseInt(entry.dataset.resId, 10);
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;

  const pressTimer = setTimeout(() => { dragging = true; beginDrag(entry, startX, startY); }, DRAG_PRESS_DELAY);

  function onMove(ev) {
    if (!dragging) {
      if (Math.abs(ev.clientX - startX) > DRAG_MOVE_THRESHOLD || Math.abs(ev.clientY - startY) > DRAG_MOVE_THRESHOLD) {
        clearTimeout(pressTimer);
        dragging = true;
        beginDrag(entry, startX, startY);
      } else {
        return;
      }
    }
    moveDragGhost(ev.clientX, ev.clientY);
    highlightDropTarget(ev.clientX, ev.clientY);
  }

  function onUp(ev) {
    clearTimeout(pressTimer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (dragging) {
      finishDrag(resId, ev.clientX, ev.clientY);
      lastDragEndAt = performance.now();
    }
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function beginDrag(entry, x, y) {
  if (navigator.vibrate) navigator.vibrate(20);
  entry.style.opacity = '0.35';
  const res = reservations.find((r) => r.id === parseInt(entry.dataset.resId, 10));
  const label = res ? (res.client_type || (services.find((s) => s.id === res.service_id) || {}).name || 'Reservation') : 'Reservation';
  dragGhostEl = document.createElement('div');
  dragGhostEl.className = 'drag-ghost';
  dragGhostEl.textContent = label;
  document.body.appendChild(dragGhostEl);
  moveDragGhost(x, y);
}

function moveDragGhost(x, y) {
  if (!dragGhostEl) return;
  dragGhostEl.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
}

function highlightDropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('.res-cell') : null;
  if (dragHoverCell && dragHoverCell !== cell) dragHoverCell.classList.remove('drag-hover');
  if (cell) cell.classList.add('drag-hover');
  dragHoverCell = cell;
}

function finishDrag(resId, x, y) {
  const entry = document.querySelector(`[data-res-id="${resId}"]`);
  if (entry) entry.style.opacity = '';
  if (dragGhostEl) { dragGhostEl.remove(); dragGhostEl = null; }
  if (dragHoverCell) { dragHoverCell.classList.remove('drag-hover'); }

  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('.res-cell') : null;
  dragHoverCell = null;
  if (!cell) return;

  const room = rooms.find((rm) => rm.id == cell.dataset.roomId);
  const hour = parseInt(cell.dataset.hour, 10);
  if (!room || Number.isNaN(hour)) return;

  moveReservationOptimistic(resId, room.id, hour);
}

// Deplace la reservation immediatement a l'ecran (aucune attente reseau), puis
// confirme en arriere-plan aupres du serveur ; annule et revient en place si refuse.
async function moveReservationOptimistic(resId, roomId, hour) {
  const res = reservations.find((r) => r.id === resId);
  if (!res) return;
  if (res.room_id === roomId && res.hour === hour) return;

  const previous = { room_id: res.room_id, hour: res.hour };
  res.room_id = roomId;
  res.hour = hour;
  renderGrid();

  try {
    const apiRes = await authFetch(`${API}/api/reservations/${resId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, hour, date: currentDate }),
    });
    if (!apiRes.ok) {
      const data = await apiRes.json();
      res.room_id = previous.room_id;
      res.hour = previous.hour;
      renderGrid();
      alert(data.error || 'Impossible de deplacer ce rendez-vous ici.');
    }
  } catch (e) {
    res.room_id = previous.room_id;
    res.hour = previous.hour;
    renderGrid();
    alert('Erreur de connexion. Le rendez-vous est revenu a sa place.');
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
  $('calPopupMonthBtn').textContent = popupMode === 'year'
    ? String(popupViewDate.getFullYear())
    : MOIS_FR[popupViewDate.getMonth()] + ' ' + popupViewDate.getFullYear();
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

const datesCache = {};

function buildDaysHtml(gridStart, month, datesCounts) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr2 = fmtDate(today);
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const ds = fmtDate(d);
    const isOtherMonth = d.getMonth() !== month;
    const isSel = ds === currentDate;
    const isToday = ds === todayStr2;
    const count = datesCounts ? (datesCounts.get(ds) || 0) : 0;
    let cls = 'cal-popup-day';
    if (isOtherMonth) cls += ' otherm';
    if (isSel) cls += ' selected';
    if (isToday) cls += ' today';
    html += '<div class="' + cls + '" data-date="' + ds + '">' + d.getDate() +
      (count > 0 ? '<div class="pd-count">' + count + '</div>' : '<div style="height:14px;"></div>') +
    '</div>';
  }
  return html;
}

function bindPopupDayClicks() {
  $('calPopupDays').querySelectorAll('.cal-popup-day').forEach((day) => {
    day.addEventListener('click', () => {
      selectDate(day.dataset.date);
      closeCalPopup();
    });
  });
}

function renderPopupMonthDays() {
  const year = popupViewDate.getFullYear(), month = popupViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - firstDay.getDay());
  const rangeStart = fmtDate(gridStart);
  const rangeEndDate = new Date(gridStart); rangeEndDate.setDate(gridStart.getDate() + 41);
  const rangeEnd = fmtDate(rangeEndDate);
  const cacheKey = rangeStart + '_' + rangeEnd;

  // Affichage immediat (avec le cache si deja connu, sinon sans les points pour l'instant)
  const el = $('calPopupDays');
  el.innerHTML = buildDaysHtml(gridStart, month, datesCache[cacheKey]);
  bindPopupDayClicks();

  if (datesCache[cacheKey]) return; // deja en cache, pas besoin de refaire la requete

  authFetch(`${API}/api/reservations-dates?start=${rangeStart}&end=${rangeEnd}`)
    .then((res) => res.json())
    .then((list) => {
      datesCache[cacheKey] = new Map(list.map((x) => [x.date, x.count]));
      // Ne mettre a jour que si on est toujours sur ce meme mois
      if (popupMode === 'month' && popupViewDate.getFullYear() === year && popupViewDate.getMonth() === month) {
        el.innerHTML = buildDaysHtml(gridStart, month, datesCache[cacheKey]);
        bindPopupDayClicks();
      }
    })
    .catch(() => {});
}

function buildYearHtml(year, monthsWithRes) {
  const curYear = new Date(currentDate + 'T00:00:00').getFullYear();
  let html = '';
  for (let m = 0; m < 12; m++) {
    const ym = year + '-' + String(m + 1).padStart(2, '0');
    const isSel = m === popupViewDate.getMonth() && year === curYear;
    html += '<div class="cal-popup-yearmonth' + (isSel ? ' selected' : '') + '" data-month="' + m + '">' +
      MOIS_FR[m] +
      (monthsWithRes && monthsWithRes.has(ym) ? '<div class="ym-dot"></div>' : '<div style="height:9px;"></div>') +
    '</div>';
  }
  return html;
}

function bindYearClicks(year) {
  $('calPopupYear').querySelectorAll('.cal-popup-yearmonth').forEach((div) => {
    div.addEventListener('click', () => {
      popupViewDate = new Date(year, parseInt(div.dataset.month, 10), 1);
      popupMode = 'month';
      renderCalPopup();
    });
  });
}

function renderPopupYear() {
  const year = popupViewDate.getFullYear();
  const cacheKey = 'year_' + year;
  const el = $('calPopupYear');
  el.innerHTML = buildYearHtml(year, datesCache[cacheKey]);
  bindYearClicks(year);

  if (datesCache[cacheKey]) return;

  authFetch(`${API}/api/reservations-dates?start=${year}-01-01&end=${year}-12-31`)
    .then((res) => res.json())
    .then((list) => {
      datesCache[cacheKey] = new Set(list.filter((x) => x.count > 0).map((x) => x.date.slice(0, 7)));
      if (popupMode === 'year' && popupViewDate.getFullYear() === year) {
        el.innerHTML = buildYearHtml(year, datesCache[cacheKey]);
        bindYearClicks(year);
      }
    })
    .catch(() => {});
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

// ---------- Mon profil ----------
function openProfileModal() {
  $('profileUsername').textContent = currentUser.username;
  $('fProfileUsername').value = currentUser.username;
  $('fProfileFullName').value = currentUser.full_name || '';
  $('fProfileCurrentPwd').value = '';
  $('fProfileNewPwd').value = '';
  $('fProfileConfirmPwd').value = '';
  $('profileErrMsg').textContent = '';
  $('profileOkMsg').textContent = '';
  $('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
  $('profileModal').classList.add('hidden');
}

async function saveProfile() {
  const username = $('fProfileUsername').value.trim();
  const fullName = $('fProfileFullName').value.trim();
  const currentPwd = $('fProfileCurrentPwd').value;
  const newPwd = $('fProfileNewPwd').value;
  const confirmPwd = $('fProfileConfirmPwd').value;
  $('profileErrMsg').textContent = '';
  $('profileOkMsg').textContent = '';

  if (!username) {
    $('profileErrMsg').textContent = 'Le nom d\'utilisateur ne peut pas etre vide.';
    return;
  }
  if (newPwd && newPwd !== confirmPwd) {
    $('profileErrMsg').textContent = 'Les deux nouveaux mots de passe ne correspondent pas.';
    return;
  }

  try {
    const res = await authFetch(`${API}/api/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        full_name: fullName,
        current_password: currentPwd || undefined,
        new_password: newPwd || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      $('profileErrMsg').textContent = data.error || 'Erreur.';
      return;
    }
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    $('userLabel').textContent = currentUser.full_name;
    $('profileUsername').textContent = currentUser.username;
    $('profileOkMsg').textContent = 'Profil mis a jour avec succes. Ton nom d\'utilisateur pour te connecter est : ' + currentUser.username;
    $('fProfileCurrentPwd').value = '';
    $('fProfileNewPwd').value = '';
    $('fProfileConfirmPwd').value = '';
  } catch (e) {
    $('profileErrMsg').textContent = 'Erreur de connexion.';
  }
}

// ---------- Sidebar / navigation ----------
function toggleSidebar() {
  $('sidebar').classList.toggle('open');
  $('sidebarOverlay').classList.toggle('show');
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('show');
}

function switchView(view) {
  document.querySelectorAll('.sidebar-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  $('viewReservations').style.display = view === 'reservations' ? 'block' : 'none';
  $('viewCaisse').style.display = view === 'caisse' ? 'block' : 'none';
  $('viewAuberges').style.display = view === 'auberges' ? 'block' : 'none';
  $('viewExtras').style.display = view === 'extras' ? 'block' : 'none';
  $('viewCommission').style.display = view === 'commission' ? 'block' : 'none';
  $('viewAdmin').style.display = view === 'admin' ? 'block' : 'none';
  $('viewPersonnaliser').style.display = view === 'personnaliser' ? 'block' : 'none';
  closeSidebar();
  if (view === 'caisse') {
    $('cashDayDate').value = currentDate;
    loadCashDay(currentDate);
  }
  if (view === 'auberges') {
    $('fAubergeSearch').value = '';
    loadAuberges();
  }
  if (view === 'extras') {
    switchExtrasTab('liste');
  }
  if (view === 'commission') {
    switchCommTab('solde');
  }
  if (view === 'reservations') {
    setTimeout(resizeGridWrapper, 0);
  }
  if (view === 'admin') {
    initAdminScopeControls();
  }
  if (view === 'personnaliser') {
    renderFieldOrderList();
  }
}

function switchCommTab(tab) {
  document.querySelectorAll('.comm-tab').forEach((el) => {
    const on = el.dataset.ctab === tab;
    el.classList.toggle('active', on);
    el.style.background = on ? '#5a3823' : '#e7ddcd';
    el.style.color = on ? '#fff' : '#7a6650';
  });
  $('commPanelSolde').style.display = tab === 'solde' ? 'block' : 'none';
  $('commPanelDetail').style.display = tab === 'detail' ? 'block' : 'none';
  if (tab === 'solde') renderSoldeGlobal();
  else loadAubergesForCommission();
}

// ---------- Calcul de caisse ----------
let cashDayData = null;

async function loadCashDay(date) {
  $('cashDayBody').innerHTML = '<p style="color:#6b7280;font-size:13px;">Chargement...</p>';
  try {
    const res = await authFetch(`${API}/api/cash-day?date=${date}`);
    const data = await res.json();
    if (!res.ok) {
      $('cashDayBody').innerHTML = '<p style="color:#dc2626;font-size:13px;">Erreur : ' + (data.error || 'inconnue') + '</p>';
      return;
    }
    cashDayData = data;
    renderCashDay();
  } catch (e) {
    $('cashDayBody').innerHTML = '<p style="color:#dc2626;font-size:13px;">Erreur de chargement : ' + e.message + '</p>';
  }
}

function fmtMoney(n) {
  return (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' dh';
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function renderCashDay() {
  const d = cashDayData;
  const wrap = $('cashDayBody');

  const resRows = d.reservationsList.length
    ? d.reservationsList.map((r) => `
      <div style="display:grid;grid-template-columns:36px 1fr auto;gap:6px;font-size:12.5px;padding:5px 0;border-bottom:1px solid #f3f4f6;align-items:center;">
        <span style="color:#6b7280;">${r.hour}H</span>
        <span>
          <b>${escapeHtml(r.room || '')}</b> - ${escapeHtml(r.service || 'Service')}${r.client ? ' - ' + escapeHtml(r.client) : ''}
          ${r.staff ? `<br><span style="color:#2563eb;">Extra: ${escapeHtml(r.staff)}</span>` : '<br><span style="color:#f59e0b;">⚠ pas d\'extra rempli</span>'}
          ${r.auberge ? `<br><span style="color:${r.sansCommission ? '#1f2937' : '#ea580c'};">${escapeHtml(r.auberge)}${r.sansCommission ? ' (sans commission)' : ''}</span>` : ''}
        </span>
        <span style="font-weight:700;color:${r.prix ? '#059669' : '#dc2626'};white-space:nowrap;">${r.prix !== null && r.prix !== undefined ? fmtMoney(parseFloat(r.prix)) : '⚠ prix vide'}</span>
      </div>`).join('')
    : '<p style="font-size:13px;color:#9ca3af;">Aucune reservation ce jour.</p>';

  const extraRows = d.extraList.length
    ? d.extraList.map((e) => `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:3px 0;"><span>${escapeHtml(e.name)}</span><span>${fmtMoney(e.amount)}</span></div>`).join('')
    : '<p style="font-size:13px;color:#9ca3af;">Aucun extra ce jour.</p>';

  const commRows = d.commissionList.length
    ? d.commissionList.map((c) => `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:3px 0;"><span>${escapeHtml(c.auberge)}</span><span>${fmtMoney(c.amount)}</span></div>`).join('')
    : '<p style="font-size:13px;color:#9ca3af;">Aucune commission ce jour.</p>';

  const chargeRows = d.charges.length
    ? d.charges.map((c) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13.5px;padding:3px 0;"><span>${escapeHtml(c.label)}</span><span style="display:flex;align-items:center;gap:8px;">${fmtMoney(parseFloat(c.amount))} <button data-charge-del="${c.id}" style="color:#dc2626;background:none;border:none;font-size:14px;padding:0;">✕</button></span></div>`).join('')
    : '<p style="font-size:13px;color:#9ca3af;">Aucune charge ajoutee.</p>';

  wrap.innerHTML = `
    <div style="background:#f9f6f0;border-radius:10px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;"><span>Caisse</span><span>${fmtMoney(d.caisse)}</span></div>
    </div>

    <details style="margin-bottom:14px;" open>
      <summary style="font-weight:700;font-size:13.5px;color:#5a3823;cursor:pointer;">Detail des reservations du jour (${d.reservationsList.length}) - a relire avant de fermer</summary>
      <div style="margin-top:6px;">${resRows}</div>
    </details>

    <div style="margin-bottom:14px;">
      <p style="font-weight:700;font-size:13.5px;color:#5a3823;margin-bottom:4px;">Extra - total ${fmtMoney(d.extraTotal)}</p>
      ${extraRows}
    </div>

    <div style="margin-bottom:14px;">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;">
        <input type="checkbox" id="fHananOff" style="width:auto;margin:0;" ${d.hananOff ? 'checked' : ''}>
        Hanan en repos aujourd'hui (ne touche rien)
      </label>
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:6px;"><span>Hanan</span><span id="hananAmount">${fmtMoney(d.hanan)}</span></div>
    </div>

    <div style="margin-bottom:14px;">
      <p style="font-weight:700;font-size:13.5px;color:#5a3823;margin-bottom:4px;">Commission auberges - total ${fmtMoney(d.commissionTotal)}</p>
      ${commRows}
    </div>

    <div style="margin-bottom:14px;">
      <p style="font-weight:700;font-size:13.5px;color:#5a3823;margin-bottom:4px;">Charges - total <span id="chargesTotalAmount">${fmtMoney(d.chargesTotal)}</span></p>
      <div id="chargesListWrap">${chargeRows}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input id="fChargeLabel" type="text" placeholder="Label" style="flex:2;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;">
        <input id="fChargeAmount" type="number" placeholder="Montant" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;">
        <button id="addChargeBtn" class="btn-secondary" style="padding:8px 12px;margin:0;">+</button>
      </div>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0;">

    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;margin-bottom:6px;"><span>Reste du jour</span><span id="resteAmount">${fmtMoney(d.reste)}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:17px;color:#5a3823;"><span>Total general</span><span id="totalGeneralAmount">${fmtMoney(d.cumulativeTotal)}</span></div>
  `;

  $('fHananOff').addEventListener('change', async () => {
    await authFetch(`${API}/api/cash-day/hanan-off`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: d.date, hanan_off: $('fHananOff').checked }),
    });
    updateChargesAndTotals(d.date);
  });

  $('addChargeBtn').addEventListener('click', async () => {
    const label = $('fChargeLabel').value.trim();
    const amount = parseFloat($('fChargeAmount').value);
    if (!label || isNaN(amount)) return;
    await authFetch(`${API}/api/cash-day/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: d.date, label, amount }),
    });
    $('fChargeLabel').value = '';
    $('fChargeAmount').value = '';
    updateChargesAndTotals(d.date);
  });

  bindChargeDeleteButtons(d.date);
}

function bindChargeDeleteButtons(date) {
  $('chargesListWrap').querySelectorAll('[data-charge-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await authFetch(`${API}/api/cash-day/charges/${btn.dataset.chargeDel}`, { method: 'DELETE' });
      updateChargesAndTotals(date);
    });
  });
}

// Mise a jour rapide (sans clignotement) apres ajout/suppression d'une charge ou toggle Hanan :
// on ne touche qu'aux zones concernees (Charges, Hanan, Reste, Total general), pas tout le panneau.
async function updateChargesAndTotals(date) {
  try {
    const res = await authFetch(`${API}/api/cash-day?date=${date}`);
    const data = await res.json();
    if (!res.ok) return;
    cashDayData = data;

    const chargeRows = data.charges.length
      ? data.charges.map((c) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13.5px;padding:3px 0;"><span>${escapeHtml(c.label)}</span><span style="display:flex;align-items:center;gap:8px;">${fmtMoney(parseFloat(c.amount))} <button data-charge-del="${c.id}" style="color:#dc2626;background:none;border:none;font-size:14px;padding:0;">✕</button></span></div>`).join('')
      : '<p style="font-size:13px;color:#9ca3af;">Aucune charge ajoutee.</p>';

    $('chargesListWrap').innerHTML = chargeRows;
    $('chargesTotalAmount').textContent = fmtMoney(data.chargesTotal);
    $('hananAmount').textContent = fmtMoney(data.hanan);
    $('resteAmount').textContent = fmtMoney(data.reste);
    $('totalGeneralAmount').textContent = fmtMoney(data.cumulativeTotal);
    bindChargeDeleteButtons(date);
  } catch (e) { /* ignore */ }
}

function showLogin() {
  $('loginScreen').classList.remove('hidden');
  $('mainScreen').classList.add('hidden');
}

function showMain() {
  $('loginScreen').classList.add('hidden');
  $('mainScreen').classList.remove('hidden');
  $('userLabel').textContent = currentUser.full_name;
  $('navAdmin').classList.toggle('hidden', !currentUser.is_admin);
  $('navPersonnaliser').classList.toggle('hidden', !currentUser.is_admin);
  renderCalendar();
  loadRoomsAndReservations();
  loadAuberges();
  loadExtras();
  loadFormOrder();
  loadSidebarOrder();
  initSidebarDrag();
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
  if (!bar) return;
  const sections = [...new Set(rooms.map((r) => r.section))];
  bar.innerHTML = '';
  const makeBtn = (label, value) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'white-space:nowrap;padding:8px 14px;border-radius:20px;border:1px solid #d1d5db;font-size:13px;font-weight:600;background:' + (selectedSection === value ? '#5a3823' : '#f3f4f6') + ';color:' + (selectedSection === value ? 'white' : '#374151') + ';';
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
  if (svc) $('fDuration').value = Math.max(1, Math.round(svc.duration_minutes / 60));
  if ($('fGratuit').checked || $('fCarteCadeaux').checked) {
    $('fPrix').value = 0;
    return;
  }
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
  }
}

async function loadReservations() {
  const date = currentDate;
  const res = await authFetch(`${API}/api/reservations?date=${date}`);
  reservations = await res.json();
  renderGrid();
  renderDayCount();
  // Le calendrier (popup mois/annee) garde en cache les dates qui ont des reservations
  // pour eviter de refaire la requete a chaque ouverture. Mais des reservations ont pu
  // etre ajoutees/supprimees (ici, via Zone Admin, etc.) : on vide ce cache pour que
  // les points rouges du calendrier soient toujours a jour la prochaine fois qu'il s'ouvre.
  Object.keys(datesCache).forEach((k) => delete datesCache[k]);
}

// Une reservation "incluse" (massage ou hammam offert dans un pack Taziri/Royal)
// ne compte jamais comme un client separe : c'est la suite du meme rituel.
function isIncludedSession(r) {
  return !!(r.note && r.note.indexOf('Inclus dans le pack') === 0);
}
function renderDayCount() {
  const n = reservations.filter((r) => !isIncludedSession(r)).length;
  $('dayCount').textContent = n ? `${n} reservation${n > 1 ? 's' : ''} ce jour` : '';
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
      const aUneReclamation = list.some((r2) => r2.reclamation);
      cell.className = 'res-cell' + (list.length ? ' filled' : '') + (estPlein ? ' full' : '') + (aUneAlerte ? ' alerte' : '') + (aUneReclamation ? ' reclamation' : '');
      if (list.length) {
        cell.innerHTML = list.map((res, idx) => {
          const svc = services.find((s) => s.id === res.service_id);
          const nb = res.nb_personnes || 1;
          const genreColor = res.sexe === 'femme' ? '#db2777' : (res.sexe === 'homme' ? '#2563eb' : '#374151');
          const separator = idx > 0 ? '<hr style="border:none;border-top:2px dashed #d1d5db;margin:6px 0;">' : '';
          const aubergeColor = res.sans_commission ? '#1f2937' : '#ea580c';
          return separator + `
          <div style="margin-bottom:4px;cursor:grab;" data-res-id="${res.id}">
            ${svc ? `<div style="font-weight:700;color:#7c3aed;">${escapeHtml(svc.name)}</div>` : ''}
            ${res.sexe ? `<div style="font-weight:800;color:${genreColor};">${nb} ${escapeHtml(res.sexe)}${nb > 1 ? 's' : ''}</div>` : ''}
            ${res.origine ? `<div class="res-detail">${escapeHtml(res.origine)}</div>` : ''}
            ${res.auberge ? `<div style="font-weight:700;color:${aubergeColor};">${escapeHtml(res.auberge)}</div>` : ''}
            ${res.auberge && res.sans_commission ? `<div style="font-weight:700;color:#7c3aed;">Sans commission</div>` : ''}
            <div class="res-client">${escapeHtml(res.client_type || '')}</div>
            ${res.carte_cadeaux ? '<div class="res-prix">Prix: carte cadeaux</div>' : (res.prix !== null && res.prix !== undefined && res.prix !== '' ? `<div class="res-prix">${Number(res.prix) === 0 ? 'Gratuit' : res.prix + ' dh'}</div>` : '')}
            ${res.remise && parseFloat(res.remise) > 0 ? `<div style="color:#7c3aed;font-size:10px;">Remise: ${res.remise} dh</div>` : ''}
            <div style="font-weight:800;color:#000;">${res.hour}H</div>
            ${res.staff_names ? `<div class="res-staff">${escapeHtml(res.staff_names)}</div>` : ''}
            ${res.taxi ? '<div>🚕 taxi</div>' : ''}
            ${res.note ? `<div style="font-weight:700;color:#dc2626;">${escapeHtml(res.note)}</div>` : ''}
            ${res.reclamation ? '<div style="font-weight:800;color:#dc2626;">⚠ RECLAMATION</div>' : ''}
          </div>`;
        }).join('');
      }
      cell.dataset.roomId = r.id;
      cell.dataset.hour = h;
      if (copyMode) cell.classList.add('drop-target');
      cell.addEventListener('click', () => {
        if (performance.now() - lastDragEndAt < 60) return;
        if (copyMode) {
          doPaste(r, h);
        } else {
          openSlot(r, h);
        }
      });
      row.appendChild(cell);
    });

    grid.appendChild(row);
  });

  resizeGridWrapper();
}

// Calcule et fixe la hauteur exacte (en pixels) du tableau de reservations,
// pour qu'il remplisse tout l'ecran sans trou en bas et que le sticky
// fonctionne correctement (Safari se comporte mal si la hauteur vient du
// flex-grow au lieu d'une valeur explicite).
function resizeGridWrapper() {
  const wrapper = $('gridWrapper');
  if (!wrapper || wrapper.offsetParent === null) return;
  const controlsBar = wrapper.parentElement.querySelector('#addHourBtn');
  const controlsHeight = controlsBar ? controlsBar.closest('div').offsetHeight : 0;
  const top = wrapper.getBoundingClientRect().top;
  const available = window.innerHeight - top - controlsHeight;
  wrapper.style.height = Math.max(240, Math.floor(available)) + 'px';
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
      const svc = services.find((s) => s.id === res.service_id);
      const genreColor = res.sexe === 'femme' ? '#db2777' : (res.sexe === 'homme' ? '#2563eb' : '#374151');
      const aubergeColor = res.sans_commission ? '#1f2937' : '#ea580c';
      const nb = res.nb_personnes || 1;
      return `
      <div class="slot-card" data-id="${res.id}">
        ${svc ? `<div style="font-weight:700;color:#7c3aed;">${escapeHtml(svc.name)}</div>` : ''}
        ${res.sexe ? `<div style="font-weight:800;color:${genreColor};">${nb} ${escapeHtml(res.sexe)}${nb > 1 ? 's' : ''}</div>` : ''}
        ${res.origine ? `<div style="color:#6b7280;">${escapeHtml(res.origine)}</div>` : ''}
        ${res.auberge ? `<div style="font-weight:700;color:${aubergeColor};">${escapeHtml(res.auberge)}${res.sans_commission ? ' - sans commission' : ''}</div>` : ''}
        ${res.client_type ? `<div style="font-weight:700;">${escapeHtml(res.client_type)}</div>` : ''}
        ${res.carte_cadeaux ? '<div style="color:#059669;font-weight:700;">Prix: carte cadeaux</div>' : (res.prix !== null && res.prix !== undefined && res.prix !== '' ? `<div style="color:#059669;font-weight:700;">${Number(res.prix) === 0 ? 'Gratuit' : res.prix + ' dh'}</div>` : '')}
        ${res.staff_names ? `<div style="color:#2563eb;">${escapeHtml(res.staff_names)}</div>` : ''}
        ${res.taxi ? '<div>🚕 taxi</div>' : ''}
        <div class="row">
          <button class="slot-btn-edit" data-edit="${res.id}">Modifier</button>
          <button class="slot-btn-copy" data-copy="${res.id}">Copier</button>
          ${nb > 1 ? `<button class="slot-btn-split" data-split="${res.id}">Diviser</button>` : ''}
          <button class="slot-btn-del" data-del="${res.id}">Suppr</button>
        </div>
      </div>
    `;
    }).join('');
    wrap.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.onclick = () => showForm(list.find((r) => r.id == btn.dataset.edit));
    });
    wrap.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = () => startCopy(list.find((r) => r.id == btn.dataset.copy));
    });
    wrap.querySelectorAll('[data-split]').forEach((btn) => {
      btn.onclick = () => openSplitModal(list.find((r) => r.id == btn.dataset.split));
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
  $('fCarteCadeaux').checked = existing ? !!existing.carte_cadeaux : false;
  $('fGratuit').checked = existing ? (existing.prix === 0 && !existing.carte_cadeaux) : false;
  $('fPrix').disabled = $('fGratuit').checked || $('fCarteCadeaux').checked;
  $('fPrix').value = existing ? existing.prix ?? '' : '';
  $('fRemise').value = existing ? existing.remise || '' : '';
  $('fDuration').value = existing ? existing.duration || 1 : 1;
  selectedStaff = existing && existing.staff_names
    ? existing.staff_names.split(/[,+\/]/).map((n) => n.trim()).filter(Boolean)
    : [];
  $('fStaffSearch').value = '';
  renderStaffChips();
  $('fNote').value = existing ? existing.note || '' : '';
  $('fAlerte').checked = existing ? !!existing.alerte : false;
  $('fReclamation').checked = existing ? !!existing.reclamation : false;
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
    carte_cadeaux: $('fCarteCadeaux').checked,
    prix: $('fPrix').value ? parseFloat($('fPrix').value) : null,
    remise: $('fRemise').value ? parseFloat($('fRemise').value) : 0,
    note: $('fNote').value.trim(),
    alerte: $('fAlerte').checked,
    reclamation: $('fReclamation').checked,
    staff_names: selectedStaff.join(', '),
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
    return `<div class="room-option" data-room-id="${r.id}" data-full="${full}" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #e5e7eb;border-left:3px solid transparent;border-radius:10px;margin-bottom:6px;cursor:${full ? 'not-allowed' : 'pointer'};opacity:${full ? '0.5' : '1'};">
      <span>${r.section} - ${r.name}</span>
      <span style="font-weight:800;color:${full ? '#dc2626' : '#16a34a'};">${full ? 'Ferme' : 'Ouvert'}</span>
    </div>`;
  }).join('');

  function markSelected(el) {
    wrap.querySelectorAll('.room-option').forEach((x) => {
      x.style.borderLeftColor = 'transparent';
      x.style.background = 'white';
    });
    el.style.borderLeftColor = '#5a3823';
    el.style.background = '#fff5f2';
  }

  wrap.querySelectorAll('.room-option').forEach((el) => {
    if (el.dataset.full === 'true') return;
    el.addEventListener('click', () => {
      selectedIncludedRoomId = parseInt(el.dataset.roomId, 10);
      markSelected(el);
    });
  });
  const firstOpen = candidateRooms.find((r) => !roomIsFull(r, hourReservations, nb));
  selectedIncludedRoomId = firstOpen ? firstOpen.id : null;
  if (firstOpen) {
    const firstEl = wrap.querySelector(`[data-room-id="${firstOpen.id}"]`);
    if (firstEl) markSelected(firstEl);
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

// ---------- Diviser un groupe ----------
let splitBaseRes = null;

function splitNamesList(res) {
  const raw = (res.client_type || res.staff_names || '').trim();
  const names = raw.split(/[+,\/]/).map((n) => n.trim()).filter(Boolean);
  return names.length ? names : ['Personne 1'];
}

function openSplitModal(res) {
  splitBaseRes = res;
  $('splitErrMsg').textContent = '';
  $('splitSub').textContent = `${res.nb_personnes} ${res.sexe || ''}(s) - ${res.client_type || ''}`;
  const names = splitNamesList(res);
  $('fSplitName').innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  $('fSplitService').innerHTML = services.map((s) => `<option value="${s.id}">${s.name} (${s.category})</option>`).join('');
  $('splitModal').classList.remove('hidden');
}

function closeSplitModal() {
  $('splitModal').classList.add('hidden');
  splitBaseRes = null;
}

async function confirmSplit() {
  const res = splitBaseRes;
  const chosenName = $('fSplitName').value;
  const newServiceId = parseInt($('fSplitService').value, 10);
  $('splitErrMsg').textContent = '';

  const remainingNb = (res.nb_personnes || 1) - 1;
  const names = splitNamesList(res).filter((n) => n !== chosenName);

  try {
    if (remainingNb <= 0) {
      await authFetch(`${API}/api/reservations/${res.id}`, { method: 'DELETE' });
    } else {
      const updateRes = await authFetch(`${API}/api/reservations/${res.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: res.room_id, service_id: res.service_id, date: res.date, hour: res.hour,
          duration: res.duration || 1, client_type: names.join('+'), nb_personnes: remainingNb,
          sexe: res.sexe, origine: res.origine, auberge: res.auberge, sans_commission: res.sans_commission,
          taxi: res.taxi, prix: res.prix, remise: res.remise, note: res.note, alerte: res.alerte,
          staff_names: res.staff_names, carte_cadeaux: res.carte_cadeaux,
        }),
      });
      if (!updateRes.ok) {
        const d = await updateRes.json();
        $('splitErrMsg').textContent = d.error || 'Erreur lors de la mise a jour du groupe.';
        return;
      }
    }

    const createRes = await authFetch(`${API}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: res.room_id, service_id: newServiceId, date: res.date, hour: res.hour,
        duration: 1, client_type: chosenName, nb_personnes: 1,
        sexe: res.sexe, origine: res.origine, auberge: res.auberge, sans_commission: res.sans_commission,
        taxi: false, prix: null, note: '', staff_names: '', carte_cadeaux: false,
      }),
    });
    if (!createRes.ok) {
      const d = await createRes.json();
      $('splitErrMsg').textContent = d.error || 'Erreur lors de la creation de la nouvelle reservation.';
      return;
    }
    const savedRes = await createRes.json().catch(() => null);

    closeSplitModal();
    await loadReservations();
    renderCalendar();
    renderSlotList();

    const svc = savedRes ? services.find((s) => s.id === savedRes.service_id) : null;
    if (svc && (svc.name === 'Taziri' || svc.name === 'Royal')) {
      const room = rooms.find((r) => r.id === res.room_id);
      if (room.section === 'HAMMAM') {
        offerIncludedSession(savedRes, svc, 'massage');
      } else {
        offerIncludedSession(savedRes, svc, 'hammam');
      }
    }
  } catch (e) {
    $('splitErrMsg').textContent = 'Erreur de connexion.';
  }
}

// ---------- Auberges ----------
let auberges = [];

async function loadAuberges() {
  try {
    const res = await authFetch(`${API}/api/auberges`);
    auberges = await res.json();
    refreshAubergesDatalist();
    renderAubergesList();
  } catch (e) { /* ignore */ }
}

function refreshAubergesDatalist() {
  $('aubergesDatalist').innerHTML = auberges.map((a) => `<option value="${escapeHtml(a.name)}">`).join('');
}

function renderAubergesList() {
  const search = $('fAubergeSearch').value.trim().toLowerCase();
  const filtered = search ? auberges.filter((a) => a.name.toLowerCase().includes(search)) : auberges;
  const wrap = $('aubergesList');
  wrap.innerHTML = filtered.length
    ? filtered.map((a) => `
      <div class="auberge-row" data-auberge-row="${a.id}" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;font-size:14px;">
        <span class="auberge-name-display">${escapeHtml(a.name)}</span>
        <div style="display:flex;gap:10px;">
          <button data-auberge-edit="${a.id}" style="color:#5a3823;background:none;border:none;font-size:14px;">✏️</button>
          <button data-auberge-del="${a.id}" style="color:#dc2626;background:none;border:none;font-size:15px;">✕</button>
        </div>
      </div>`).join('')
    : '<p style="font-size:13px;color:#9ca3af;">Aucune auberge trouvee.</p>';

  wrap.querySelectorAll('[data-auberge-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await authFetch(`${API}/api/auberges/${btn.dataset.aubergeDel}`, { method: 'DELETE' });
      loadAuberges();
    });
  });

  wrap.querySelectorAll('[data-auberge-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEditAuberge(btn.dataset.aubergeEdit));
  });
}

function startEditAuberge(id) {
  const auberge = auberges.find((a) => String(a.id) === String(id));
  if (!auberge) return;
  const row = document.querySelector(`[data-auberge-row="${id}"]`);
  row.innerHTML = `
    <input id="fEditAubergeName" type="text" value="${escapeHtml(auberge.name)}" style="flex:1;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;margin-right:8px;">
    <div style="display:flex;gap:8px;">
      <button id="saveEditAubergeBtn" style="color:#16a34a;background:none;border:none;font-size:14px;font-weight:700;">✓</button>
      <button id="cancelEditAubergeBtn" style="color:#6b7280;background:none;border:none;font-size:14px;">✕</button>
    </div>
  `;
  $('saveEditAubergeBtn').addEventListener('click', () => saveEditAuberge(id));
  $('cancelEditAubergeBtn').addEventListener('click', renderAubergesList);
  $('fEditAubergeName').focus();
}

async function saveEditAuberge(id) {
  const newName = $('fEditAubergeName').value.trim();
  if (!newName) return;
  const res = await authFetch(`${API}/api/auberges/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    const data = await res.json();
    alert(data.error || 'Erreur.');
    return;
  }
  loadAuberges();
}

async function addAuberge() {
  const name = $('fNewAuberge').value.trim();
  if (!name) return;
  const res = await authFetch(`${API}/api/auberges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json();
    alert(data.error || 'Erreur.');
    return;
  }
  $('fNewAuberge').value = '';
  loadAuberges();
}

// ---------- Extras (staff) : liste geree a la main + statistiques ----------
let extras = [];
let selectedStaff = [];

async function loadExtras() {
  try {
    const res = await authFetch(`${API}/api/extras`);
    extras = await res.json();
    renderStaffChips();
    if (!$('viewExtras').classList.contains('hidden') && $('viewExtras').style.display !== 'none') renderExtrasList();
  } catch (e) { /* ignore */ }
}

function renderStaffChips() {
  const selRow = $('staffSelectedRow');
  if (!selRow) return;
  const knownNames = extras.map((e) => e.name);
  const orphans = selectedStaff.filter((n) => !knownNames.includes(n));

  selRow.innerHTML = selectedStaff.length
    ? selectedStaff.map((name) => `<button type="button" class="staff-chip chip active" data-remove-staff="${escapeHtml(name)}">${escapeHtml(name)} ✕</button>`).join('')
    : '<p style="font-size:12.5px;color:#9ca3af;">Aucun extra choisi.</p>';
  selRow.querySelectorAll('[data-remove-staff]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const name = chip.dataset.removeStaff;
      const idx = selectedStaff.indexOf(name);
      if (idx >= 0) selectedStaff.splice(idx, 1);
      renderStaffChips();
    });
  });

  const existingNote = selRow.parentElement.querySelector('.orphan-staff-note');
  if (existingNote) existingNote.remove();
  if (orphans.length) {
    const note = document.createElement('p');
    note.className = 'orphan-staff-note';
    note.style.cssText = 'font-size:12px;color:#b45309;margin-top:2px;';
    note.textContent = `Deja enregistre mais pas dans la liste Extras : ${orphans.join(', ')} (ajoute-le dans Extras pour pouvoir le gerer)`;
    selRow.insertAdjacentElement('afterend', note);
  }

  renderStaffSuggestions();
}

function renderStaffSuggestions() {
  const box = $('staffSuggestions');
  if (!box) return;
  const q = ($('fStaffSearch').value || '').trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const matches = extras.filter((e) => e.name.toLowerCase().includes(q) && !selectedStaff.includes(e.name));
  box.innerHTML = matches.length
    ? matches.map((e) => `<button type="button" class="staff-chip chip" data-add-staff="${escapeHtml(e.name)}">+ ${escapeHtml(e.name)}</button>`).join('')
    : '<p style="font-size:12.5px;color:#9ca3af;">Aucun extra ne correspond.</p>';
  box.querySelectorAll('[data-add-staff]').forEach((chip) => {
    chip.addEventListener('click', () => {
      selectedStaff.push(chip.dataset.addStaff);
      $('fStaffSearch').value = '';
      renderStaffChips();
    });
  });
}

function renderExtrasList() {
  const search = $('fExtraSearch').value.trim().toLowerCase();
  const filtered = search ? extras.filter((e) => e.name.toLowerCase().includes(search)) : extras;
  const wrap = $('extrasList');
  wrap.innerHTML = filtered.length
    ? filtered.map((e) => `
      <div class="extra-row" data-extra-row="${e.id}" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;font-size:14px;">
        <span class="extra-name-display">${escapeHtml(e.name)}</span>
        <div style="display:flex;gap:10px;">
          <button data-extra-edit="${e.id}" style="color:#5a3823;background:none;border:none;font-size:14px;">✏️</button>
          <button data-extra-del="${e.id}" style="color:#dc2626;background:none;border:none;font-size:15px;">✕</button>
        </div>
      </div>`).join('')
    : '<p style="font-size:13px;color:#9ca3af;">Aucun extra trouve.</p>';

  wrap.querySelectorAll('[data-extra-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await authFetch(`${API}/api/extras/${btn.dataset.extraDel}`, { method: 'DELETE' });
      loadExtras();
    });
  });
  wrap.querySelectorAll('[data-extra-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEditExtra(btn.dataset.extraEdit));
  });
}

function startEditExtra(id) {
  const extra = extras.find((e) => String(e.id) === String(id));
  if (!extra) return;
  const row = document.querySelector(`[data-extra-row="${id}"]`);
  row.innerHTML = `
    <input id="fEditExtraName" type="text" value="${escapeHtml(extra.name)}" style="flex:1;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;margin-right:8px;">
    <div style="display:flex;gap:8px;">
      <button id="saveEditExtraBtn" style="color:#16a34a;background:none;border:none;font-size:14px;font-weight:700;">✓</button>
      <button id="cancelEditExtraBtn" style="color:#6b7280;background:none;border:none;font-size:14px;">✕</button>
    </div>
  `;
  $('saveEditExtraBtn').addEventListener('click', () => saveEditExtra(id));
  $('cancelEditExtraBtn').addEventListener('click', renderExtrasList);
  $('fEditExtraName').focus();
}

async function saveEditExtra(id) {
  const newName = $('fEditExtraName').value.trim();
  if (!newName) return;
  const res = await authFetch(`${API}/api/extras/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    const data = await res.json();
    alert(data.error || 'Erreur.');
    return;
  }
  loadExtras();
}

async function addExtra() {
  const name = $('fNewExtra').value.trim();
  if (!name) return;
  const res = await authFetch(`${API}/api/extras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json();
    alert(data.error || 'Erreur.');
    return;
  }
  $('fNewExtra').value = '';
  loadExtras();
}

function switchExtrasTab(tab) {
  document.querySelectorAll('.extras-tab').forEach((el) => {
    const on = el.dataset.etab === tab;
    el.classList.toggle('active', on);
    el.style.background = on ? '#5a3823' : '#e7ddcd';
    el.style.color = on ? '#fff' : '#7a6650';
  });
  $('extrasPanelListe').style.display = tab === 'liste' ? 'block' : 'none';
  $('extrasPanelStats').style.display = tab === 'stats' ? 'block' : 'none';
  if (tab === 'liste') { $('fExtraSearch').value = ''; loadExtras(); }
  if (tab === 'stats') initExtrasStats();
}

function initExtrasStats() {
  const now = new Date();
  const yearSel = $('fStatsYear');
  if (!yearSel.dataset.filled) {
    const years = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
    yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
    yearSel.dataset.filled = '1';
  }
  if (!$('fStatsMonth').value) {
    $('fStatsMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  renderExtrasStats();
}

let lastStatsData = null;
let lastStatsLabel = '';

async function renderExtrasStats() {
  const mode = $('fStatsMode').value;
  $('fStatsMonth').classList.toggle('hidden', mode !== 'month');
  $('fStatsYear').classList.toggle('hidden', mode !== 'year');

  let start; let end; let label;
  if (mode === 'month') {
    const [y, m] = $('fStatsMonth').value.split('-').map(Number);
    start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  } else {
    const y = parseInt($('fStatsYear').value, 10);
    start = `${y}-01-01`;
    end = `${y}-12-31`;
    label = String(y);
  }
  lastStatsLabel = label;

  const wrap = $('extrasStatsBody');
  wrap.innerHTML = '<p style="color:#6b7280;font-size:13px;">Chargement...</p>';
  try {
    const res = await authFetch(`${API}/api/extras/stats?start=${start}&end=${end}`);
    const data = await res.json();
    if (!res.ok) { wrap.innerHTML = `<p style="color:#dc2626;font-size:13px;">${data.error || 'Erreur'}</p>`; return; }
    lastStatsData = data;
    renderStatsRows();
  } catch (e) {
    wrap.innerHTML = '<p style="color:#dc2626;font-size:13px;">Erreur de chargement.</p>';
  }
}

function renderStatsRows() {
  if (!lastStatsData) return;
  const data = lastStatsData;
  const search = $('fStatsSearch').value.trim().toLowerCase();
  const filteredList = search ? data.list.filter((x) => x.name.toLowerCase().includes(search)) : data.list;
  const wrap = $('extrasStatsBody');

  const rows = filteredList.filter((x) => x.amount > 0).map((x) => {
    const dateRows = (x.dates || []).map((d) => `
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#6b7280;padding:2px 0;">
          <span>${fmtDateShort(d.date)}</span><span>${d.hours}h - ${fmtMoney(d.amount)}</span>
        </div>`).join('');
    return `
      <div style="padding:10px;border:1px solid #eee;border-radius:8px;margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;font-size:14px;">${escapeHtml(x.name)}</span>
          <span style="font-size:12.5px;color:#6b7280;">${x.hours}h</span>
          <span style="font-weight:800;color:#5a3823;">${fmtMoney(x.amount)}</span>
        </div>
        <div style="margin-top:6px;border-top:1px solid #f3f4f6;padding-top:4px;">${dateRows}</div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
      <div style="background:#f9f6f0;border-radius:10px;padding:12px;margin-bottom:14px;display:flex;justify-content:space-between;">
        <span style="font-weight:700;text-transform:capitalize;">${lastStatsLabel}</span>
        <span style="font-weight:800;color:#5a3823;">${fmtMoney(data.totalAmount)}</span>
      </div>
      ${rows || (search ? '<p style="font-size:13px;color:#9ca3af;">Aucun extra ne correspond a cette recherche.</p>' : '<p style="font-size:13px;color:#9ca3af;">Aucun gain sur cette periode.</p>')}
    `;
}


// ---------- Commission (releve Debit/Credit/Solde par auberge) ----------
async function loadAubergesForCommission() {
  try {
    const res = await authFetch(`${API}/api/auberges`);
    auberges = await res.json();
    fillCommissionSelect($('fCommissionSearch') ? $('fCommissionSearch').value : '');
  } catch (e) { /* ignore */ }
}

function fillCommissionSelect(filter) {
  const sel = $('fCommissionAuberge');
  const q = (filter || '').toLowerCase().trim();
  const matches = auberges.filter((a) => a.name.toLowerCase().includes(q));
  const current = sel.value;
  sel.innerHTML = matches.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
  if (matches.some((a) => String(a.id) === current)) sel.value = current;
  renderCommissionLedger();
}

async function renderCommissionLedger() {
  const sel = $('fCommissionAuberge');
  const wrap = $('commissionBody');
  if (!sel.value) {
    wrap.innerHTML = '<p style="font-size:13px;color:#9ca3af;">Ajoute d\'abord une auberge dans la section Auberges.</p>';
    return;
  }
  wrap.innerHTML = '<p style="color:#6b7280;font-size:13px;">Chargement...</p>';
  try {
    const res = await authFetch(`${API}/api/commission/${sel.value}`);
    const ledger = await res.json();
    if (!res.ok) {
      wrap.innerHTML = `<p style="color:#dc2626;font-size:13px;">${ledger.error || 'Erreur'}</p>`;
      return;
    }

    const GRID = 'display:grid;grid-template-columns:74px 1fr 48px 48px 66px 66px 74px 22px;gap:4px;align-items:center;';
    const inp = 'width:100%;border:1px solid transparent;background:transparent;border-radius:6px;padding:6px 5px;font-size:12px;font-family:inherit;';

    const rows = ledger.combined.map((r) => `
      <div class="commRow" data-id="${r.id}" style="${GRID}padding:2px 0;border-bottom:1px solid #f3f4f6;">
        <input class="commCell" data-f="date" value="${escapeHtml(r.date || '')}" placeholder="jj/mm" style="${inp}color:#6b7280;">
        <input class="commCell" data-f="pack" value="${escapeHtml(r.pack || '')}" placeholder="pack" style="${inp}color:#374151;">
        <input class="commCell" data-f="homme" type="number" min="0" value="${r.homme || 0}" style="${inp}color:#2563eb;font-weight:700;text-align:center;">
        <input class="commCell" data-f="femme" type="number" min="0" value="${r.femme || 0}" style="${inp}color:#db2777;font-weight:700;text-align:center;">
        <input class="commCell" data-f="debit" type="number" value="${r.debit || 0}" style="${inp}color:#b45309;font-weight:600;">
        <input class="commCell" data-f="credit" type="number" value="${r.credit || 0}" style="${inp}color:#16a34a;font-weight:600;">
        <span class="commSolde" style="font-weight:800;color:#5a3823;font-size:12px;padding-left:4px;">${fmtMoney(r.solde)}</span>
        <button data-entry-del="${r.id}" style="color:#dc2626;background:none;border:none;font-size:14px;cursor:pointer;">✕</button>
      </div>`).join('');

    wrap.innerHTML = `
      <div style="background:#f9f6f0;border-radius:10px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;gap:10px;">
        <div><div style="font-size:11px;color:#9ca3af;">Total du</div><div id="cTotDu" style="font-weight:700;color:#b45309;">${fmtMoney(ledger.totalDebit)}</div></div>
        <div><div style="font-size:11px;color:#9ca3af;">Total paye</div><div id="cTotPaye" style="font-weight:700;color:#16a34a;">${fmtMoney(ledger.totalCredit)}</div></div>
        <div><div style="font-size:11px;color:#9ca3af;">Solde restant</div><div id="cTotSolde" style="font-weight:800;color:#5a3823;">${fmtMoney(ledger.solde)}</div></div>
      </div>
      <div style="${GRID}font-size:10px;font-weight:700;color:#fff;background:#5a3823;border-radius:8px 8px 0 0;padding:9px 6px;text-transform:uppercase;letter-spacing:.3px;">
        <span>Date</span><span>Pack</span><span>H</span><span>F</span><span>Debit</span><span>Credit</span><span>Solde</span><span></span>
      </div>
      <div id="commRows" style="padding:0 6px;">${rows || '<p style="font-size:13px;color:#9ca3af;padding:8px 0;">Aucune ligne pour cette auberge. Clique « + Ajouter une ligne ».</p>'}</div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button id="addEntryBtn" class="btn-secondary" style="padding:9px 14px;margin:0;">+ Ajouter une ligne</button>
      </div>
      <p style="font-size:11.5px;color:#9c8f78;margin-top:10px;line-height:1.5;">Clique sur n'importe quelle case pour la modifier — c'est enregistre automatiquement. Le solde et les totaux se recalculent tout seuls.</p>
    `;

    const opening = ledger.opening || 0;
    function recompute() {
      let solde = opening, du = opening > 0 ? opening : 0, paye = opening < 0 ? -opening : 0;
      wrap.querySelectorAll('.commRow').forEach((row) => {
        const d = parseFloat(row.querySelector('[data-f="debit"]').value) || 0;
        const c = parseFloat(row.querySelector('[data-f="credit"]').value) || 0;
        solde += d - c; du += d; paye += c;
        row.querySelector('.commSolde').textContent = fmtMoney(solde);
      });
      $('cTotDu').textContent = fmtMoney(du);
      $('cTotPaye').textContent = fmtMoney(paye);
      $('cTotSolde').textContent = fmtMoney(du - paye);
    }

    wrap.querySelectorAll('.commCell').forEach((cell) => {
      cell.addEventListener('input', recompute);
      cell.addEventListener('change', async () => {
        const row = cell.closest('.commRow');
        const id = row.dataset.id;
        const f = cell.dataset.f;
        let val = cell.value;
        if (f === 'homme' || f === 'femme' || f === 'debit' || f === 'credit') val = parseFloat(val) || 0;
        try {
          await authFetch(`${API}/api/commission/entries/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [f]: val }),
          });
        } catch (e) { /* garde la valeur a l'ecran */ }
      });
    });

    wrap.querySelectorAll('[data-entry-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await authFetch(`${API}/api/commission/entries/${btn.dataset.entryDel}`, { method: 'DELETE' });
        renderCommissionLedger();
      });
    });

    $('addEntryBtn').addEventListener('click', async () => {
      await authFetch(`${API}/api/commission/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auberge_id: sel.value, date: currentDate, pack: '', homme: 0, femme: 0, debit: 0, credit: 0 }),
      });
      await renderCommissionLedger();
      const cells = wrap.querySelectorAll('.commRow:last-child .commCell');
      if (cells.length) cells[1].focus();
    });
  } catch (e) {
    wrap.innerHTML = '<p style="color:#dc2626;font-size:13px;">Erreur de chargement.</p>';
  }
}

// ---------- Solde global (tableau de bord : total auto a rendre aux auberges) ----------
async function renderSoldeGlobal() {
  const wrap = $('soldeBody');
  wrap.innerHTML = '<p style="color:#6b7280;font-size:13px;">Chargement...</p>';
  try {
    const res = await authFetch(`${API}/api/commission-global`);
    const d = await res.json();
    if (!res.ok) { wrap.innerHTML = `<p style="color:#dc2626;font-size:13px;">${d.error || 'Erreur'}</p>`; return; }

    const aubRows = d.auberges.map((a) => `
      <div class="soldeRow" data-id="${a.id}" data-name="${escapeHtml(a.name)}" data-bal="${a.balance}" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #f2ede4;">
        <span style="flex:1;font-weight:600;font-size:14px;color:#374151;">${escapeHtml(a.name)}</span>
        <span style="font-weight:800;color:#b45309;font-size:15px;white-space:nowrap;">${fmtMoney(a.balance)}</span>
        <button data-pay="${a.id}" style="padding:7px 11px;border:none;border-radius:9px;background:#efe7d9;color:#5a3823;font-weight:700;font-size:12px;cursor:pointer;">A pris son argent</button>
      </div>`).join('');

    wrap.innerHTML = `
      <div style="background:linear-gradient(135deg,#5a3823,#7a4a2c);color:#fff;border-radius:18px;padding:22px;margin-bottom:14px;box-shadow:0 10px 30px rgba(90,56,35,.25);">
        <div style="font-size:12.5px;color:#e8d5bf;text-transform:uppercase;letter-spacing:1px;">Total a rendre aux auberges</div>
        <div style="font-size:38px;font-weight:800;margin-top:4px;letter-spacing:-1px;">${fmtMoney(d.total)}</div>
        <div style="font-size:12.5px;color:#e0cbb0;margin-top:6px;">calcule automatiquement &middot; ${d.auberges.length} auberges</div>
      </div>

      <div style="background:#fff;border:2px solid #f0c893;border-radius:16px;padding:18px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div>
          <div style="font-size:12px;color:#a08a6a;text-transform:uppercase;letter-spacing:.5px;">Commissions du jour</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">ajoutées automatiquement aujourd'hui</div>
        </div>
        <div style="font-size:30px;font-weight:800;color:#b45309;white-space:nowrap;">${fmtMoney(d.todayTotal)}</div>
      </div>

      <p style="font-size:13px;font-weight:800;color:#5a3823;text-transform:uppercase;letter-spacing:.5px;margin:6px 2px 10px;">Les auberges a payer</p>
      <div style="background:#fff;border:1px solid #eee;border-radius:14px;overflow:hidden;">${aubRows || '<div style="padding:16px;color:#9ca3af;text-align:center;">Aucune auberge a payer.</div>'}</div>
      <p style="font-size:11.5px;color:#9c8f78;margin-top:12px;line-height:1.5;">Le total se calcule tout seul (somme des soldes de toutes les auberges). Quand une auberge prend son argent, clique sur sa ligne : le total baisse automatiquement.</p>
    `;

    wrap.querySelectorAll('[data-pay]').forEach((btn) => {
      btn.addEventListener('click', () => openSoldePayout(btn.closest('.soldeRow')));
    });
  } catch (e) {
    wrap.innerHTML = '<p style="color:#dc2626;font-size:13px;">Erreur de chargement.</p>';
  }
}

function openSoldePayout(row) {
  if (row.nextElementSibling && row.nextElementSibling.classList.contains('payBox')) return;
  const id = row.dataset.id;
  const bal = parseFloat(row.dataset.bal) || 0;
  const box = document.createElement('div');
  box.className = 'payBox';
  box.style.cssText = 'display:flex;gap:6px;align-items:center;padding:10px 14px;background:#faf6ef;border-bottom:1px solid #f2ede4;flex-wrap:wrap;';
  box.innerHTML = `
    <span style="font-size:13px;color:#7a6650;width:100%;">Montant retiré du solde :</span>
    <input type="number" class="payAmt" value="${Math.round(bal)}" style="padding:8px;border:1px solid #d9cbb2;border-radius:8px;font-size:14px;width:110px;">
    <button class="payCash" style="padding:8px 12px;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;background:#166534;color:#fff;">💵 A pris son argent</button>
    <button class="paySoins" style="padding:8px 12px;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;background:#7c3aed;color:#fff;">🧖 A payé pour ses clients</button>
    <button class="payCancel" style="padding:8px 12px;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;background:none;color:#9ca3af;">Annuler</button>`;
  row.insertAdjacentElement('afterend', box);
  box.querySelector('.payCancel').addEventListener('click', () => box.remove());
  const doPayout = async (motive) => {
    const amt = parseFloat(box.querySelector('.payAmt').value) || 0;
    if (amt <= 0) { box.remove(); return; }
    await authFetch(`${API}/api/commission/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auberge_id: id, date: currentDate, pack: motive, homme: 0, femme: 0, debit: 0, credit: amt }),
    });
    renderSoldeGlobal();
  };
  box.querySelector('.payCash').addEventListener('click', () => doPayout('A pris son argent'));
  box.querySelector('.paySoins').addEventListener('click', () => doPayout('Payé pour ses clients'));
}

// ---------- Zone Admin : effacer des donnees ----------
function fillYearSelect(sel) {
  if (sel.dataset.filled) return;
  const nowYear = parseDate(todayISODateOnly()).getFullYear();
  const years = [];
  for (let y = nowYear; y >= nowYear - 5; y--) years.push(y);
  sel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
  sel.dataset.filled = '1';
}
function todayISODateOnly() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }

function initAdminScopeControls() {
  fillYearSelect($('scopeReservationsYear'));
  fillYearSelect($('scopeCaisseYear'));
  const today = todayISODateOnly();
  if (!$('scopeReservationsDay').value) $('scopeReservationsDay').value = today;
  if (!$('scopeCaisseDay').value) $('scopeCaisseDay').value = today;
  const curMonth = today.slice(0, 7);
  if (!$('scopeReservationsMonth').value) $('scopeReservationsMonth').value = curMonth;
  if (!$('scopeCaisseMonth').value) $('scopeCaisseMonth').value = curMonth;
  updateAdminSummary();
}

function toggleScopeInputs(prefix) {
  const scope = $('scope' + prefix).value;
  $('scope' + prefix + 'Day').style.display = scope === 'day' ? 'block' : 'none';
  $('scope' + prefix + 'Month').style.display = scope === 'month' ? 'block' : 'none';
  $('scope' + prefix + 'Year').style.display = scope === 'year' ? 'block' : 'none';
}

function scopeLabel(prefix) {
  const scope = $('scope' + prefix).value;
  if (scope === 'day') return `du ${$('scope' + prefix + 'Day').value || '...'}`;
  if (scope === 'month') {
    const v = $('scope' + prefix + 'Month').value;
    if (!v) return 'du mois choisi';
    const [y, m] = v.split('-').map(Number);
    return `de ${new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
  }
  if (scope === 'year') return `de l'annee ${$('scope' + prefix + 'Year').value}`;
  return '(toutes dates confondues)';
}

function updateAdminSummary() {
  const parts = [];
  if ($('chkReservations').checked) parts.push(`les reservations ${scopeLabel('Reservations')}`);
  if ($('chkCaisse').checked) parts.push(`la caisse ${scopeLabel('Caisse')}`);
  if ($('chkCommissions').checked) parts.push('les commissions et soldes des auberges (tout)');
  if ($('chkAuberges').checked) parts.push('la liste des auberges (+ leurs commissions/soldes restants)');
  $('adminSummary').textContent = parts.length ? 'Tu vas effacer : ' + parts.join(' + ') : '';
}

function buildScopePayload(prefix) {
  const scope = $('scope' + prefix).value;
  const payload = { scope };
  if (scope === 'day') payload.date = $('scope' + prefix + 'Day').value;
  if (scope === 'month') payload.month = $('scope' + prefix + 'Month').value;
  if (scope === 'year') payload.year = $('scope' + prefix + 'Year').value;
  return payload;
}

async function handleAdminReset() {
  const reservations = $('chkReservations').checked;
  const caisse = $('chkCaisse').checked;
  const commissions = $('chkCommissions').checked;
  const auberges = $('chkAuberges').checked;
  const msg = $('adminResetMsg');

  if (!caisse && !reservations && !commissions && !auberges) {
    msg.style.color = '#b91c1c';
    msg.textContent = 'Coche au moins une case.';
    return;
  }
  if ($('fAdminConfirm').value.trim().toUpperCase() !== 'EFFACER') {
    msg.style.color = '#b91c1c';
    msg.textContent = 'Ecris EFFACER pour confirmer.';
    return;
  }

  const parts = [];
  if (reservations) parts.push(`les reservations ${scopeLabel('Reservations')}`);
  if (caisse) parts.push(`la caisse ${scopeLabel('Caisse')}`);
  if (commissions) parts.push('les commissions et soldes des auberges');
  if (auberges) parts.push('la liste des auberges elle-meme (et donc aussi leurs commissions/soldes restants)');
  if (!confirm(`Es-tu sur ? Ceci va effacer definitivement : ${parts.join(', ')}. Cette action est irreversible.`)) return;

  const payload = {
    reservations: reservations ? buildScopePayload('Reservations') : null,
    caisse: caisse ? buildScopePayload('Caisse') : null,
    commissions,
    auberges,
  };

  const btn = $('adminResetBtn');
  btn.disabled = true;
  btn.textContent = 'Effacement...';
  try {
    const res = await authFetch(`${API}/api/admin/reset-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.style.color = '#b91c1c';
      msg.textContent = data.error || 'Erreur lors de l\'effacement.';
    } else {
      msg.style.color = '#166534';
      msg.textContent = `Donnees effacees avec succes (${data.deletedCount ?? ''} ligne(s) supprimee(s) au total).`;
      $('chkCaisse').checked = false;
      $('chkReservations').checked = false;
      $('chkCommissions').checked = false;
      $('chkAuberges').checked = false;
      $('scopeReservationsBox').style.display = 'none';
      $('scopeCaisseBox').style.display = 'none';
      $('fAdminConfirm').value = '';
      updateAdminSummary();
      if (reservations) { await loadReservations(); }
    }
  } catch (e) {
    msg.style.color = '#b91c1c';
    msg.textContent = 'Erreur de connexion.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Effacer definitivement';
  }
}

// ---------- Ordre personnalise des champs du formulaire de reservation ----------
const DEFAULT_FORM_ORDER_CLIENT = [
  'service', 'client', 'chips', 'nbSexe', 'origine', 'auberge',
  'sansCommission', 'taxi', 'prix', 'gratuit', 'carteCadeaux', 'remise',
  'extras', 'note', 'alerte', 'reclamation',
];
const FIELD_LABELS = {
  service: 'Service (massage / hammam)',
  client: 'Nom du client',
  chips: 'Puces rapides (1 Homme, 2 Femmes...)',
  nbSexe: 'Nombre de personnes + Sexe',
  origine: 'Etranger ou arabe',
  auberge: 'Auberge',
  sansCommission: 'Sans commission',
  taxi: 'Taxi envoye',
  prix: 'Prix',
  gratuit: 'Gratuit',
  carteCadeaux: 'Carte cadeaux',
  remise: 'Remise',
  extras: 'Extras qui ont travaille',
  note: 'Note',
  alerte: 'Marquer en jaune (alerte)',
  reclamation: 'Reclamation',
};
let formOrder = DEFAULT_FORM_ORDER_CLIENT.slice();
let formHidden = [];

async function loadFormOrder() {
  try {
    const res = await authFetch(`${API}/api/form-order`);
    const data = await res.json();
    const validOrder = Array.isArray(data.order) ? data.order.filter((k) => DEFAULT_FORM_ORDER_CLIENT.includes(k)) : [];
    const validHidden = Array.isArray(data.hidden) ? data.hidden.filter((k) => DEFAULT_FORM_ORDER_CLIENT.includes(k)) : [];
    const covered = new Set([...validOrder, ...validHidden]);
    const missing = DEFAULT_FORM_ORDER_CLIENT.filter((k) => !covered.has(k));
    formOrder = [...validOrder, ...missing];
    formHidden = validHidden;
  } catch (e) {
    formOrder = DEFAULT_FORM_ORDER_CLIENT.slice();
    formHidden = [];
  }
  applyFieldOrder(formOrder, formHidden);
}

function applyFieldOrder(order, hidden) {
  const container = $('formFieldsContainer');
  if (!container) return;
  order.forEach((key) => {
    const el = container.querySelector(`[data-block="${key}"]`);
    if (el) { el.style.display = ''; container.appendChild(el); }
  });
  (hidden || []).forEach((key) => {
    const el = container.querySelector(`[data-block="${key}"]`);
    if (el) el.style.display = 'none';
  });
}

function renderFieldOrderList() {
  const wrap = $('fieldOrderList');
  wrap.innerHTML = formOrder.map((key, i) => `
    <div class="field-order-row">
      <span class="fo-label">${FIELD_LABELS[key] || key}</span>
      <div class="fo-arrows">
        <button data-move-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-move-down="${i}" ${i === formOrder.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="fo-hide" data-hide="${key}">✕</button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => moveField(parseInt(btn.dataset.moveUp, 10), -1));
  });
  wrap.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => moveField(parseInt(btn.dataset.moveDown, 10), 1));
  });
  wrap.querySelectorAll('[data-hide]').forEach((btn) => {
    btn.addEventListener('click', () => hideField(btn.dataset.hide));
  });
  renderFieldHiddenList();
}

function renderFieldHiddenList() {
  const wrap = $('fieldHiddenList');
  $('fieldHiddenSection').style.display = formHidden.length ? 'block' : 'none';
  wrap.innerHTML = formHidden.map((key) => `
    <div class="field-hidden-row">
      <span class="fo-label">${FIELD_LABELS[key] || key}</span>
      <button data-show="${key}">↩ Reafficher</button>
    </div>`).join('');
  wrap.querySelectorAll('[data-show]').forEach((btn) => {
    btn.addEventListener('click', () => showField(btn.dataset.show));
  });
}

function hideField(key) {
  const idx = formOrder.indexOf(key);
  if (idx >= 0) formOrder.splice(idx, 1);
  if (!formHidden.includes(key)) formHidden.push(key);
  renderFieldOrderList();
  $('fieldOrderMsg').textContent = '';
}

function showField(key) {
  const idx = formHidden.indexOf(key);
  if (idx >= 0) formHidden.splice(idx, 1);
  if (!formOrder.includes(key)) formOrder.push(key);
  renderFieldOrderList();
  $('fieldOrderMsg').textContent = '';
}

function moveField(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= formOrder.length) return;
  const tmp = formOrder[index];
  formOrder[index] = formOrder[newIndex];
  formOrder[newIndex] = tmp;
  renderFieldOrderList();
  $('fieldOrderMsg').textContent = '';
}

async function saveFieldOrder() {
  const msg = $('fieldOrderMsg');
  msg.style.color = '#6b7280';
  msg.textContent = 'Enregistrement...';
  try {
    const res = await authFetch(`${API}/api/form-order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: formOrder, hidden: formHidden }),
    });
    if (!res.ok) {
      const data = await res.json();
      msg.style.color = '#b91c1c';
      msg.textContent = data.error || 'Erreur lors de l\'enregistrement.';
      return;
    }
    applyFieldOrder(formOrder, formHidden);
    msg.style.color = '#166534';
    msg.textContent = 'Ordre enregistre. Le formulaire de reservation utilisera ce nouvel ordre.';
  } catch (e) {
    msg.style.color = '#b91c1c';
    msg.textContent = 'Erreur de connexion.';
  }
}
$('saveFieldOrderBtn').addEventListener('click', saveFieldOrder);

// ---------- Ordre personnalise des elements du menu lateral (glisser directement dans le menu) ----------
const DEFAULT_SIDEBAR_ORDER_CLIENT = ['reservations', 'caisse', 'auberges', 'extras', 'commission', 'admin', 'personnaliser'];
let sidebarOrder = DEFAULT_SIDEBAR_ORDER_CLIENT.slice();

async function loadSidebarOrder() {
  try {
    const res = await authFetch(`${API}/api/sidebar-order`);
    const data = await res.json();
    sidebarOrder = (data.order && data.order.length === DEFAULT_SIDEBAR_ORDER_CLIENT.length) ? data.order : DEFAULT_SIDEBAR_ORDER_CLIENT.slice();
  } catch (e) {
    sidebarOrder = DEFAULT_SIDEBAR_ORDER_CLIENT.slice();
  }
  applySidebarOrder(sidebarOrder);
}

function applySidebarOrder(order) {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  order.forEach((key) => {
    const el = nav.querySelector(`.sidebar-item[data-view="${key}"]`);
    if (el) nav.appendChild(el);
  });
}

async function saveSidebarOrder() {
  try {
    await authFetch(`${API}/api/sidebar-order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: sidebarOrder }),
    });
  } catch (e) { /* silencieux : l'ordre reste correct a l'ecran meme si la sauvegarde echoue */ }
}

function initSidebarDrag() {
  if (!currentUser || !currentUser.is_admin) return; // seul le patron peut reorganiser le menu
  document.querySelectorAll('.sidebar-item').forEach((btn) => {
    btn.addEventListener('pointerdown', onSidebarPointerDown);
  });
}

function onSidebarPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const btn = e.currentTarget;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;

  const pressTimer = setTimeout(() => { dragging = true; beginSidebarDrag(btn, startX, startY); }, DRAG_PRESS_DELAY);

  function onMove(ev) {
    if (!dragging) {
      if (Math.abs(ev.clientX - startX) > DRAG_MOVE_THRESHOLD || Math.abs(ev.clientY - startY) > DRAG_MOVE_THRESHOLD) {
        clearTimeout(pressTimer);
        dragging = true;
        beginSidebarDrag(btn, startX, startY);
      } else {
        return;
      }
    }
    moveDragGhost(ev.clientX, ev.clientY);
    reorderSidebarLive(btn, ev.clientY);
  }

  function onUp() {
    clearTimeout(pressTimer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (dragging) {
      finishSidebarDrag(btn);
      lastDragEndAt = performance.now();
    }
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function beginSidebarDrag(btn, x, y) {
  if (navigator.vibrate) navigator.vibrate(20);
  btn.classList.add('sidebar-dragging');
  dragGhostEl = document.createElement('div');
  dragGhostEl.className = 'drag-ghost';
  dragGhostEl.textContent = btn.textContent.trim();
  document.body.appendChild(dragGhostEl);
  moveDragGhost(x, y);
}

function reorderSidebarLive(btn, y) {
  const items = Array.from(document.querySelectorAll('.sidebar-item'));
  const others = items.filter((el) => el !== btn);
  let targetIndex = others.length;
  for (let i = 0; i < others.length; i++) {
    const rect = others[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) { targetIndex = i; break; }
  }
  const nav = btn.parentElement;
  const ref = others[targetIndex];
  if (ref) nav.insertBefore(btn, ref); else nav.appendChild(btn);
}

function finishSidebarDrag(btn) {
  btn.classList.remove('sidebar-dragging');
  if (dragGhostEl) { dragGhostEl.remove(); dragGhostEl = null; }
  sidebarOrder = Array.from(document.querySelectorAll('.sidebar-item')).map((el) => el.dataset.view);
  saveSidebarOrder();
}

init();
$('closeXBtn').addEventListener('click', closeModal);
window.addEventListener('resize', () => { if (rooms.length) renderGrid(); });
window.addEventListener('orientationchange', () => { setTimeout(resizeGridWrapper, 200); });
