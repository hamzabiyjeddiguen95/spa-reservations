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
  // section, name, capacity_base, capacity_flexible, mixte_autorise, sexe_restriction, color
  ['TAMAZIGHT', 'ROOM DOUBL', 2, false, false, null, '#f28b6b'],
  ['TAMAZIGHT', 'ROOM DOUBL', 2, false, false, null, '#f28b6b'],
  ['TAMAZIGHT', 'ROOM DOUBL', 2, false, false, null, '#f28b6b'],
  ['TIFAWIN', 'ROOM DOUBL', 2, false, false, null, '#a9d6e5'],
  ['TIFAWIN', 'ROOM TRIPL', 3, false, false, null, '#a9d6e5'],
  ['TANIRT', '4 place mixte', 4, false, true, null, '#b7d7a8'],
  ['TAFOKT', '5 place mixte', 5, false, true, null, '#d9b3f0'],
  ['HAMMAM', '2 place home', 2, true, false, null, '#fff2a8'],
  ['HAMMAM', '2 place Feme', 2, true, false, null, '#fff2a8'],
  ['HAMMAM', 'NEW 5 PLACE', 5, true, false, null, '#fff2a8'],
  ['HAMMAM', 'NEW 4 PLACE', 4, true, false, null, '#fff2a8'],
];

const SERVICES = [
  // category, name, duration_minutes, prix
  ['massage', 'Relaxant', 60, 350],
  ['massage', 'Tonique', 60, 350],
  ['massage', 'Dos', 60, 350],
  ['massage', 'Californien', 60, 450],
  ['massage', 'Pierres chaudes', 60, 550],
  ['massage', '4 mains', 60, 550],
  ['hammam', 'Traditionnel', 60, 300],
  ['hammam', 'Mira', 60, 400],
  ['hammam', 'Taziri', 120, 550],
  ['hammam', 'Royal', 120, 750],
];

async function main() {
  console.log('Creation des tables...');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  console.log('Insertion des rooms (si vides)...');
  const { rows } = await pool.query('SELECT COUNT(*) FROM rooms');
  if (parseInt(rows[0].count, 10) === 0) {
    let order = 0;
    for (const [section, name, capacity_base, capacity_flexible, mixte_autorise, sexe_restriction, color] of ROOMS) {
      order += 1;
      await pool.query(
        'INSERT INTO rooms (section, name, capacity_base, capacity_flexible, mixte_autorise, sexe_restriction, color, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [section, name, capacity_base, capacity_flexible, mixte_autorise, sexe_restriction, color, order]
      );
    }
    console.log(`${ROOMS.length} rooms ajoutees.`);
  } else {
    console.log('Rooms deja presentes, rien ajoute.');
  }

  console.log('Insertion des services (si vides)...');
  const { rows: svcRows } = await pool.query('SELECT COUNT(*) FROM services');
  if (parseInt(svcRows[0].count, 10) === 0) {
    let order = 0;
    for (const [category, name, duration_minutes, prix] of SERVICES) {
      order += 1;
      await pool.query(
        'INSERT INTO services (category, name, duration_minutes, prix, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [category, name, duration_minutes, prix, order]
      );
    }
    console.log(`${SERVICES.length} services ajoutes.`);
  } else {
    console.log('Services deja presents, rien ajoute.');
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

  // Comptes de l'equipe (mots de passe par defaut, a changer via "Mon profil" apres la premiere connexion)
  const TEAM_ACCOUNTS = [
    { username: 'nouhaila', password: 'spa2026', full_name: 'Bannany Nouhaila' },
    { username: 'hanane.reception', password: 'spa2026', full_name: 'Izikki Hanane' },
    { username: 'hanane.gerante', password: 'spa2026', full_name: 'El Bellaoui Hanane' },
    { username: 'lahcen', password: 'spa2026', full_name: 'Lahcen Biyjeddiguen' },
  ];
  for (const acc of TEAM_ACCOUNTS) {
    const { rows: existingAcc } = await pool.query('SELECT id FROM users WHERE username=$1', [acc.username]);
    if (existingAcc.length === 0) {
      const hash = await bcrypt.hash(acc.password, 10);
      await pool.query(
        'INSERT INTO users (username, password_hash, full_name, is_admin) VALUES ($1,$2,$3,false)',
        [acc.username, hash, acc.full_name]
      );
      console.log(`Compte cree -> ${acc.full_name} : username "${acc.username}" / password "${acc.password}"`);
    } else {
      console.log(`Compte "${acc.username}" (${acc.full_name}) deja present, rien change.`);
    }
  }
  console.log('IMPORTANT: chaque personne devrait changer son mot de passe via "Mon profil" apres sa premiere connexion.');

  console.log('Mise a jour des noms TANIRT/TAFOKT (si besoin)...');
  await pool.query("UPDATE rooms SET name='4 place mixte' WHERE section='TANIRT'");
  await pool.query("UPDATE rooms SET name='5 place mixte' WHERE section='TAFOKT'");
  await pool.query("UPDATE rooms SET mixte_autorise=true WHERE section IN ('TANIRT','TAFOKT')");
  await pool.query("UPDATE rooms SET name='2 place home' WHERE section='HAMMAM' AND name ILIKE '%homme%'");
  await pool.query("UPDATE rooms SET name='2 place Feme' WHERE section='HAMMAM' AND name ILIKE '%femme%'");

  console.log('Import des auberges depuis le fichier Excel (si pas deja presentes)...');
  const importPath = path.join(__dirname, 'auberges_import.json');
  if (fs.existsSync(importPath)) {
    const auberges = JSON.parse(fs.readFileSync(importPath, 'utf-8'));
    let added = 0;
    for (const a of auberges) {
      const { rowCount } = await pool.query(
        'INSERT INTO auberges (name, opening_balance) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING',
        [a.name, a.opening_balance]
      );
      if (rowCount > 0) added++;
    }
    console.log(`${added} nouvelle(s) auberge(s) importee(s) (sur ${auberges.length} dans le fichier).`);
  } else {
    console.log('Aucun fichier auberges_import.json trouve, etape ignoree.');
  }

  await pool.end();
  console.log('Termine.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
