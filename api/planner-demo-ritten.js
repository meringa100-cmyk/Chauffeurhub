import { get, put } from '@vercel/blob';

const ORIGIN = 'https://meringa100-cmyk.github.io';
const STORE_PATH = 'demo/planner-ritten.json';
const ALLOWED_STATUS = new Set(['waiting', 'picked', 'absent', 'school', 'delay', 'loose']);

function send(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(body));
}
async function load() {
  try {
    const stored = await get(STORE_PATH, { access: 'private' });
    if (stored?.statusCode === 200) {
      const parsed = JSON.parse(await new Response(stored.stream).text());
      if (Array.isArray(parsed.rides)) return parsed;
    }
  } catch (_) {}
  return { rides: [], updatedAt: null };
}
async function save(data) {
  await put(STORE_PATH, JSON.stringify(data), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json',
  });
}
function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}
function cleanRide(item) {
  const driver = cleanText(item.driver, 120);
  const match = driver.match(/(?:—|-|\s)(\d{4,8})$/);
  const driverNumber = cleanText(item.driverNumber || match?.[1], 8);
  if (!/^\d{4,8}$/.test(driverNumber)) return null;
  const status = ALLOWED_STATUS.has(item.status) ? item.status : 'waiting';
  return {
    id: cleanText(item.id, 80),
    childName: cleanText(item.childName || item.name, 100),
    address: cleanText(item.address || item.pickupAddress, 240),
    destination: cleanText(item.destination || item.destinationAddress || item.school, 240),
    time: cleanText(item.time, 10),
    driverNumber,
    driverName: cleanText(item.driverName || driver.replace(/\s*[—-]\s*\d{4,8}$/, ''), 100),
    routeOrder: Number.isFinite(Number(item.routeOrder)) ? Number(item.routeOrder) : 9999,
    status,
    delay: Math.max(0, Math.min(240, Number(item.delay) || 0)),
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== ORIGIN) return send(res, 403, { error: 'Origin niet toegestaan.' });
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const data = await load();
    data.rides = Array.isArray(data.rides) ? data.rides : [];

    if (req.method === 'GET') {
      if (req.query?.mode === 'statuses') {
        return send(res, 200, { ok: true, demo: true, updatedAt: data.updatedAt, statuses: data.rides.map(ride => ({ id: ride.id, driverNumber: ride.driverNumber, status: ride.status, delay: ride.delay, updatedAt: ride.updatedAt })) });
      }
      const driverNumber = cleanText(req.query?.driverNumber, 8);
      if (!/^\d{4,8}$/.test(driverNumber)) return send(res, 400, { error: 'Geef een geldig test-chauffeursnummer op.' });
      const rides = data.rides
        .filter(ride => ride.driverNumber === driverNumber)
        .sort((a, b) => a.routeOrder - b.routeOrder || a.time.localeCompare(b.time));
      return send(res, 200, { ok: true, demo: true, driverNumber, updatedAt: data.updatedAt, rides });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return send(res, 405, { error: 'Methode niet toegestaan.' });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (body.action === 'publish') {
      if (!Array.isArray(body.rides) || body.rides.length > 1000) return send(res, 400, { error: 'Ongeldige testritlijst.' });
      const previous = new Map((Array.isArray(data.rides) ? data.rides : []).map(ride => [String(ride.id)+'|'+String(ride.driverNumber), ride]));
      const rides = body.rides.map(cleanRide).filter(Boolean).map(ride => {
        const prior = previous.get(String(ride.id)+'|'+String(ride.driverNumber));
        // Preserve a status reported by ChauffeursHub when Planner republishes its unchanged base schedule.
        if (prior) {
          // Keep driver-reported workflow status until an explicit demo reset.
          if (prior.status && prior.status !== 'waiting') ride.status = prior.status;
          // Delay is a separate flag. Keep an active driver delay when Planner republishes
          // an unchanged base schedule; a driver status update or demo reset can clear it.
          if (Number(prior.delay) > 0 && Number(ride.delay) <= 0) {
            ride.delay = Math.max(0, Math.min(240, Number(prior.delay) || 0));
          }
          if (ride.status === prior.status || ride.delay === Number(prior.delay || 0)) {
            ride.updatedAt = prior.updatedAt || ride.updatedAt;
          }
        }
        return ride;
      });
      data.rides = rides;
      data.updatedAt = new Date().toISOString();
      await save(data);
      return send(res, 200, { ok: true, demo: true, count: rides.length, drivers: [...new Set(rides.map(x => x.driverNumber))].length, updatedAt: data.updatedAt });
    }

    if (body.action === 'resetStatuses') {
      const now = new Date().toISOString();
      let resetCount = 0;
      data.rides = data.rides.map(ride => {
        if (ride.status !== 'waiting' || Number(ride.delay) > 0) resetCount++;
        return { ...ride, status: 'waiting', delay: 0, updatedAt: now };
      });
      data.updatedAt = now;
      await save(data);
      return send(res, 200, { ok: true, demo: true, resetCount, updatedAt: now });
    }

    if (body.action === 'status') {
      const rideId = cleanText(body.rideId, 80);
      const driverNumber = cleanText(body.driverNumber, 8);
      const status = cleanText(body.status, 20);
      if (!rideId || !/^\d{4,8}$/.test(driverNumber) || !ALLOWED_STATUS.has(status)) {
        return send(res, 400, { error: 'Ongeldige statusmelding.' });
      }
      const ride = data.rides.find(x => x.id === rideId && x.driverNumber === driverNumber);
      if (!ride) return send(res, 404, { error: 'Testrit niet gevonden voor deze chauffeur.' });
      // A delay is an additional flag, not a replacement for the ride's workflow status.
      // Keep waiting/picked/school intact so Planner dashboard counts remain correct.
      if (status !== 'delay') ride.status = status;
      ride.delay = status === 'delay'
        ? Math.max(10, Math.min(240, Number(body.delay) || 10))
        : Math.max(0, Math.min(240, Number(body.delay) || 0));
      ride.updatedAt = new Date().toISOString();
      data.updatedAt = ride.updatedAt;
      await save(data);
      return send(res, 200, { ok: true, demo: true, ride });
    }

    return send(res, 400, { error: 'Ongeldige actie.' });
  } catch (error) {
    return send(res, 500, { error: 'Fout in de demo-rittenkoppeling.' });
  }
}
