import initSqlJs, { type Database } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_DIR = path.resolve(__dirname, '..', 'data')
const DB_PATH = path.join(DB_DIR, 'event.db')

let db: Database

function saveDb(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function logAction(action: string, entityType: string, entityId: string | number, detail: string): void {
  const d = getDb()
  d.run(
    `INSERT INTO operation_logs (action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    [action, entityType, String(entityId), detail]
  )
  saveDb()
}

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  fee REAL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS age_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  min_age INTEGER NOT NULL,
  max_age INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  phone TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  age_group TEXT NOT NULL,
  emergency_contact TEXT NOT NULL,
  emergency_phone TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  proof_path TEXT,
  proof_verified INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','grouped','withdrawn','cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_id_number_event ON registrations(id_number, event_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL UNIQUE,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','refunded')),
  paid_at TEXT,
  confirmed_at TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  published INTEGER DEFAULT 0,
  published_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS group_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  registration_id INTEGER NOT NULL,
  slot_number INTEGER,
  is_withdrawn INTEGER DEFAULT 0,
  withdrawal_reason TEXT,
  assigned_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  requested_at TEXT DEFAULT (datetime('now')),
  approved_at TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  age_group TEXT NOT NULL,
  registration_id INTEGER NOT NULL,
  queue_order INTEGER NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting','promoted','cancelled','expired')),
  payment_time TEXT,
  promoted_at TEXT,
  cancelled_at TEXT,
  source_registration_id INTEGER,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE TABLE IF NOT EXISTS project_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  original_event_id INTEGER NOT NULL,
  target_event_id INTEGER NOT NULL,
  original_age_group TEXT NOT NULL,
  target_age_group TEXT NOT NULL,
  fee_difference REAL NOT NULL,
  difference_status TEXT DEFAULT 'unpaid' CHECK(difference_status IN ('unpaid','paid','waived','refunded')),
  paid_at TEXT,
  change_status TEXT DEFAULT 'pending' CHECK(change_status IN ('pending','approved','rejected','cancelled')),
  id_number_verified INTEGER DEFAULT 0,
  age_verified INTEGER DEFAULT 0,
  proof_verified INTEGER DEFAULT 0,
  rejection_reason TEXT,
  approved_at TEXT,
  requester_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (registration_id) REFERENCES registrations(id),
  FOREIGN KEY (original_event_id) REFERENCES events(id),
  FOREIGN KEY (target_event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS waitlist_promotion_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  age_group TEXT NOT NULL,
  group_id INTEGER,
  vacated_slot_number INTEGER,
  vacated_registration_id INTEGER,
  vacated_reason TEXT,
  promoted_registration_id INTEGER,
  promotion_order INTEGER,
  queued_waitlist_entry_id INTEGER,
  promoted_assignment_id INTEGER,
  status TEXT DEFAULT 'success' CHECK(status IN ('success','failed','skipped')),
  failure_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS payment_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  project_change_id INTEGER,
  original_amount REAL NOT NULL,
  new_amount REAL NOT NULL,
  difference REAL NOT NULL,
  adjustment_type TEXT CHECK(adjustment_type IN ('supplement','refund')),
  finance_confirmed INTEGER DEFAULT 0,
  confirmed_by TEXT,
  confirmed_at TEXT,
  payment_reference TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (registration_id) REFERENCES registrations(id),
  FOREIGN KEY (project_change_id) REFERENCES project_changes(id)
);
`

function seedData(d: Database): void {
  const eventCount = d.exec('SELECT COUNT(*) FROM events')[0]?.values[0]?.[0] as number
  if (eventCount > 0) return

  d.run(`INSERT INTO events (name, category, description, fee) VALUES ('男子100米', 'track', '男子100米短跑', 100)`)
  d.run(`INSERT INTO events (name, category, description, fee) VALUES ('女子200米', 'track', '女子200米短跑', 150)`)
  d.run(`INSERT INTO events (name, category, description, fee) VALUES ('混合接力', 'relay', '男女混合4x100米接力', 200)`)

  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (1, 'U18', 12, 17)`)
  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (1, 'U23', 18, 22)`)
  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (1, 'Open', 18, 99)`)

  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (2, 'U18', 12, 17)`)
  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (2, 'U23', 18, 22)`)
  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (2, 'Open', 18, 99)`)

  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (3, 'U18', 12, 17)`)
  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (3, 'U23', 18, 22)`)
  d.run(`INSERT INTO age_rules (event_id, group_name, min_age, max_age) VALUES (3, 'Open', 18, 99)`)

  d.run(`INSERT INTO groups (event_id, group_name) VALUES (1, '男子100米-U18')`)
  d.run(`INSERT INTO groups (event_id, group_name) VALUES (1, '男子100米-U23')`)
  d.run(`INSERT INTO groups (event_id, group_name) VALUES (1, '男子100米-Open')`)

  d.run(`INSERT INTO groups (event_id, group_name) VALUES (2, '女子200米-U18')`)
  d.run(`INSERT INTO groups (event_id, group_name) VALUES (2, '女子200米-U23')`)
  d.run(`INSERT INTO groups (event_id, group_name) VALUES (2, '女子200米-Open')`)

  d.run(`INSERT INTO groups (event_id, group_name) VALUES (3, '混合接力-U18')`)
  d.run(`INSERT INTO groups (event_id, group_name) VALUES (3, '混合接力-U23')`)
  d.run(`INSERT INTO groups (event_id, group_name) VALUES (3, '混合接力-Open')`)

  saveDb()
}

export async function initDb(): Promise<Database> {
  const SQL = await initSqlJs()

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(CREATE_TABLES)
  saveDb()
  seedData(db)

  console.log('Database initialized at', DB_PATH)
  return db
}
