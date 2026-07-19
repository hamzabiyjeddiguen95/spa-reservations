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
    nb_personnes, sexe, origine, auberge, sans_commission, remise, alerte, taxi, prix, note, staff_names,
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
        (room_id, service_id, date, hour, duration, client_type, nb_personnes, sexe, origine, auberge, sans_commission, remise, alerte, taxi, prix, note, staff_names, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [room_id, service_id || null, date, hour, duration || 1, client_type, nb, sexe, origine, auberge || null, !!sans_commission, remise || 0, !!alerte, !!taxi, prix, note, staff_names, req.user.id]
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
    client_type, service_id, nb_personnes, sexe, origine, auberge, sans_commission, remise, alerte, taxi, prix, note, staff_names, duration,
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
        room_id=$15, hour=$16, date=$17,
        updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [client_type, service_id, nb_personnes, sexe, origine, auberge, taxi, prix, note, staff_names, duration,
        sans_commission, remise, alerte, targetRoomId, targetHour, targetDate, id]
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

// ---------- Fallback: sert index.html pour toute route inconnue ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur demarre sur le port ${PORT}`);
});
