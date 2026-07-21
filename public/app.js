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
let ignoreNextClick = false;
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
  $('cancelMoveBtn').addEventListener('click', cancelMove);
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

  // Appui long (mobile) - appuyer n'importe ou sur la case (meme l'espace vide) pour deplacer
  let pressTimer = null;
  let pressStartX = 0, pressStartY = 0;
  let longPressFired = false;

  $('grid').addEventListener('touchstart', (e) => {
    const cell = e.target.closest('.res-cell');
    if (!cell) return;
    const touch = e.touches[0];
    pressStartX = touch.clientX;
    pressStartY = touch.clientY;
    longPressFired = false;
    pressTimer = setTimeout(() => {
      longPressFired = true;
      const entryEl = e.target.closest('[data-res-id]');
      let resId = entryEl ? parseInt(entryEl.dataset.resId, 10) : null;
      if (!resId) {
        const roomId = parseInt(cell.dataset.roomId, 10);
        const hour = parseInt(cell.dataset.hour, 10);
        const matches = reservations.filter((r) => r.room_id === roomId && r.hour === hour);
        if (matches.length === 1) resId = matches[0].id;
      }
      if (resId) {
        if (navigator.vibrate) navigator.vibrate(30);
        startMove(resId);
      }
    }, 450);
  }, { passive: true });

  $('grid').addEventListener('touchmove', (e) => {
    if (!pressTimer) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - pressStartX) > 10 || Math.abs(touch.clientY - pressStartY) > 10) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }, { passive: true });

  $('grid').addEventListener('touchend', (e) => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (longPressFired) {
      ignoreNextClick = true;
    }
  });

  $('grid').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.res-cell')) e.preventDefault();
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

function buildDaysHtml(gridStart, month, datesSet) {
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
    const hasRes = datesSet ? datesSet.has(ds) : false;
    let cls = 'cal-popup-day';
    if (isOtherMonth) cls += ' otherm';
    if (isSel) cls += ' selected';
    if (isToday) cls += ' today';
    html += '<div class="' + cls + '" data-date="' + ds + '">' + d.getDate() +
      (hasRes ? '<div class="pd-dot"></div>' : '<div style="height:5px;"></div>') +
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
      datesCache[cacheKey] = new Set(list);
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
      datesCache[cacheKey] = new Set(list.map((ds) => ds.slice(0, 7)));
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
  closeSidebar();
  if (view === 'caisse') {
    $('cashDayDate').value = currentDate;
    loadCashDay(currentDate);
  }
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

function renderCashDay() {
  const d = cashDayData;
  const wrap = $('cashDayBody');

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
          <div style="margin-bottom:4px;cursor:grab;" draggable="true" data-res-id="${res.id}">
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
      if (moveMode || copyMode) cell.classList.add('drop-target');
      cell.addEventListener('click', () => {
        if (ignoreNextClick) { ignoreNextClick = false; return; }
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
          <div style="font-size:12px;color:#6b7280;">${res.origine ? escapeHtml(res.origine) + ' - ' : ''}${res.carte_cadeaux ? 'Prix: carte cadeaux - ' : (res.prix !== null && res.prix !== undefined && res.prix !== '' ? (Number(res.prix) === 0 ? 'Gratuit - ' : res.prix + ' dh - ') : '')}${escapeHtml(res.client_type || '')}${res.auberge ? ' - ' + escapeHtml(res.auberge) : ''}${res.staff_names ? ' - ' + escapeHtml(res.staff_names) : ''}${res.taxi ? ' - 🚕' : ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button data-edit="${res.id}" style="padding:6px 10px;">Modifier</button>
          <button data-move="${res.id}" style="padding:6px 10px;">Deplacer</button>
          <button data-copy="${res.id}" style="padding:6px 10px;">Copier</button>
          ${(res.nb_personnes || 1) > 1 ? `<button data-split="${res.id}" style="padding:6px 10px;color:#7c3aed;">Diviser</button>` : ''}
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
  $('fStaff').value = existing ? existing.staff_names || '' : '';
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

init();
$('closeXBtn').addEventListener('click', closeModal);
window.addEventListener('resize', () => { if (rooms.length) renderGrid(); });
