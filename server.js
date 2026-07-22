require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-admin-key';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth middleware ----------
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifie' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expiree, reconnecte-toi' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Reserve au patron (compte administrateur)' });
  }
  next();
}

// ---------- Routes: Auth ----------
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Manque username/password' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = jwt.sign(
      { id: user.id, username: user.username, full_name: user.full_name, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, user: { username: user.username, full_name: user.full_name, is_admin: user.is_admin } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier son propre profil (nom complet et/ou mot de passe)
app.put('/api/auth/me', auth, async (req, res) => {
  const { username, full_name, current_password, new_password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    let passwordHash = user.password_hash;
    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ error: 'Mot de passe actuel requis pour le changer' });
      }
      const ok = await bcrypt.compare(current_password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      if (new_password.length < 6) {
        return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caracteres' });
      }
      passwordHash = await bcrypt.hash(new_password, 10);
    }

    const newFullName = full_name !== undefined && full_name !== '' ? full_name : user.full_name;
    const newUsername = username !== undefined && username.trim() !== '' ? username.trim() : user.username;

    try {
      await pool.query(
        'UPDATE users SET full_name=$1, username=$2, password_hash=$3 WHERE id=$4',
        [newFullName, newUsername, passwordHash, req.user.id]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Ce nom d\'utilisateur existe deja.' });
      throw e;
    }

    const token = jwt.sign(
      { id: user.id, username: newUsername, full_name: newFullName, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, user: { username: newUsername, full_name: newFullName, is_admin: user.is_admin } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Creer un compte staff - protege par ADMIN_KEY (pas besoin d'etre deja connecte)
app.post('/api/users', async (req, res) => {
  const { adminKey, username, password, full_name, is_admin } = req.body;
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Cle admin incorrecte' });
  if (!username || !password || !full_name) return res.status(400).json({ error: 'Champs manquants' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, full_name, is_admin) VALUES ($1,$2,$3,$4)',
      [username, hash, full_name, !!is_admin]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce username existe deja' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Routes: Rooms ----------
// ---------- Routes: Dates avec reservations (pour le calendrier) ----------
app.get('/api/reservations-dates', auth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start et end requis (YYYY-MM-DD)' });
  const { rows } = await pool.query(
    'SELECT DISTINCT date FROM reservations WHERE date BETWEEN $1 AND $2',
    [start, end]
  );
  res.json(rows.map((r) => (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date)));
});

app.get('/api/rooms', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM rooms WHERE active=true ORDER BY sort_order ASC, id ASC'
  );
  res.json(rows);
});

// ---------- Routes: Services (massages / hammams) ----------
app.get('/api/services', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM services ORDER BY category ASC, sort_order ASC');
  res.json(rows);
});

// ---------- Routes: Reservations ----------
app.get('/api/reservations', auth, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Parametre date manquant (YYYY-MM-DD)' });
  const { rows } = await pool.query(
    'SELECT * FROM reservations WHERE date=$1 ORDER BY hour ASC',
    [date]
  );
  res.json(rows);
});

// Cree/met a jour automatiquement la ligne de commission liee a une reservation.
// Appelee a chaque creation / modification / suppression de reservation.
async function syncReservationCommission(r) {
  if (!r) return;
  // On repart propre : on efface l'ancienne ligne auto de cette reservation
  await pool.query('DELETE FROM commission_entries WHERE reservation_id=$1', [r.id]);
  const aubName = (r.auberge || '').trim();
  if (!aubName || r.sans_commission || r.reclamation) return; // pas de commission

  // Trouver l'auberge par nom, ou la creer si elle n'existe pas encore
  let { rows: aubRows } = await pool.query(
    'SELECT id FROM auberges WHERE lower(trim(name))=lower(trim($1)) LIMIT 1', [aubName]
  );
  let aubergeId = aubRows[0] && aubRows[0].id;
  if (!aubergeId) {
    const ins = await pool.query(
      'INSERT INTO auberges (name, opening_balance) VALUES ($1,0) ON CONFLICT (name) DO NOTHING RETURNING id',
      [aubName]
    );
    if (ins.rows[0]) aubergeId = ins.rows[0].id;
    else {
      const again = await pool.query('SELECT id FROM auberges WHERE lower(trim(name))=lower(trim($1)) LIMIT 1', [aubName]);
      aubergeId = again.rows[0] && again.rows[0].id;
    }
  }
  if (!aubergeId) return;

  const nb = r.nb_personnes || 1;
  const isHomme = (r.sexe || '').toLowerCase().startsWith('h');
  const debit = nb * (nb >= 5 ? 100 : 50);
  let pack = 'Service';
  if (r.service_id) {
    const { rows: s } = await pool.query('SELECT name FROM services WHERE id=$1', [r.service_id]);
    if (s[0]) pack = s[0].name;
  }
  const { rows: posRows } = await pool.query(
    'SELECT COALESCE(MAX(position),0)+1 AS next FROM commission_entries WHERE auberge_id=$1', [aubergeId]
  );
  const date = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date;
  await pool.query(
    `INSERT INTO commission_entries (auberge_id, date, pack, homme, femme, debit, credit, source, reservation_id, position)
     VALUES ($1,$2,$3,$4,$5,$6,0,'reservation',$7,$8)`,
    [aubergeId, date, pack, isHomme ? nb : 0, isHomme ? 0 : nb, debit, r.id, posRows[0].next]
  );
}

app.post('/api/reservations', auth, async (req, res) => {
  const {
    room_id, service_id, date, hour, duration, client_type,
    nb_personnes, sexe, origine, auberge, sans_commission, remise, alerte, taxi, prix, note, staff_names, carte_cadeaux, reclamation,
  } = req.body;
  if (!room_id || !date || hour === undefined) {
    return res.status(400).json({ error: 'room_id, date et hour sont obligatoires' });
  }
  try {
    // Recuperer la chambre + les reservations deja presentes sur ce creneau
    const { rows: roomRows } = await pool.query('SELECT * FROM rooms WHERE id=$1', [room_id]);
    const room = roomRows[0];
    if (!room) return res.status(404).json({ error: 'Chambre introuvable' });

    const { rows: existing } = await pool.query(
      'SELECT * FROM reservations WHERE room_id=$1 AND date=$2 AND hour=$3',
      [room_id, date, hour]
    );

    // Regle 1 : non-mixite - un creneau ne peut pas melanger homme et femme (sauf si la chambre autorise le mixte)
    const existingSexes = new Set(existing.map((r) => r.sexe).filter(Boolean));
    if (!room.mixte_autorise && sexe && existingSexes.size > 0 && !existingSexes.has(sexe)) {
      return res.status(409).json({ error: `Ce creneau est deja reserve pour des ${[...existingSexes][0]}(s). Le spa ne mixe pas homme/femme dans la meme chambre.` });
    }
    if (room.sexe_restriction && sexe && sexe !== room.sexe_restriction) {
      return res.status(409).json({ error: `Cette chambre est reservee aux ${room.sexe_restriction}s.` });
    }

    // Regle 2 : capacite - si la chambre n'est pas flexible, on ne peut pas depasser capacity_base
    const nb = nb_personnes || 1;
    if (!room.capacity_flexible) {
      const dejaPris = existing.reduce((sum, r) => sum + (r.nb_personnes || 0), 0);
      if (dejaPris + nb > room.capacity_base) {
        return res.status(409).json({ error: `Capacite depassee (max ${room.capacity_base}, deja ${dejaPris} reserve(s) sur ce creneau).` });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO reservations
        (room_id, service_id, date, hour, duration, client_type, nb_personnes, sexe, origine, auberge, sans_commission, remise, alerte, taxi, prix, note, staff_names, carte_cadeaux, reclamation, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [room_id, service_id || null, date, hour, duration || 1, client_type, nb, sexe, origine, auberge || null, !!sans_commission, remise || 0, !!alerte, !!taxi, prix, note, staff_names, !!carte_cadeaux, !!reclamation, req.user.id]
    );
    await syncReservationCommission(rows[0]);
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/reservations/:id', auth, async (req, res) => {
  const { id } = req.params;
  const {
    client_type, service_id, nb_personnes, sexe, origine, auberge, sans_commission, remise, alerte, taxi, prix, note, staff_names, duration, carte_cadeaux, reclamation,
    room_id, hour, date,
  } = req.body;
  try {
    const { rows: currentRows } = await pool.query('SELECT * FROM reservations WHERE id=$1', [id]);
    const current = currentRows[0];
    if (!current) return res.status(404).json({ error: 'Reservation introuvable' });

    const targetRoomId = room_id !== undefined ? room_id : current.room_id;
    const targetHour = hour !== undefined ? hour : current.hour;
    const targetDate = date !== undefined ? date : current.date;
    const isMoving = (room_id !== undefined || hour !== undefined || date !== undefined);

    if (isMoving) {
      const { rows: roomRows } = await pool.query('SELECT * FROM rooms WHERE id=$1', [targetRoomId]);
      const room = roomRows[0];
      if (!room) return res.status(404).json({ error: 'Chambre introuvable' });

      const { rows: existing } = await pool.query(
        'SELECT * FROM reservations WHERE room_id=$1 AND date=$2 AND hour=$3 AND id<>$4',
        [targetRoomId, targetDate, targetHour, id]
      );

      const sexeToCheck = sexe !== undefined ? sexe : current.sexe;
      const existingSexes = new Set(existing.map((r) => r.sexe).filter(Boolean));
      if (!room.mixte_autorise && sexeToCheck && existingSexes.size > 0 && !existingSexes.has(sexeToCheck)) {
        return res.status(409).json({ error: `Cette case est deja reservee pour des ${[...existingSexes][0]}(s). Le spa ne mixe pas homme/femme.` });
      }
      if (room.sexe_restriction && sexeToCheck && sexeToCheck !== room.sexe_restriction) {
        return res.status(409).json({ error: `Cette chambre est reservee aux ${room.sexe_restriction}s.` });
      }
      const nbToCheck = nb_personnes !== undefined ? nb_personnes : current.nb_personnes;
      if (!room.capacity_flexible) {
        const dejaPris = existing.reduce((sum, r) => sum + (r.nb_personnes || 0), 0);
        if (dejaPris + (nbToCheck || 1) > room.capacity_base) {
          return res.status(409).json({ error: `Capacite depassee dans la chambre de destination (max ${room.capacity_base}).` });
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE reservations SET
        client_type=COALESCE($1, client_type),
        service_id=COALESCE($2, service_id),
        nb_personnes=COALESCE($3, nb_personnes),
        sexe=COALESCE($4, sexe),
        origine=COALESCE($5, origine),
        auberge=COALESCE($6, auberge),
        taxi=COALESCE($7, taxi),
        prix=COALESCE($8, prix),
        note=COALESCE($9, note),
        staff_names=COALESCE($10, staff_names),
        duration=COALESCE($11, duration),
        sans_commission=COALESCE($12, sans_commission),
        remise=COALESCE($13, remise),
        alerte=COALESCE($14, alerte),
        carte_cadeaux=COALESCE($15, carte_cadeaux),
        reclamation=COALESCE($16, reclamation),
        room_id=$17, hour=$18, date=$19,
        updated_at=NOW()
       WHERE id=$20 RETURNING *`,
      [client_type, service_id, nb_personnes, sexe, origine, auberge, taxi, prix, note, staff_names, duration,
        sans_commission, remise, alerte, carte_cadeaux, reclamation, targetRoomId, targetHour, targetDate, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Reservation introuvable' });
    await syncReservationCommission(rows[0]);
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/reservations/:id', auth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM commission_entries WHERE reservation_id=$1', [id]);
  await pool.query('DELETE FROM reservations WHERE id=$1', [id]);
  res.json({ ok: true });
});

// ---------- Comptabilite : calcul de caisse ----------
function splitStaffNames(str) {
  if (!str) return [];
  return str.split(/[+,\/]/).map((n) => n.trim()).filter(Boolean);
}

async function computeDayCash(dateStr) {
  const { rows } = await pool.query(
    `SELECT r.*, s.name AS service_name, rm.name AS room_name
     FROM reservations r
     LEFT JOIN services s ON s.id = r.service_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.date=$1 ORDER BY r.hour ASC`,
    [dateStr]
  );
  const active = rows.filter((r) => !r.reclamation);

  const caisse = active.reduce((s, r) => s + (parseFloat(r.prix) || 0), 0);

  const extraMap = {};
  active.forEach((r) => {
    const names = splitStaffNames(r.staff_names);
    if (!names.length) return;
    const hours = parseFloat(r.duration) || 1;
    names.forEach((name) => {
      extraMap[name] = (extraMap[name] || 0) + hours * 100;
    });
  });
  const extraList = Object.entries(extraMap).map(([name, amount]) => ({ name, amount }));
  const extraTotal = extraList.reduce((s, e) => s + e.amount, 0);

  const commMap = {};
  const commDisplayName = {};
  active.forEach((r) => {
    if (!r.auberge || r.sans_commission) return;
    const nb = r.nb_personnes || 1;
    const amt = nb * (nb >= 5 ? 100 : 50);
    const key = r.auberge.trim().toLowerCase();
    if (!key) return;
    commMap[key] = (commMap[key] || 0) + amt;
    if (!commDisplayName[key]) commDisplayName[key] = r.auberge.trim();
  });
  const commissionList = Object.entries(commMap).map(([key, amount]) => ({ auberge: commDisplayName[key], amount }));
  const commissionTotal = commissionList.reduce((s, c) => s + c.amount, 0);

  const { rows: settingsRows } = await pool.query('SELECT * FROM day_settings WHERE date=$1', [dateStr]);
  const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay(); // 0=dim ... 4=jeu
  const defaultOff = dayOfWeek === 4;
  const hananOff = settingsRows[0] ? settingsRows[0].hanan_off : defaultOff;
  const maxExtra = extraList.length ? Math.max(...extraList.map((e) => e.amount)) : 0;
  const hanan = hananOff ? 0 : (maxExtra > 0 ? maxExtra + 100 : 0);

  const { rows: chargeRows } = await pool.query('SELECT * FROM daily_charges WHERE date=$1 ORDER BY id', [dateStr]);
  const chargesTotal = chargeRows.reduce((s, c) => s + parseFloat(c.amount), 0);

  const reservationsList = active.map((r) => ({
    id: r.id, hour: r.hour, room: r.room_name, service: r.service_name,
    client: r.client_type, staff: r.staff_names, prix: r.prix,
    auberge: r.auberge, sansCommission: r.sans_commission,
  }));

  const reste = caisse - extraTotal - hanan - chargesTotal - commissionTotal;

  return {
    date: dateStr, caisse, extraTotal, extraList, hanan, hananOff,
    commissionTotal, commissionList, charges: chargeRows, chargesTotal,
    reservationsList, reste,
  };
}

app.get('/api/cash-day', auth, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  try {
    const day = await computeDayCash(date);

    const { rows: dateRows } = await pool.query(
      `SELECT date::text FROM reservations WHERE date <= $1
       UNION SELECT date::text FROM daily_charges WHERE date <= $1
       ORDER BY date ASC`,
      [date]
    );
    const allDates = [...new Set(dateRows.map((r) => r.date))];
    if (!allDates.includes(date)) allDates.push(date);
    allDates.sort();

    let cumulativeTotal = 0;
    for (const d of allDates) {
      const dd = d === date ? day : await computeDayCash(d);
      cumulativeTotal += dd.reste;
    }

    res.json({ ...day, cumulativeTotal });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

app.post('/api/cash-day/charges', auth, async (req, res) => {
  const { date, label, amount } = req.body;
  if (!date || !label || amount === undefined) {
    return res.status(400).json({ error: 'date, label et amount sont obligatoires' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO daily_charges (date, label, amount) VALUES ($1,$2,$3) RETURNING *',
      [date, label, amount]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/cash-day/charges/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM daily_charges WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/cash-day/hanan-off', auth, async (req, res) => {
  const { date, hanan_off } = req.body;
  if (!date) return res.status(400).json({ error: 'date requise' });
  try {
    await pool.query(
      `INSERT INTO day_settings (date, hanan_off) VALUES ($1,$2)
       ON CONFLICT (date) DO UPDATE SET hanan_off=$2`,
      [date, !!hanan_off]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Auberges ----------
app.get('/api/auberges', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM auberges ORDER BY name ASC');
  res.json(rows);
});

app.post('/api/auberges', auth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO auberges (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Cette auberge existe deja.' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/auberges/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM auberges WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.put('/api/auberges/:id', auth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  try {
    const { rows } = await pool.query(
      'UPDATE auberges SET name=$1 WHERE id=$2 RETURNING *',
      [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Auberge introuvable' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce nom existe deja.' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Extras (staff) : liste geree a la main par le patron ----------
app.get('/api/extras', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM extras ORDER BY name ASC');
  res.json(rows);
});

app.post('/api/extras', auth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  try {
    const { rows } = await pool.query('INSERT INTO extras (name) VALUES ($1) RETURNING *', [name.trim()]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Cet extra existe deja.' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/extras/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM extras WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.put('/api/extras/:id', auth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  try {
    const { rows } = await pool.query('UPDATE extras SET name=$1 WHERE id=$2 RETURNING *', [name.trim(), req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Extra introuvable' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce nom existe deja.' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques : combien chaque extra a gagne sur une periode (mois ou annee au choix)
app.get('/api/extras/stats', auth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start et end requis (YYYY-MM-DD)' });
  try {
    const { rows: extrasList } = await pool.query('SELECT * FROM extras ORDER BY name ASC');
    const { rows: resRows } = await pool.query(
      `SELECT date, staff_names, duration FROM reservations
       WHERE date >= $1 AND date <= $2 AND reclamation=false AND staff_names IS NOT NULL AND staff_names <> ''
       ORDER BY date ASC`,
      [start, end]
    );
    const totals = {};
    extrasList.forEach((e) => { totals[e.name.toLowerCase()] = { name: e.name, hours: 0, amount: 0, dates: [] }; });
    resRows.forEach((r) => {
      const names = (r.staff_names || '').split(/[,+\/]/).map((n) => n.trim()).filter(Boolean);
      const hours = parseFloat(r.duration) || 1;
      const dateStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date;
      names.forEach((name) => {
        const key = name.toLowerCase();
        if (!totals[key]) totals[key] = { name, hours: 0, amount: 0, dates: [] }; // nom pas (encore) dans la liste geree
        totals[key].hours += hours;
        totals[key].amount += hours * 100;
        totals[key].dates.push({ date: dateStr, hours, amount: hours * 100 });
      });
    });
    const list = Object.values(totals).sort((a, b) => b.amount - a.amount);
    const totalAmount = list.reduce((s, x) => s + x.amount, 0);
    res.json({ start, end, list, totalAmount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

// ---------- Ordre personnalise des champs du formulaire de reservation ----------
const DEFAULT_FORM_ORDER = [
  'service', 'client', 'chips', 'nbSexe', 'origine', 'auberge',
  'sansCommission', 'taxi', 'prix', 'gratuit', 'carteCadeaux', 'remise',
  'extras', 'note', 'alerte', 'reclamation',
];

app.get('/api/form-order', auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='reservation_form_order'");
    const saved = rows[0] ? JSON.parse(rows[0].value) : null;
    const order = (saved && Array.isArray(saved.order)) ? saved.order : DEFAULT_FORM_ORDER;
    const hidden = (saved && Array.isArray(saved.hidden)) ? saved.hidden : [];
    res.json({ order, hidden });
  } catch (e) {
    res.json({ order: DEFAULT_FORM_ORDER, hidden: [] });
  }
});

app.put('/api/form-order', auth, requireAdmin, async (req, res) => {
  const { order, hidden } = req.body;
  const hiddenArr = Array.isArray(hidden) ? hidden : [];
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Ordre invalide' });
  }
  const combined = [...order, ...hiddenArr].slice().sort();
  const expected = DEFAULT_FORM_ORDER.slice().sort();
  if (JSON.stringify(combined) !== JSON.stringify(expected)) {
    return res.status(400).json({ error: 'Ordre invalide (champs manquants ou en double)' });
  }
  try {
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ('reservation_form_order',$1) ON CONFLICT (key) DO UPDATE SET value=$1",
      [JSON.stringify({ order, hidden: hiddenArr })]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


const toISO = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

function entryOut(e) {
  return {
    id: e.id,
    date: toISO(e.date) || '',
    pack: e.pack || '',
    homme: e.homme || 0,
    femme: e.femme || 0,
    debit: parseFloat(e.debit) || 0,
    credit: parseFloat(e.credit) || 0,
    source: e.source || 'manual',
  };
}

// GET : renvoie toutes les lignes d'une auberge + solde cumule + totaux
app.get('/api/commission/:aubergeId', auth, async (req, res) => {
  const { aubergeId } = req.params;
  try {
    const { rows: aubergeRows } = await pool.query('SELECT * FROM auberges WHERE id=$1', [aubergeId]);
    const auberge = aubergeRows[0];
    if (!auberge) return res.status(404).json({ error: 'Auberge introuvable' });

    const { rows: entries } = await pool.query(
      'SELECT * FROM commission_entries WHERE auberge_id=$1 ORDER BY position ASC, date ASC, id ASC',
      [aubergeId]
    );

    const opening = parseFloat(auberge.opening_balance) || 0;
    let solde = opening;
    const combined = entries.map((e) => {
      const row = entryOut(e);
      solde += row.debit - row.credit;
      row.solde = solde;
      return row;
    });

    const totalDebit = combined.reduce((s, r) => s + r.debit, 0) + (opening > 0 ? opening : 0);
    const totalCredit = combined.reduce((s, r) => s + r.credit, 0) + (opening < 0 ? -opening : 0);

    res.json({ auberge, opening, combined, totalDebit, totalCredit, solde });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

// POST : ajoute une ligne manuelle
app.post('/api/commission/entries', auth, async (req, res) => {
  const { auberge_id, date, pack, homme, femme, debit, credit } = req.body;
  if (!auberge_id) return res.status(400).json({ error: 'auberge_id obligatoire' });
  try {
    const { rows: posRows } = await pool.query(
      'SELECT COALESCE(MAX(position),0)+1 AS next FROM commission_entries WHERE auberge_id=$1',
      [auberge_id]
    );
    const { rows } = await pool.query(
      `INSERT INTO commission_entries (auberge_id, date, pack, homme, femme, debit, credit, source, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8) RETURNING *`,
      [auberge_id, date || null, pack || '', homme || 0, femme || 0, debit || 0, credit || 0, posRows[0].next]
    );
    res.json(entryOut(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT : modifie n'importe quel champ d'une ligne
app.put('/api/commission/entries/:id', auth, async (req, res) => {
  const { date, pack, homme, femme, debit, credit } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE commission_entries SET
         date=COALESCE($1,date), pack=COALESCE($2,pack),
         homme=COALESCE($3,homme), femme=COALESCE($4,femme),
         debit=COALESCE($5,debit), credit=COALESCE($6,credit)
       WHERE id=$7 RETURNING *`,
      [
        date !== undefined ? (date || null) : null,
        pack !== undefined ? pack : null,
        homme !== undefined ? homme : null,
        femme !== undefined ? femme : null,
        debit !== undefined ? debit : null,
        credit !== undefined ? credit : null,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ligne introuvable' });
    res.json(entryOut(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE : supprime une ligne
app.delete('/api/commission/entries/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM commission_entries WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// POST import : cree des lignes automatiquement depuis les reservations pas encore importees
app.post('/api/commission/:aubergeId/import', auth, async (req, res) => {
  const { aubergeId } = req.params;
  try {
    const { rows: aubergeRows } = await pool.query('SELECT * FROM auberges WHERE id=$1', [aubergeId]);
    const auberge = aubergeRows[0];
    if (!auberge) return res.status(404).json({ error: 'Auberge introuvable' });

    const { rows: resRows } = await pool.query(
      `SELECT r.id, r.date, r.nb_personnes, s.name AS service_name, r.sexe
       FROM reservations r
       LEFT JOIN services s ON s.id = r.service_id
       WHERE r.reclamation=false AND r.sans_commission=false
         AND lower(trim(r.auberge)) = lower(trim($1))
         AND r.id NOT IN (
           SELECT reservation_id FROM commission_entries
           WHERE auberge_id=$2 AND reservation_id IS NOT NULL
         )
       ORDER BY r.date ASC`,
      [auberge.name, aubergeId]
    );

    const { rows: posRows } = await pool.query(
      'SELECT COALESCE(MAX(position),0) AS max FROM commission_entries WHERE auberge_id=$1',
      [aubergeId]
    );
    let pos = posRows[0].max;
    let added = 0;
    for (const r of resRows) {
      const nb = r.nb_personnes || 1;
      const isHomme = (r.sexe || '').toLowerCase().startsWith('h');
      const debit = nb * (nb >= 5 ? 100 : 50);
      pos += 1;
      await pool.query(
        `INSERT INTO commission_entries (auberge_id, date, pack, homme, femme, debit, credit, source, reservation_id, position)
         VALUES ($1,$2,$3,$4,$5,$6,0,'reservation',$7,$8)`,
        [aubergeId, toISO(r.date), r.service_name || 'Service', isHomme ? nb : 0, isHomme ? 0 : nb, debit, r.id, pos]
      );
      added += 1;
    }
    res.json({ ok: true, added });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

// GET tableau de bord global : total a rendre = somme auto des soldes de toutes les auberges
app.get('/api/commission-global', auth, async (req, res) => {
  try {
    const { rows: aubs } = await pool.query('SELECT id, name, opening_balance FROM auberges ORDER BY name ASC');
    const { rows: sums } = await pool.query(
      'SELECT auberge_id, COALESCE(SUM(debit-credit),0) AS bal FROM commission_entries GROUP BY auberge_id'
    );
    const balMap = {};
    sums.forEach((s) => { balMap[s.auberge_id] = parseFloat(s.bal) || 0; });

    const list = aubs
      .map((a) => ({ id: a.id, name: a.name, balance: (parseFloat(a.opening_balance) || 0) + (balMap[a.id] || 0) }))
      .filter((x) => Math.abs(x.balance) > 0.5)
      .sort((a, b) => b.balance - a.balance);
    const total = list.reduce((s, x) => s + x.balance, 0);

    const { rows: todayRows } = await pool.query(
      "SELECT COALESCE(SUM(debit),0) AS t FROM commission_entries WHERE date=CURRENT_DATE"
    );
    const todayTotal = parseFloat(todayRows[0].t) || 0;

    // Historique jour par jour des commissions accumulees (debits), du plus recent au plus ancien
    const { rows: dailyRows } = await pool.query(
      `SELECT date, COALESCE(SUM(debit),0) AS total
       FROM commission_entries
       WHERE debit > 0 AND date IS NOT NULL
       GROUP BY date ORDER BY date DESC LIMIT 30`
    );
    const dailyHistory = dailyRows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      total: parseFloat(r.total) || 0,
    }));

    const { rows: hist } = await pool.query(
      `SELECT ce.date, ce.credit, ce.pack, a.name FROM commission_entries ce
       JOIN auberges a ON a.id=ce.auberge_id
       WHERE ce.credit > 0
       ORDER BY ce.date DESC NULLS LAST, ce.id DESC LIMIT 20`
    );
    const history = hist.map((h) => ({
      date: h.date instanceof Date ? h.date.toISOString().slice(0, 10) : h.date,
      auberge: h.name,
      motive: h.pack || '',
      amount: parseFloat(h.credit) || 0,
    }));

    res.json({ total, todayTotal, auberges: list, history, dailyHistory });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

// ---------- Zone Admin (patron uniquement) : effacer des donnees ----------
function scopeToRange(scope) {
  if (!scope || scope.scope === 'all') return null; // pas de filtre de date -> tout supprimer
  if (scope.scope === 'day') return [scope.date, scope.date];
  if (scope.scope === 'month') {
    const [y, m] = scope.month.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return [start, end];
  }
  if (scope.scope === 'year') {
    const y = scope.year;
    return [`${y}-01-01`, `${y}-12-31`];
  }
  return null;
}

app.post('/api/admin/reset-data', auth, requireAdmin, async (req, res) => {
  const { reservations, caisse, commissions } = req.body;
  const cleared = [];
  let deletedCount = 0;
  try {
    if (reservations) {
      const range = scopeToRange(reservations);
      const result = range
        ? await pool.query('DELETE FROM reservations WHERE date >= $1 AND date <= $2', range)
        : await pool.query('DELETE FROM reservations');
      deletedCount += result.rowCount;
      cleared.push('reservations');
    }
    if (caisse) {
      const range = scopeToRange(caisse);
      const chargesResult = range
        ? await pool.query('DELETE FROM daily_charges WHERE date >= $1 AND date <= $2', range)
        : await pool.query('DELETE FROM daily_charges');
      const settingsResult = range
        ? await pool.query('DELETE FROM day_settings WHERE date >= $1 AND date <= $2', range)
        : await pool.query('DELETE FROM day_settings');
      deletedCount += chargesResult.rowCount + settingsResult.rowCount;
      cleared.push('caisse');
    }
    if (commissions) {
      const commResult = await pool.query('DELETE FROM commission_entries');
      await pool.query('DELETE FROM commission_credits');
      await pool.query('UPDATE auberges SET opening_balance=0');
      deletedCount += commResult.rowCount;
      cleared.push('commissions');
    }
    res.json({ ok: true, cleared, deletedCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});


// ---------- Fallback: sert index.html pour toute route inconnue (doit etre APRES toutes les routes API) ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Migration auto au demarrage : cree les tables manquantes ----------
async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_entries (
        id SERIAL PRIMARY KEY,
        auberge_id INTEGER NOT NULL REFERENCES auberges(id) ON DELETE CASCADE,
        date DATE,
        pack TEXT,
        homme INTEGER NOT NULL DEFAULT 0,
        femme INTEGER NOT NULL DEFAULT 0,
        debit NUMERIC(10,2) NOT NULL DEFAULT 0,
        credit NUMERIC(10,2) NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_commission_entries_auberge ON commission_entries(auberge_id);');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS extras (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table commission_entries prete.');
  } catch (e) {
    console.error('Erreur migration commission_entries:', e.message);
  }
}

// ---------- Import unique de l'historique Excel (une seule fois, si la table est vide) ----------
async function importCommissionHistory() {
  try {
    const { rows: flag } = await pool.query("SELECT value FROM app_settings WHERE key='commission_history_imported'");
    if (flag[0] && flag[0].value === 'true') return; // deja fait une fois, pour de bon -> on ne reimporte jamais
    const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS n FROM commission_entries');
    if (cnt[0].n > 0) {
      // Des donnees existent deja (creees avant l'ajout de ce marqueur) -> on considere l'import comme fait,
      // sans jamais l'ecraser, et on pose le marqueur pour que ca ne se reproduise plus.
      await pool.query("INSERT INTO app_settings (key, value) VALUES ('commission_history_imported','true') ON CONFLICT (key) DO UPDATE SET value='true'");
      return;
    }
    const p = path.join(__dirname, 'db', 'commission_history_import.json');
    if (!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

    // L'Excel devient la source unique : on remet tous les soldes d'ouverture a 0
    await pool.query('UPDATE auberges SET opening_balance=0');

    let total = 0;
    for (const [name, entries] of Object.entries(data)) {
      let { rows: a } = await pool.query('SELECT id FROM auberges WHERE lower(trim(name))=lower(trim($1)) LIMIT 1', [name]);
      let id = a[0] && a[0].id;
      if (!id) {
        const ins = await pool.query('INSERT INTO auberges (name, opening_balance) VALUES ($1,0) ON CONFLICT (name) DO NOTHING RETURNING id', [name]);
        id = ins.rows[0] ? ins.rows[0].id : (await pool.query('SELECT id FROM auberges WHERE lower(trim(name))=lower(trim($1)) LIMIT 1', [name])).rows[0].id;
      }
      let pos = 0;
      for (const e of entries) {
        pos += 1; total += 1;
        await pool.query(
          `INSERT INTO commission_entries (auberge_id, date, pack, homme, femme, debit, credit, source, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'import',$8)`,
          [id, e.date || null, e.pack || '', e.homme || 0, e.femme || 0, e.debit || 0, e.credit || 0, pos]
        );
      }
    }
    await pool.query("INSERT INTO app_settings (key, value) VALUES ('commission_history_imported','true') ON CONFLICT (key) DO UPDATE SET value='true'");
    console.log('Import historique commissions: ' + total + ' lignes.');
  } catch (e) {
    console.error('Erreur import historique commissions:', e.message);
  }
}

app.listen(PORT, async () => {
  console.log(`Serveur demarre sur le port ${PORT}`);
  await ensureTables();
  await importCommissionHistory();
});
