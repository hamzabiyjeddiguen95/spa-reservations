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
  name TEXT NOT NULL,           -- ex: "ROOM DOUBL", "9DIM 2 PLACE HOMME"
  capacity_base INTEGER DEFAULT 1,     -- nombre de clients/lits de base
  capacity_flexible BOOLEAN DEFAULT FALSE, -- true = on peut depasser la capacite de base (ex: hammam)
  mixte_autorise BOOLEAN DEFAULT FALSE, -- true = homme et femme peuvent partager le creneau (tables individuelles)
  sexe_restriction TEXT,        -- 'homme', 'femme', ou NULL si determine par la reservation
  color TEXT DEFAULT '#e5e7eb', -- couleur d'affichage de la colonne
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,       -- 'massage' ou 'hammam'
  name TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  prix NUMERIC(10,2) NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id),
  date DATE NOT NULL,
  hour INTEGER NOT NULL,        -- heure de debut (ex: 10, 11, 12...)
  duration INTEGER DEFAULT 1,   -- duree en heures
  client_type TEXT,             -- nom / description du client (ex: "Taziri")
  nb_personnes INTEGER DEFAULT 1,
  sexe TEXT,                    -- homme / femme
  origine TEXT,                 -- 'etranger' ou 'arabe'
  auberge TEXT,                 -- nom de l'auberge qui a envoye le client (si applicable)
  sans_commission BOOLEAN DEFAULT FALSE, -- true si l'auberge a deja regle sans commission
  remise NUMERIC(10,2) DEFAULT 0,       -- remise appliquee (dh)
  alerte BOOLEAN DEFAULT FALSE,         -- true = case a surligner en jaune (attention equipe)
  taxi BOOLEAN DEFAULT FALSE,   -- true si un taxi a ete envoye pour ce client
  prix NUMERIC(10,2),
  note TEXT,
  staff_names TEXT,             -- noms du staff assigne (texte libre, ex: "Nawal, Mouna")
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id, date);

-- Ajouts de securite : si la table existait deja avant l'ajout de ces colonnes,
-- CREATE TABLE IF NOT EXISTS ne les cree pas tout seul. On force leur ajout ici.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mixte_autorise BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS sexe_restriction TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES services(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS origine TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS auberge TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS sans_commission BOOLEAN DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS remise NUMERIC(10,2) DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS alerte BOOLEAN DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS taxi BOOLEAN DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS staff_names TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS carte_cadeaux BOOLEAN DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reclamation BOOLEAN DEFAULT FALSE;

-- ---------- Comptabilite (calcul de caisse) ----------
CREATE TABLE IF NOT EXISTS daily_charges (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_charges_date ON daily_charges(date);

CREATE TABLE IF NOT EXISTS day_settings (
  date DATE PRIMARY KEY,
  hanan_off BOOLEAN DEFAULT FALSE
);

-- ---------- Auberges + Commission ----------
CREATE TABLE IF NOT EXISTS auberges (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extras (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_credits (
  id SERIAL PRIMARY KEY,
  auberge_id INTEGER NOT NULL REFERENCES auberges(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commission_credits_auberge ON commission_credits(auberge_id);

-- Lignes de commission entierement modifiables a la main (comme l'Excel Details)
CREATE TABLE IF NOT EXISTS commission_entries (
  id SERIAL PRIMARY KEY,
  auberge_id INTEGER NOT NULL REFERENCES auberges(id) ON DELETE CASCADE,
  date DATE,
  pack TEXT,
  homme INTEGER NOT NULL DEFAULT 0,
  femme INTEGER NOT NULL DEFAULT 0,
  debit NUMERIC(10,2) NOT NULL DEFAULT 0,
  credit NUMERIC(10,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',        -- 'manual' ou 'reservation'
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commission_entries_auberge ON commission_entries(auberge_id);
