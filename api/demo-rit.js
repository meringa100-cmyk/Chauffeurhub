import { get, put } from '@vercel/blob';

const ORIGIN = 'https://meringa100-cmyk.github.io';
const FIXTURE_URL = 'https://raw.githubusercontent.com/meringa100-cmyk/Chauffeurhub/main/integration/ritten-demo.json';
const STORE_PATH = 'demo/ritten-demo.json';
const ALLOWED_EVENTS = new Set(['picked', 'absent', 'delay', 'school', 'trip_completed']);

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
      if (body.action === 'reset') {
        const response = await fetch(FIXTURE_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error('Schone demo-testopdracht kon niet worden geladen.');
        const freshTrip = await response.json();
        if (freshTrip.environment !== 'demo' || freshTrip.tripId !== 'DEMO-EMMEN-001' || !Array.isArray(freshTrip.stops) || freshTrip.stops.some(stop => !String(stop.stopId || '').startsWith('DEMO-STOP-'))) {
          return send(res, 409, { error: 'De vaste demo-basisgegevens zijn niet geldig; reset afgebroken.' });
        }
        freshTrip.events = [];
        freshTrip.stops.forEach(stop => { stop.status = 'waiting'; });
        await put(STORE_PATH, JSON.stringify(freshTrip), {
          access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
        });
        return send(res, 200, { ok: true, message: 'Demo-opdracht schoon teruggezet.', trip: freshTrip });
      }
      if (!ALLOWED_EVENTS.has(body.eventType)) return send(res, 400, { error: 'Ongeldig type terugmelding.' });
      const trip = await loadTrip();
      if (body.eventType === 'trip_completed') {
        if (!String(body.destination || '').trim()) return send(res, 400, { error: 'School/eindbestemming ontbreekt.' });
        if (!Array.isArray(body.stopResults) || !Array.isArray(trip.stops)) {
          return send(res, 400, { error: 'De afgehandelde stops ontbreken in de afrondmelding.' });
        }
        const allowedStopIds = new Set(trip.stops.map(stop => stop.stopId));
        const supplied = new Map();
        for (const item of body.stopResults) {
          if (!item || !allowedStopIds.has(item.stopId) || !['picked', 'absent'].includes(item.status)) {
            return send(res, 400, { error: 'Ongeldige stopstatus in de afrondmelding.' });
          }
          supplied.set(item.stopId, item.status);
        }
        if (supplied.size !== trip.stops.length || trip.stops.some(stop => !supplied.has(stop.stopId))) {
          return send(res, 409, { error: 'Niet alle demo-stops zijn in ChauffeursHub afgehandeld.' });
        }
        trip.events = Array.isArray(trip.events) ? trip.events : [];
        for (const stop of trip.stops) {
          const finalStatus = supplied.get(stop.stopId);
          if (stop.status !== finalStatus) {
            trip.events.push({
              eventId: 'DEMO-EVENT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
              tripId: trip.tripId, stopId: stop.stopId, eventType: finalStatus,
              occurredAt: new Date().toISOString(), source: 'ChauffeursHub-ritafronding',
            });
            stop.status = finalStatus;
          }
        }
        const event = {
          eventId: 'DEMO-EVENT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
          tripId: trip.tripId,
          eventType: 'trip_completed',
          destination: String(body.destination).slice(0, 300),
          arrivalTime: body.arrivalTime || new Date().toISOString(),
          occurredAt: new Date().toISOString(),
          source: 'ChauffeursHub',
        };
        trip.events = Array.isArray(trip.events) ? trip.events : [];
        trip.events.push(event);
        trip.tripStatus = 'completed';
        trip.completedAt = event.occurredAt;
        trip.completedDestination = event.destination;
        await put(STORE_PATH, JSON.stringify(trip), {
          access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
        });
        return send(res, 200, { ok: true, event, trip });
      }
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
