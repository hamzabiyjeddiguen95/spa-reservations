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
    room_id, date, hour, duration, client_type,
    nb_personnes, sexe, origine, prix, note, staff_names,
  } = req.body;
  if (!room_id || !date || hour === undefined) {
    return res.status(400).json({ error: 'room_id, date et hour sont obligatoires' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO reservations
        (room_id, date, hour, duration, client_type, nb_personnes, sexe, origine, prix, note, staff_names, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [room_id, date, hour, duration || 1, client_type, nb_personnes || 1, sexe, origine, prix, note, staff_names, req.user.id]
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
    client_type, nb_personnes, sexe, origine, prix, note, staff_names, duration,
  } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE reservations SET
        client_type=$1, nb_personnes=$2, sexe=$3, origine=$4, prix=$5,
        note=$6, staff_names=$7, duration=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [client_type, nb_personnes, sexe, origine, prix, note, staff_names, duration || 1, id]
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
