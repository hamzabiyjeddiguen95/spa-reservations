// db/seed.js
// Cree les tables + les rooms de base + un premier compte admin
// Utilisation: node db/seed.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ROOMS = [
  // section, name, capacity, color
  ['TAMAZIGHT', 'ROOM DOUBLE 1', '2 places', '#f28b6b'],
  ['TAMAZIGHT', 'ROOM DOUBLE 2', '2 places', '#f28b6b'],
  ['TAMAZIGHT', 'ROOM DOUBLE 3', '2 places', '#f28b6b'],
  ['TIFAWIN', 'ROOM DOUBLE 1', '2 places', '#a9d6e5'],
  ['TIFAWIN', 'ROOM TRIPLE', '3 places', '#a9d6e5'],
  ['TANIRT', 'APART 4 PLACES (mixte/individuel)', '4 places', '#b7d7a8'],
  ['TAFOKT', 'APART 5 PLACES (mixte/individuel)', '5 places', '#d9b3f0'],
  ['HAMMAM', '9DIM 2 PLACES HOMME', '2 places', '#fff2a8'],
  ['HAMMAM', '9DIM 2 PLACES FEMME', '2 places', '#fff2a8'],
  ['HAMMAM', 'NEW 5 PLACES', '5 places', '#fff2a8'],
  ['HAMMAM', 'NEW 4 PLACES', '4 places', '#fff2a8'],
];

async function main() {
  console.log('Creation des tables...');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  console.log('Insertion des rooms (si vides)...');
  const { rows } = await pool.query('SELECT COUNT(*) FROM rooms');
  if (parseInt(rows[0].count, 10) === 0) {
    let order = 0;
    for (const [section, name, capacity, color] of ROOMS) {
      order += 1;
      await pool.query(
        'INSERT INTO rooms (section, name, capacity, color, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [section, name, capacity, color, order]
      );
    }
    console.log(`${ROOMS.length} rooms ajoutees.`);
  } else {
    console.log('Rooms deja presentes, rien ajoute.');
  }

  // Compte admin par defaut (a changer immediatement apres la premiere connexion)
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme123';
  const { rows: existing } = await pool.query('SELECT id FROM users WHERE username=$1', [adminUsername]);
  if (existing.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, full_name, is_admin) VALUES ($1,$2,$3,true)',
      [adminUsername, hash, 'Admin']
    );
    console.log(`Compte admin cree -> username: ${adminUsername} / password: ${adminPassword}`);
    console.log('IMPORTANT: change ce mot de passe des que possible.');
  } else {
    console.log('Compte admin deja present.');
  }

  await pool.end();
  console.log('Termine.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
