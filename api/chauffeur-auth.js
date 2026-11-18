import { get, put } from '@vercel/blob';
import {
  createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const ORIGIN = 'https://meringa100-cmyk.github.io';
const STORE_PATH = 'private/driver-credentials.json';
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function send(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.HUB_AUTH_SECRET).update(body).digest('base64url');
  return body + '.' + signature;
}

function verify(token) {
  if (!process.env.HUB_AUTH_SECRET || typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', process.env.HUB_AUTH_SECRET).update(parts[0]).digest('base64url');
  if (!safeEqual(parts[1], expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload.driverNumber || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

async function loadDrivers() {
  try {
    const stored = await get(STORE_PATH, { access: 'private' });
    if (stored?.statusCode === 200) {
      const parsed = JSON.parse(await new Response(stored.stream).text());
      if (Array.isArray(parsed.drivers)) return parsed;
    }
  } catch (_) {}
  return { drivers: [] };
}

async function saveDrivers(data) {
  await put(STORE_PATH, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== ORIGIN) return send(res, 403, { error: 'Origin niet toegestaan.' });
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'Methode niet toegestaan.' });
  }
  if (!process.env.HUB_AUTH_SECRET || !process.env.HUB_ADMIN_SECRET) {
    return send(res, 503, { error: 'Chauffeurslogin is nog niet geconfigureerd.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (body.action === 'provision') {
      if (!safeEqual(body.adminSecret, process.env.HUB_ADMIN_SECRET)) {
        return send(res, 401, { error: 'Niet bevoegd.' });
      }
      const driverNumber = String(body.driverNumber || '').trim();
      const name = String(body.name || '').trim().slice(0, 100);
      const pin = String(body.pin || '');
      if (!/^\d{4,8}$/.test(driverNumber) || !name || !/^\d{6,12}$/.test(pin)) {
        return send(res, 400, { error: 'Chauffeursnummer, naam of pincode is ongeldig.' });
      }
      const data = await loadDrivers();
      const salt = randomBytes(16).toString('hex');
      const hash = await scrypt(pin, salt, 64);
      const record = { driverNumber, name, salt, pinHash: hash.toString('hex'), active: true, updatedAt: new Date().toISOString() };
      const index = data.drivers.findIndex(item => item.driverNumber === driverNumber);
      if (index >= 0) data.drivers[index] = record;
      else data.drivers.push(record);
      await saveDrivers(data);
      return send(res, 200, { ok: true, driver: { driverNumber, name, active: true } });
    }

    if (body.action === 'login') {
      const driverNumber = String(body.driverNumber || '').trim();
      const pin = String(body.pin || '');
      if (!/^\d{4,8}$/.test(driverNumber) || !/^\d{6,12}$/.test(pin)) {
        return send(res, 401, { error: 'Chauffeursnummer of pincode klopt niet.' });
      }
      const data = await loadDrivers();
      const driver = data.drivers.find(item => item.driverNumber === driverNumber && item.active);
      // Perform a hash even for unknown numbers to reduce timing-based enumeration.
      const salt = driver?.salt || '00000000000000000000000000000000';
      const candidate = await scrypt(pin, salt, 64);
      const expected = driver ? Buffer.from(driver.pinHash, 'hex') : Buffer.alloc(64);
      if (!driver || expected.length !== candidate.length || !timingSafeEqual(candidate, expected)) {
        return send(res, 401, { error: 'Chauffeursnummer of pincode klopt niet.' });
      }
      const now = Math.floor(Date.now() / 1000);
      const token = sign({ driverNumber, name: driver.name, iat: now, exp: now + TOKEN_TTL_SECONDS });
      return send(res, 200, { ok: true, token, expiresAt: new Date((now + TOKEN_TTL_SECONDS) * 1000).toISOString(), driver: { driverNumber, name: driver.name } });
    }

    if (body.action === 'verify') {
      const header = String(req.headers.authorization || '');
      const token = header.startsWith('Bearer ') ? header.slice(7) : String(body.token || '');
      const session = verify(token);
      if (!session) return send(res, 401, { error: 'Sessie verlopen. Log opnieuw in.' });
      return send(res, 200, { ok: true, driver: { driverNumber: session.driverNumber, name: session.name }, expiresAt: new Date(session.exp * 1000).toISOString() });
    }

    return send(res, 400, { error: 'Ongeldige actie.' });
  } catch (error) {
    return send(res, 500, { error: 'Serverfout bij chauffeurslogin.' });
  }
}
