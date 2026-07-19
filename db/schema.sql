-- Schema de la base de donnees - Systeme de reservations spa

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  section TEXT NOT NULL,        -- ex: TAMAZIGHT, TIFAWIN, TANIRT, TAFOKT, HAMMAM
  name TEXT NOT NULL,           -- ex: "ROOM DOUBL 1", "9DIM 2 PLACE HOMME"
  capacity TEXT,                -- ex: "2 places", "4 places"
  color TEXT DEFAULT '#e5e7eb', -- couleur d'affichage de la colonne
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour INTEGER NOT NULL,        -- heure de debut (ex: 10, 11, 12...)
  duration INTEGER DEFAULT 1,   -- duree en heures
  client_type TEXT,             -- ex: "Taziri", "Masage", "Traditio"
  nb_personnes INTEGER DEFAULT 1,
  sexe TEXT,                    -- homme / femme / mixte
  origine TEXT,                 -- ex: "etrg" (etranger), "local"
  prix NUMERIC(10,2),
  note TEXT,
  staff_names TEXT,             -- noms du staff assigne (texte libre, ex: "Nawal, Mouna")
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id, date);
