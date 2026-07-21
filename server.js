require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
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
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/reservations/:id', auth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM reservations WHERE id=$1', [id]);
  res.json({ ok: true });
});

// ---------- Comptabilite : calcul de caisse ----------
function splitStaffNames(str) {
  if (!str) return [];
  return str.split(/[+,\/]/).map((n) => n.trim()).filter(Boolean);
}

async function computeDayCash(dateStr) {
  const { rows } = await pool.query('SELECT * FROM reservations WHERE date=$1', [dateStr]);
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

  const reste = caisse - extraTotal - hanan - chargesTotal - commissionTotal;

  return {
    date: dateStr, caisse, extraTotal, extraList, hanan, hananOff,
    commissionTotal, commissionList, charges: chargeRows, chargesTotal, reste,
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

// ---------- Commission (releve Debit/Credit/Solde par auberge) ----------
app.get('/api/commission/:aubergeId', auth, async (req, res) => {
  const { aubergeId } = req.params;
  try {
    const { rows: aubergeRows } = await pool.query('SELECT * FROM auberges WHERE id=$1', [aubergeId]);
    const auberge = aubergeRows[0];
    if (!auberge) return res.status(404).json({ error: 'Auberge introuvable' });

    const { rows: resRows } = await pool.query(
      `SELECT r.date, r.nb_personnes, s.name AS service_name, r.sexe
       FROM reservations r
       LEFT JOIN services s ON s.id = r.service_id
       WHERE r.reclamation=false AND r.sans_commission=false
         AND lower(trim(r.auberge)) = lower(trim($1))
       ORDER BY r.date ASC`,
      [auberge.name]
    );
    const debitRows = resRows.map((r) => {
      const nb = r.nb_personnes || 1;
      return {
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
        label: (r.service_name || 'Service') + ' - ' + nb + ' ' + (r.sexe || ''),
        debit: nb * (nb >= 5 ? 100 : 50),
        credit: 0,
      };
    });

    const { rows: creditRows0 } = await pool.query(
      'SELECT * FROM commission_credits WHERE auberge_id=$1 ORDER BY date ASC',
      [aubergeId]
    );
    const creditRows = creditRows0.map((c) => ({
      date: c.date instanceof Date ? c.date.toISOString().slice(0, 10) : c.date,
      label: c.note || 'Paiement effectue',
      debit: 0,
      credit: parseFloat(c.amount),
      creditId: c.id,
    }));

    const combined = [...debitRows, ...creditRows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let solde = parseFloat(auberge.opening_balance) || 0;
    if (solde !== 0) {
      combined.unshift({ date: '—', label: 'Solde initial (importe)', debit: solde > 0 ? solde : 0, credit: solde < 0 ? -solde : 0, solde });
    }
    combined.forEach((row) => {
      if (row.label !== 'Solde initial (importe)') {
        solde += row.debit - row.credit;
        row.solde = solde;
      }
    });

    const totalDebit = debitRows.reduce((s, r) => s + r.debit, 0) + (parseFloat(auberge.opening_balance) > 0 ? parseFloat(auberge.opening_balance) : 0);
    const totalCredit = creditRows.reduce((s, r) => s + r.credit, 0);

    res.json({ auberge, combined, totalDebit, totalCredit, solde });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

app.post('/api/commission/credits', auth, async (req, res) => {
  const { auberge_id, date, amount, note } = req.body;
  if (!auberge_id || !date || amount === undefined) {
    return res.status(400).json({ error: 'auberge_id, date et amount sont obligatoires' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO commission_credits (auberge_id, date, amount, note) VALUES ($1,$2,$3,$4) RETURNING *',
      [auberge_id, date, amount, note || 'Paiement effectue']
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/commission/credits/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM commission_credits WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Fallback: sert index.html pour toute route inconnue (doit etre APRES toutes les routes API) ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur demarre sur le port ${PORT}`);
});
