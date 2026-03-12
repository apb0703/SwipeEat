/**
 * Swipe2Dine – Server
 *
 * Security layers:
 *  • Helmet sets hardened HTTP headers (CSP, HSTS, X-Frame-Options, …)
 *  • express-rate-limit throttles REST endpoints
 *  • All Google Places API calls are proxied server-side (key never sent to client)
 *  • All WebSocket inputs are validated and length-capped before use
 *  • Room codes are cryptographically random (crypto.randomInt)
 */

'use strict';

const express      = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const crypto       = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT               = Number(process.env.PORT) || 3000;
const GOOGLE_PLACES_KEY  = process.env.GOOGLE_PLACES_KEY || '';
const PLACES_BASE        = 'https://maps.googleapis.com/maps/api/place';
const MAX_PLACES_RESULTS = 20;

// ─── Express setup ────────────────────────────────────────────────────────────

const app = express();

// Helmet – secure HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", 'maps.googleapis.com', 'maps.gstatic.com'],
        styleSrc:   ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc:    ["'self'", 'fonts.gstatic.com'],
        imgSrc:     ["'self'", 'data:', 'maps.googleapis.com', 'maps.gstatic.com',
                     '*.googleapis.com', '*.gstatic.com', 'lh3.googleusercontent.com'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        frameSrc:   ["'none'"],
        objectSrc:  ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // needed for Google Maps iframes
  })
);

// Rate limiter – REST endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use('/api/', apiLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Google Places proxy endpoints ───────────────────────────────────────────
// The API key is injected server-side so it is never exposed to clients.

app.get('/api/places/nearby', async (req, res) => {
  if (!GOOGLE_PLACES_KEY) {
    return res.status(503).json({ error: 'Google Places API key not configured on server.' });
  }

  const { lat, lng, radius = 1500 } = req.query;

  // Validate numeric inputs
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  const radN = Math.min(Math.max(parseInt(radius, 10), 500), 5000);

  if (Number.isNaN(latN) || Number.isNaN(lngN)) {
    return res.status(400).json({ error: 'Invalid lat/lng.' });
  }

  try {
    const url = new URL(`${PLACES_BASE}/nearbysearch/json`);
    url.searchParams.set('location', `${latN},${lngN}`);
    url.searchParams.set('radius',    String(radN));
    url.searchParams.set('type',      'restaurant');
    url.searchParams.set('key',       GOOGLE_PLACES_KEY);

    const upstream = await fetch(url.toString());
    if (!upstream.ok) throw new Error(`Places API HTTP ${upstream.status}`);
    const data = await upstream.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(502).json({ error: `Places API error: ${data.status}` });
    }

    // Sanitise – only forward fields the client needs
    const results = (data.results || []).slice(0, MAX_PLACES_RESULTS).map((p) => ({
      id:         p.place_id,
      name:       p.name,
      rating:     p.rating || null,
      userRatingsTotal: p.user_ratings_total || 0,
      priceLevel: p.price_level ?? null,
      vicinity:   p.vicinity || '',
      location:   p.geometry?.location || null,
      photo:      p.photos?.[0]?.photo_reference
                    ? `/api/places/photo?ref=${encodeURIComponent(p.photos[0].photo_reference)}`
                    : null,
      types:      (p.types || []).filter((t) => t !== 'establishment' && t !== 'point_of_interest'),
      openNow:    p.opening_hours?.open_now ?? null,
      isOpen:     p.business_status === 'OPERATIONAL',
    }));

    res.json({ results });
  } catch (err) {
    console.error('Places nearby error:', err.message);
    res.status(500).json({ error: 'Failed to fetch nearby restaurants.' });
  }
});

