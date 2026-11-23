import { createServer } from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const roles = ['lawyer', 'prosecutor', 'judge'];
const actions = {
  lawyer: { motion: 'Αίτηση υπεράσπισης', note: 'Ιδιωτική σημείωση' },
  prosecutor: { evidence: 'Καταχώριση αποδεικτικού' },
  judge: { hearing: 'Ορισμός ακρόασης', decision: 'Έκδοση απόφασης', publish: 'Δημοσίευση απόφασης' }
};

const directory = process.env.DATA_DIR || 'data';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(directory + '/doj.sqlite');
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT REFERENCES users ON DELETE CASCADE, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, defendant TEXT NOT NULL,
    prosecutor TEXT REFERENCES users, lawyer TEXT REFERENCES users, judge TEXT REFERENCES users,
    status TEXT NOT NULL DEFAULT 'filed'
  );
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY, case_id INTEGER REFERENCES cases, kind TEXT NOT NULL, body TEXT NOT NULL,
    author TEXT REFERENCES users, created TEXT NOT NULL, hearing_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS single_decision ON entries(case_id) WHERE kind = 'decision';
  CREATE UNIQUE INDEX IF NOT EXISTS single_publication ON entries(case_id) WHERE kind = 'publish';
`);

const passwordHash = (password, salt) => scryptSync(password, salt, 64);
for (const { username, role, password } of JSON.parse(process.env.DOJ_USERS || '[]')) {
  if (!/^[a-z0-9._-]{2,40}$/.test(username) || !roles.includes(role) || typeof password !== 'string' || password.length < 12) {
    throw new Error('Invalid DOJ_USERS entry');
  }
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?)').run(username, role, salt, passwordHash(password, salt).toString('hex'));
}

const fallbackSalt = randomBytes(16).toString('hex');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sessionCookie = 'Path=/; HttpOnly; SameSite=Strict' + (process.env.COOKIE_SECURE === '1' ? '; Secure' : '');
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']]
].map(([path, [file, type]]) => [path, [readFileSync(new URL('./public/' + file, import.meta.url)), type]]));

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function readBody(req) {
  if (req.headers['content-type'] !== 'application/json') fail(415, 'Απαιτείται JSON.');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 65536) fail(413, 'Το κείμενο είναι πολύ μεγάλο.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {}
  fail(400, 'Μη έγκυρα δεδομένα.');
}

function field(data, name, max) {
  const value = typeof data[name] === 'string' ? data[name].trim() : '';
  if (!value || value.length > max) fail(400, 'Συμπλήρωσε όλα τα πεδία εντός των ορίων.');
  return value;
}

function addEntry(id, kind, body, author, hearingAt = null) {
  db.prepare('INSERT INTO entries(case_id, kind, body, author, created, hearing_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, kind, body, author, new Date().toISOString(), hearingAt);
}

function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const loginAttempts = new Map();
async function route(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;
  const method = req.method;
  const asset = assets.get(path);
  if (method === 'GET' && asset) {
    res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' });
    return res.end(asset[0]);
  }

  if (method === 'GET' && path === '/api/public') {
    const decisions = db.prepare("SELECT case_id, body, created FROM entries WHERE kind = 'publish' ORDER BY id DESC").all();
    const hearings = db.prepare(`
      SELECT e.case_id, e.hearing_at FROM entries e JOIN cases c ON c.id = e.case_id
      WHERE e.kind = 'hearing' AND c.status = 'scheduled' AND e.hearing_at >= ?
      AND e.id = (SELECT MAX(id) FROM entries WHERE case_id = e.case_id AND kind = 'hearing')
      ORDER BY e.hearing_at
    `).all(new Date().toISOString());
    return send(res, 200, { decisions, hearings });
  }

  if (method === 'POST' && path === '/api/login') {
    const input = await readBody(req);
    const username = field(input, 'username', 40).toLowerCase();
    const password = field(input, 'password', 256);
    const now = Date.now();
    for (const [ip, attempt] of loginAttempts) {
      if (attempt.until <= now) loginAttempts.delete(ip);
    }
    const ip = req.socket.remoteAddress;
    const attempt = loginAttempts.get(ip) || { count: 0, until: now + 600000 };
    if (attempt.count >= 12 || loginAttempts.size >= 10000) fail(429, 'Δοκίμασε ξανά σε λίγα λεπτά.');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const candidate = passwordHash(password, user?.salt || fallbackSalt);
    if (!user || !timingSafeEqual(candidate, Buffer.from(user.hash, 'hex'))) {
      attempt.count += 1;
      loginAttempts.set(ip, attempt);
      fail(401, 'Τα στοιχεία σύνδεσης δεν είναι σωστά.');
    }
    loginAttempts.delete(ip);
    db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), username, now + 28800000);
    res.setHeader('Set-Cookie', 'doj=' + token + '; Max-Age=28800; ' + sessionCookie);
    return send(res, 200, { username, role: user.role });
  }

  if (!path.startsWith('/api/')) fail(404, 'Η σελίδα δεν βρέθηκε.');
  const token = req.headers.cookie?.match(/(?:^|;\s*)doj=([a-f0-9]{64})(?:;|$)/)?.[1];
  const user = token && db.prepare(`
    SELECT u.username, u.role FROM sessions s JOIN users u ON u.username = s.username
    WHERE s.token = ? AND s.expires > ?
  `).get(digest(token), Date.now());

  if (!user) fail(401, 'Χρειάζεται σύνδεση.');
  if (method === 'GET' && path === '/api/me') return send(res, 200, user);
  if (method === 'POST' && path === '/api/logout') {
    await readBody(req);
    db.prepare('DELETE FROM sessions WHERE token = ?').run(digest(token));
    res.setHeader('Set-Cookie', 'doj=; Max-Age=0; ' + sessionCookie);
    return send(res, 200, {});
  }
  if (method === 'GET' && path === '/api/cases') {
    return send(res, 200, db.prepare(`SELECT * FROM cases WHERE ${user.role} = ? ORDER BY id DESC`).all(user.username));
  }
  if (method === 'GET' && path === '/api/assignable' && user.role === 'prosecutor') {
    return send(res, 200, db.prepare("SELECT username, role FROM users WHERE role IN ('lawyer', 'judge') ORDER BY username").all());
  }
  if (method === 'POST' && path === '/api/cases' && user.role === 'prosecutor') {
    const input = await readBody(req);
    const title = field(input, 'title', 150);
    const defendant = field(input, 'defendant', 100);
    const indictment = field(input, 'body', 12000);
    const lawyer = field(input, 'lawyer', 40);
    const judge = field(input, 'judge', 40);
    const lookup = db.prepare('SELECT 1 FROM users WHERE role = ? AND username = ?');
    if (!lookup.get('lawyer', lawyer) || !lookup.get('judge', judge)) fail(400, 'Μη έγκυρη ανάθεση.');
    const id = transaction(() => {
      const result = db.prepare('INSERT INTO cases(title, defendant, prosecutor, lawyer, judge) VALUES (?, ?, ?, ?, ?)')
        .run(title, defendant, user.username, lawyer, judge);
      addEntry(result.lastInsertRowid, 'indictment', indictment, user.username);
      return result.lastInsertRowid;
    });
    return send(res, 201, { id });
  }

  const match = path.match(/^\/api\/cases\/(\d+)$/);
  if (!match) fail(404, 'Η ενέργεια δεν βρέθηκε.');
  const id = Number(match[1]);
  const getCase = () => db.prepare(`SELECT * FROM cases WHERE id = ? AND ${user.role} = ?`).get(id, user.username);
  const record = getCase();
  if (!record) fail(404, 'Η υπόθεση δεν βρέθηκε.');
  if (method === 'GET') {
    const entries = db.prepare("SELECT * FROM entries WHERE case_id = ? AND (kind <> 'note' OR author = ?) ORDER BY id")
      .all(id, user.username);
    return send(res, 200, { ...record, entries });
  }
  if (method !== 'POST') fail(405, 'Μη διαθέσιμη μέθοδος.');
  const input = await readBody(req);
  const kind = input.kind;
  if (!Object.hasOwn(actions[user.role], kind)) fail(403, 'Ο ρόλος σου δεν επιτρέπει αυτή την ενέργεια.');
  const body = field(input, 'body', 12000);
  let hearingAt = null;
  if (kind === 'hearing') {
    const date = new Date(input.hearingAt);
    if (!Number.isFinite(date.getTime()) || date <= new Date()) fail(400, 'Όρισε μελλοντική ημερομηνία ακρόασης.');
    hearingAt = date.toISOString();
  }
  transaction(() => {
    const current = getCase();
    if (kind === 'publish' ? current.status !== 'decided' : current.status === 'decided' || current.status === 'published') {
      fail(409, 'Η κατάσταση της υπόθεσης δεν επιτρέπει αυτή την ενέργεια.');
    }
    addEntry(id, kind, body, user.username, hearingAt);
    const next = { hearing: 'scheduled', decision: 'decided', publish: 'published' }[kind];
    if (next) db.prepare('UPDATE cases SET status = ? WHERE id = ?').run(next, id);
  });
  return send(res, 201, {});
}

createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  route(req, res).catch((error) => {
    if (!error.status) console.error(error);
    if (!res.headersSent && !res.destroyed) send(res, error.status || 500, error.status ? error.message : 'Σφάλμα διακομιστή.');
  });
}).listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
