import { get, put } from '@vercel/blob';

const ORIGIN = 'https://meringa100-cmyk.github.io';
const FIXTURE_URL = 'https://raw.githubusercontent.com/meringa100-cmyk/Chauffeurhub/main/integration/ritten-demo.json';
const STORE_PATH = 'demo/ritten-demo.json';
const ALLOWED_EVENTS = new Set(['picked', 'absent', 'delay', 'school']);

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(body));
}

async function loadTrip() {
  try {
    const stored = await get(STORE_PATH, { access: 'private' });
    if (stored?.statusCode === 200) {
      const raw = await new Response(stored.stream).text();
      return JSON.parse(raw);
    }
  } catch (_) {}
  const response = await fetch(FIXTURE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Demo-testopdracht kon niet worden geladen.');
  const trip = await response.json();
  await put(STORE_PATH, JSON.stringify(trip), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return trip;
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
    if (req.method === 'GET') {
      const trip = await loadTrip();
      if (trip.environment !== 'demo' || trip.tripId !== 'DEMO-EMMEN-001') {
        return send(res, 409, { error: 'Dit endpoint accepteert uitsluitend de vaste fictieve demo-opdracht.' });
      }
      return send(res, 200, trip);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || body.environment !== 'demo' || body.tripId !== 'DEMO-EMMEN-001') {
        return send(res, 400, { error: 'Alleen de vaste fictieve demo-opdracht is toegestaan.' });
      }
      if (!ALLOWED_EVENTS.has(body.eventType)) return send(res, 400, { error: 'Ongeldig type terugmelding.' });
      const trip = await loadTrip();
      const stop = trip.stops.find(item => item.stopId === body.stopId);
      if (!stop) return send(res, 404, { error: 'Teststop niet gevonden.' });
      const event = {
        eventId: 'DEMO-EVENT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
        tripId: trip.tripId,
        stopId: stop.stopId,
        eventType: body.eventType,
        occurredAt: new Date().toISOString(),
        source: 'ChauffeursHub',
      };
      trip.events = Array.isArray(trip.events) ? trip.events : [];
      trip.events.push(event);
      stop.status = body.eventType;
      await put(STORE_PATH, JSON.stringify(trip), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
      return send(res, 200, { ok: true, event, trip });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return send(res, 405, { error: 'Methode niet toegestaan.' });
  } catch (error) {
    return send(res, 500, { error: 'Serverfout bij de demo-koppeling.', detail: error?.message || 'Onbekende fout' });
  }
}