app.get('/api/places/photo', async (req, res) => {
  if (!GOOGLE_PLACES_KEY) return res.status(503).end();

  const ref = String(req.query.ref || '').slice(0, 500);
  if (!ref) return res.status(400).end();

  try {
    const url = new URL(`${PLACES_BASE}/photo`);
    url.searchParams.set('photoreference', ref);
    url.searchParams.set('maxwidth',       '600');
    url.searchParams.set('key',            GOOGLE_PLACES_KEY);

    const upstream = await fetch(url.toString());
    if (!upstream.ok) return res.status(upstream.status).end();

    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    upstream.body.pipe(res);
  } catch (err) {
    console.error('Places photo error:', err.message);
    res.status(500).end();
  }
});

// ─── WebSocket server ─────────────────────────────────────────────────────────

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ─── Room management ──────────────────────────────────────────────────────────

/**
 * rooms: Map<roomCode, {
 *   places: Place[],            // restaurants for this room
 *   users:  Map<username, { ws, swipes: Map<placeId, boolean> }>
 * }>
 */
const rooms = new Map();

// Cryptographically random 4-char room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

function sanitiseString(val, maxLen = 64) {
  return String(val ?? '').trim().slice(0, maxLen).replace(/[<>"'`]/g, '');
}

function roomUserList(room) {
  return [...room.users.keys()];
}

function checkForMatch(room, placeId) {
  if (room.users.size < 2) return false;
  for (const [, user] of room.users) {
    if (!user.swipes.get(placeId)) return false;
  }
  return true;
}

// ─── WebSocket helpers ────────────────────────────────────────────────────────

function send(ws, msg) {
  if (ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptUsername = null) {
  for (const [username, user] of room.users) {
    if (username !== exceptUsername) send(user.ws, msg);
  }
}

function broadcastAll(room, msg) {
  for (const [, user] of room.users) send(user.ws, msg);
}

// ─── WebSocket rate-limiting ──────────────────────────────────────────────────

const WS_RATE_LIMIT = 60;         // max messages per window
const WS_RATE_WINDOW = 10_000;    // 10 s

// ─── Message handlers ─────────────────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  let currentRoom     = null;
  let currentUsername = null;

  // Per-connection rate limiting
  let msgCount  = 0;
  const rlTimer = setInterval(() => { msgCount = 0; }, WS_RATE_WINDOW);

  ws.on('message', async (raw) => {
    // Rate limit
    if (++msgCount > WS_RATE_LIMIT) {
      return send(ws, { type: 'error', message: 'Too many messages. Slow down.' });
    }

    // Parse + size guard
    if (raw.length > 4096) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (typeof msg !== 'object' || msg === null) return;

    const msgType = sanitiseString(msg.type, 20);

    // ── create ────────────────────────────────────────────────────────────────
    if (msgType === 'create') {
      const username = sanitiseString(msg.username, 24);
      if (!username) return send(ws, { type: 'error', message: 'Username required.' });
      if (currentRoom)  return send(ws, { type: 'error', message: 'Already in a room.' });

      let code;
      let attempts = 0;
      do {
        code = generateRoomCode();
        if (++attempts > 100) return send(ws, { type: 'error', message: 'Server busy. Try again.' });
      } while (rooms.has(code));

      const room = { places: [], users: new Map() };
      room.users.set(username, { ws, swipes: new Map() });
      rooms.set(code, room);
      currentRoom     = code;
      currentUsername = username;

      send(ws, { type: 'joined', roomCode: code, username, users: [username], places: [] });
    }

    // ── join ──────────────────────────────────────────────────────────────────
    else if (msgType === 'join') {
      const username = sanitiseString(msg.username, 24);
      const code     = sanitiseString(msg.roomCode, 4).toUpperCase();
      if (!username) return send(ws, { type: 'error', message: 'Username required.' });
      if (!code)     return send(ws, { type: 'error', message: 'Room code required.' });
      if (currentRoom) return send(ws, { type: 'error', message: 'Already in a room.' });

      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'error', message: `Room "${code}" not found.` });
      if (room.users.has(username))
        return send(ws, { type: 'error', message: `Name "${username}" is taken in this room.` });
      if (room.users.size >= 8)
        return send(ws, { type: 'error', message: 'Room is full (max 8 players).' });

      room.users.set(username, { ws, swipes: new Map() });
      currentRoom     = code;
      currentUsername = username;

      send(ws, {
        type: 'joined', roomCode: code, username,
        users: roomUserList(room), places: room.places,
      });
      broadcast(room, { type: 'userJoined', username, users: roomUserList(room) }, username);
    }

    // ── setPlaces (host pushes restaurant list after geolocation) ─────────────
    else if (msgType === 'setPlaces') {
      if (!currentRoom || !currentUsername) return;
      const room = rooms.get(currentRoom);
      if (!room) return;

      // Only the first user (host) can set places, and only once
      if (room.places.length > 0) return;
      if ([...room.users.keys()][0] !== currentUsername) return;

      const places = Array.isArray(msg.places) ? msg.places.slice(0, MAX_PLACES_RESULTS) : [];
      // Light validation – each entry must have id and name strings
      const validated = places.filter(
        (p) => p && typeof p.id === 'string' && typeof p.name === 'string'
      ).map((p) => ({
        id:         sanitiseString(p.id, 200),
        name:       sanitiseString(p.name, 120),
        rating:     typeof p.rating === 'number' ? p.rating : null,
        userRatingsTotal: typeof p.userRatingsTotal === 'number' ? p.userRatingsTotal : 0,
        priceLevel: typeof p.priceLevel === 'number' ? p.priceLevel : null,
        vicinity:   sanitiseString(p.vicinity, 200),
        location:   (p.location && typeof p.location.lat === 'number')
                      ? { lat: p.location.lat, lng: p.location.lng }
                      : null,
        photo:      p.photo ? sanitiseString(p.photo, 300) : null,
        types:      Array.isArray(p.types) ? p.types.slice(0, 5).map((t) => sanitiseString(t, 40)) : [],
        openNow:    typeof p.openNow === 'boolean' ? p.openNow : null,
        isOpen:     typeof p.isOpen === 'boolean' ? p.isOpen : true,
      }));

      room.places = validated;
      broadcastAll(room, { type: 'places', places: validated });
    }

    // ── swipe ─────────────────────────────────────────────────────────────────
    else if (msgType === 'swipe') {
      if (!currentRoom || !currentUsername) return;
      const room = rooms.get(currentRoom);
      if (!room) return;

      const placeId = sanitiseString(msg.placeId, 200);
      const liked   = Boolean(msg.liked);
      const user    = room.users.get(currentUsername);
      if (!user || !room.places.find((p) => p.id === placeId)) return;

      user.swipes.set(placeId, liked);
      broadcast(room, { type: 'swipeProgress', username: currentUsername, placeId, liked }, currentUsername);

      if (liked && checkForMatch(room, placeId)) {
        const place = room.places.find((p) => p.id === placeId);
        broadcastAll(room, { type: 'match', place });
      }

      const allSwiped = room.places.every((p) => user.swipes.has(p.id));
      if (allSwiped) send(ws, { type: 'done' });
    }

    // ── ping ──────────────────────────────────────────────────────────────────
    else if (msgType === 'ping') {
      send(ws, { type: 'pong' });
    }
  });

  ws.on('close', () => {
    clearInterval(rlTimer);
    if (!currentRoom || !currentUsername) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.users.delete(currentUsername);
    if (room.users.size === 0) {
      rooms.delete(currentRoom);
    } else {
      broadcast(room, { type: 'userLeft', username: currentUsername, users: roomUserList(room) });
    }
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Swipe2Dine running at http://localhost:${PORT}`);
  if (!GOOGLE_PLACES_KEY) {
    console.warn('⚠  GOOGLE_PLACES_KEY not set – set it in .env or environment variables.');
  }
});
