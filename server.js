'use strict';
/* Static server + anonymous feedback API.

   PERSISTENCE. Railway's container filesystem is ephemeral — it is rebuilt on
   every deploy, so a SQLite file inside the image is wiped each time you ship.
   The database therefore lives in DATA_DIR, which must point at a mounted
   Railway volume (set DATA_DIR=/data and mount a volume there). Locally it
   falls back to ./data, which is gitignored. */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT  = process.env.PORT || 3000;
const ROOT  = path.join(__dirname, 'public');
const DATA  = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN = process.env.ADMIN_TOKEN || '';

const MAX_BODY    = 4000;      // characters of comment
const MAX_CONTEXT = 4000;      // characters of attached simulation state
const RATE_MAX    = 5;         // posts …
const RATE_WINDOW = 10*60*1000;// … per 10 minutes, per IP

/* ------------------------------------------------------------------ db --- */
fs.mkdirSync(DATA, { recursive: true });
const db = new Database(path.join(DATA, 'feedback.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    body       TEXT NOT NULL,
    context    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
`);
const qList   = db.prepare('SELECT id, body, context, created_at FROM feedback ORDER BY id DESC LIMIT ?');
const qInsert = db.prepare('INSERT INTO feedback (body, context, created_at) VALUES (?, ?, ?)');
const qDelete = db.prepare('DELETE FROM feedback WHERE id = ?');

/* --------------------------------------------------------------- utils --- */
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',   '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.ico':'image/x-icon',  '.csv':'text/csv; charset=utf-8',
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': type === TYPES['.json'] ? 'no-store' : 'no-cache',
  });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), TYPES['.json']);

/* Constant-time compare. A plain === leaks the token one character at a time
   through response timing; with an 8-hour budget that is a real attack. */
function tokenOk(given) {
  if (!ADMIN || typeof given !== 'string' || given.length === 0) return false;
  const a = Buffer.from(given), b = Buffer.from(ADMIN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const hits = new Map();   // ip → timestamps. In memory only: no IP is ever stored.
function rateLimited(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (seen.length >= RATE_MAX) { hits.set(ip, seen); return true; }
  seen.push(now); hits.set(ip, seen);
  if (hits.size > 5000) hits.clear();        // crude cap, this is not a fortress
  return false;
}

function readJson(req, limit, cb) {
  let raw = '', over = false;
  req.on('data', c => {
    if (over) return;
    raw += c;
    if (raw.length > limit) { over = true; cb(new Error('too large')); }
  });
  req.on('end', () => {
    if (over) return;
    try { cb(null, JSON.parse(raw || '{}')); }
    catch { cb(new Error('bad json')); }
  });
  req.on('error', () => cb(new Error('stream error')));
}

const clientIp = req =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket.remoteAddress || 'unknown';

/* ---------------------------------------------------------------- api --- */
function api(req, res, url) {
  /* list — public, and deliberately carries no author information at all */
  if (req.method === 'GET' && url === '/api/feedback') {
    return json(res, 200, { items: qList.all(200) });
  }

  /* is this token the admin one? lets the page decide whether to show delete */
  if (req.method === 'POST' && url === '/api/admin/check') {
    return readJson(req, 4096, (err, b) => {
      if (err) return json(res, 400, { error: 'bad request' });
      json(res, 200, { ok: tokenOk(b && b.token) });
    });
  }

  if (req.method === 'POST' && url === '/api/feedback') {
    if (rateLimited(clientIp(req)))
      return json(res, 429, { error: 'Too many notes just now — try again in a few minutes.' });

    return readJson(req, MAX_BODY + MAX_CONTEXT + 2048, (err, b) => {
      if (err) return json(res, 400, { error: 'Could not read that.' });
      /* honeypot: a real person never fills a field they cannot see */
      if (b.website) return json(res, 200, { ok: true });
      const body = String(b.body || '').trim();
      if (!body) return json(res, 400, { error: 'Nothing to save — the note is empty.' });
      if (body.length > MAX_BODY)
        return json(res, 400, { error: `Note is ${body.length} characters; the limit is ${MAX_BODY}.` });
      const context = b.context ? String(b.context).slice(0, MAX_CONTEXT) : null;
      const info = qInsert.run(body, context, new Date().toISOString());
      json(res, 201, { id: info.lastInsertRowid });
    });
  }

  const del = url.match(/^\/api\/feedback\/(\d+)$/);
  if (req.method === 'DELETE' && del) {
    if (!tokenOk(req.headers['x-admin-token']))
      return json(res, 403, { error: 'Not authorised.' });
    const out = qDelete.run(Number(del[1]));
    return json(res, 200, { deleted: out.changes });
  }

  return json(res, 404, { error: 'No such endpoint.' });
}

/* -------------------------------------------------------------- static --- */
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/healthz') return send(res, 200, 'ok');
  if (url.startsWith('/api/')) return api(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  /* Decode first, then verify the resolved path is still under ROOT —
     otherwise "%2e%2e%2f" walks straight out of it. */
  let rel;
  try { rel = decodeURIComponent(url); } catch { return send(res, 400, 'Bad request'); }
  if (rel === '/' || rel === '') rel = '/index.html';

  const file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');

  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`granularlab-2d on ${PORT} · db ${path.join(DATA, 'feedback.db')}`);
  if (!ADMIN) console.warn('WARNING: ADMIN_TOKEN unset — deletion is disabled until you set it.');
});
