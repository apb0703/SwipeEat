/**
 * SwipeEat – Frontend
 *
 * Screens: lobby → waiting → (loading) → swipe → done
 * Real-time: WebSocket
 * Location: navigator.geolocation → /api/places/nearby (server-side Google Places)
 * Map:      Google Maps iframe embed for matched restaurant
 */

'use strict';

// ─── Register service worker (PWA) ───────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  ws:           null,
  roomCode:     null,
  username:     null,
  isHost:       false,
  places:       [],       // restaurants for this room
  cardIndex:    0,        // index of the top card
  matches:      [],       // confirmed matches
  swipedCount:  0,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const screens = {
  lobby:   $('screen-lobby'),
  waiting: $('screen-waiting'),
  loading: $('screen-loading'),
  swipe:   $('screen-swipe'),
  done:    $('screen-done'),
};

// ─── Screen transitions ───────────────────────────────────────────────────────

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}`);
  state.ws = ws;

  ws.addEventListener('message', (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    handleServerMsg(msg);
  });

  ws.addEventListener('close', () => {
    setError('Disconnected from server. Refresh to reconnect.');
  });

  ws.addEventListener('error', () => {
    setError('Connection error. Check your internet and refresh.');
  });

  return ws;
}

function wsSend(obj) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(obj));
  }
}

// ─── Server message handler ───────────────────────────────────────────────────

function handleServerMsg(msg) {
  switch (msg.type) {
    case 'joined':
      onJoined(msg);
      break;
    case 'userJoined':
      updateUserList(msg.users);
      break;
    case 'userLeft':
      updateUserList(msg.users);
      break;
    case 'places':
      onPlacesReceived(msg.places);
      break;
    case 'swipeProgress':
      // Could show per-user progress indicators – reserved for future use
      break;
    case 'match':
      onMatch(msg.place);
      break;
    case 'done':
      showScreen('done');
      break;
    case 'error':
      setError(msg.message);
      break;
  }
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

// Tab switching
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    $(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

$('btn-create').addEventListener('click', () => {
  const username = $('create-username').value.trim();
  if (!username) return setError('Please enter your name.');
  clearError();
  connectWS().addEventListener('open', () => {
    wsSend({ type: 'create', username });
  });
});

$('btn-join').addEventListener('click', () => {
  const username = $('join-username').value.trim();
  const roomCode = $('join-code').value.trim().toUpperCase();
  if (!username)  return setError('Please enter your name.');
  if (!roomCode || roomCode.length !== 4) return setError('Enter a 4-character room code.');
  clearError();
  connectWS().addEventListener('open', () => {
    wsSend({ type: 'join', username, roomCode });
  });
});

// Allow Enter key in inputs
[$('create-username'), $('join-username'), $('join-code')].forEach((input) => {
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const tabId = input.closest('.tab-content')?.id;
      if (tabId === 'tab-create') $('btn-create').click();
      if (tabId === 'tab-join')   $('btn-join').click();
    }
  });
});

function setError(msg) {
  $('lobby-error').textContent = msg;
}
function clearError() {
  $('lobby-error').textContent = '';
}

// ─── Joined handler ───────────────────────────────────────────────────────────

function onJoined(msg) {
  state.roomCode = msg.roomCode;
  state.username = msg.username;
  state.isHost   = msg.users[0] === msg.username;

  $('display-room-code').textContent = msg.roomCode;
  $('swipe-room-code').textContent   = msg.roomCode;

  updateUserList(msg.users);

  // If host joined with existing places (reconnect edge case), load them
  if (msg.places && msg.places.length > 0) {
    state.places = msg.places;
  }

  showScreen('waiting');
}

function updateUserList(users) {
  const ul = $('user-list');
  ul.innerHTML = '';
  users.forEach((u) => {
    const li = document.createElement('li');
    li.textContent = u;
    if (u === state.username) li.classList.add('me');
    ul.appendChild(li);
  });

  const countEl = $('swipe-users');
  if (countEl) countEl.textContent = `${users.length} player${users.length !== 1 ? 's' : ''}`;
}

// ─── Start button (host fetches restaurants, then pushes to room) ─────────────

$('btn-start').addEventListener('click', async () => {
  $('btn-start').disabled = true;
  showScreen('loading');
  $('loading-text').textContent = 'Getting your location…';

  let position;
  try {
    position = await getLocation();
  } catch (err) {
    $('btn-start').disabled = false;
    showScreen('waiting');
    $('location-text').textContent = `📍 ${err.message}`;
    return;
  }

  $('loading-text').textContent = 'Finding restaurants nearby…';

  const { latitude, longitude } = position.coords;
  let places;
  try {
    const res = await fetch(
      `/api/places/nearby?lat=${latitude}&lng=${longitude}&radius=1500`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    places = data.results;
    if (!places || places.length === 0) throw new Error('No restaurants found nearby. Try a larger area.');
  } catch (err) {
    $('btn-start').disabled = false;
    showScreen('waiting');
    $('location-text').textContent = `⚠ ${err.message}`;
    return;
  }

  // Host pushes places to server, which broadcasts to all in room
  wsSend({ type: 'setPlaces', places });
});

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          reject(new Error('Location permission denied. Enable it in your browser settings.'));
          break;
        case err.POSITION_UNAVAILABLE:
          reject(new Error('Location unavailable. Try again.'));
          break;
        default:
          reject(new Error('Could not get location.'));
      }
    }, { timeout: 10000, maximumAge: 60000 });
  });
}

// ─── Places received (broadcast from server) ──────────────────────────────────

function onPlacesReceived(places) {
  state.places     = places;
  state.cardIndex  = 0;
  state.swipedCount = 0;

  $('swipe-room-code').textContent = state.roomCode;
  buildCardStack();
  showScreen('swipe');
  updateProgress();
}

// ─── Card stack ───────────────────────────────────────────────────────────────

const CARD_STACK_SIZE = 3; // visible cards at once

function buildCardStack() {
  const stack = $('card-stack');
  stack.innerHTML = '';

  const end = Math.min(state.cardIndex + CARD_STACK_SIZE, state.places.length);
  for (let i = end - 1; i >= state.cardIndex; i--) {
    stack.appendChild(createCard(state.places[i], i === state.cardIndex));
  }

  if (stack.children.length === 0) {
    stack.innerHTML = '<div class="card-empty"><p>No more restaurants! 🎉</p></div>';
  }
}

function createCard(place, isTop) {
  const card = document.createElement('div');
  card.className = 'restaurant-card';
  card.dataset.placeId = place.id;

  // Photo or placeholder
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';

  if (place.photo) {
    const img = document.createElement('img');
    img.src = place.photo;
    img.alt = place.name;
    img.loading = 'lazy';
    img.onerror = () => { imgWrap.replaceChild(makePlaceholder(), img); };
    imgWrap.appendChild(img);
  } else {
    imgWrap.appendChild(makePlaceholder());
  }

  // Open/closed badge
  if (place.openNow !== null) {
    const badge = document.createElement('span');
    badge.className = `open-badge ${place.openNow ? 'open' : 'closed'}`;
    badge.textContent = place.openNow ? 'Open' : 'Closed';
    imgWrap.appendChild(badge);
  }

  // Stamps
  const likeStamp = document.createElement('div');
  likeStamp.className = 'stamp like-stamp';
  likeStamp.textContent = 'YUM!';
  const nopeStamp = document.createElement('div');
  nopeStamp.className = 'stamp nope-stamp';
  nopeStamp.textContent = 'NOPE';
  imgWrap.appendChild(likeStamp);
  imgWrap.appendChild(nopeStamp);

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('h2');
  title.textContent = place.name;
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  if (place.rating) {
    const r = document.createElement('span');
    r.className = 'badge rating';
    r.textContent = `⭐ ${place.rating} (${place.userRatingsTotal})`;
    meta.appendChild(r);
  }
  if (place.priceLevel !== null) {
    const p = document.createElement('span');
    p.className = 'badge price';
    p.textContent = '$'.repeat(place.priceLevel || 1);
    meta.appendChild(p);
  }
  place.types.slice(0, 2).forEach((t) => {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = t.replace(/_/g, ' ');
    meta.appendChild(b);
  });
  body.appendChild(meta);

  if (place.vicinity) {
    const addr = document.createElement('p');
    addr.className = 'card-address';
    addr.textContent = `📍 ${place.vicinity}`;
    body.appendChild(addr);
  }

  card.appendChild(imgWrap);
  card.appendChild(body);

  if (isTop) attachDragListeners(card);

  return card;
}

function makePlaceholder() {
  const el = document.createElement('div');
  el.className = 'card-img-placeholder';
  el.textContent = '🍴';
  return el;
}

// ─── Drag / swipe logic ───────────────────────────────────────────────────────

function attachDragListeners(card) {
  let startX = 0, startY = 0, currentX = 0, isDragging = false;
  const SWIPE_THRESHOLD = 80;

  function onStart(x, y) {
    startX = x; startY = y; currentX = 0; isDragging = true;
    card.style.transition = 'none';
  }
  function onMove(x) {
    if (!isDragging) return;
    currentX = x - startX;
    const rotate = currentX * 0.08;
    card.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;
    if (currentX > 20)  card.classList.add('dragging-right'), card.classList.remove('dragging-left');
    else if (currentX < -20) card.classList.add('dragging-left'), card.classList.remove('dragging-right');
    else card.classList.remove('dragging-right', 'dragging-left');
  }
  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    card.classList.remove('dragging-right', 'dragging-left');
    card.style.transition = '';
    if (currentX > SWIPE_THRESHOLD)       commitSwipe(true);
    else if (currentX < -SWIPE_THRESHOLD) commitSwipe(false);
    else card.style.transform = '';
  }

  // Mouse
  card.addEventListener('mousedown',  (e) => { e.preventDefault(); onStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => onMove(e.clientX));
  window.addEventListener('mouseup',   () => onEnd());

  // Touch
  card.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    onStart(t.clientX, t.clientY);
  }, { passive: true });
  card.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    // Only intercept horizontal swipes
    const dx = Math.abs(t.clientX - startX);
    const dy = Math.abs(t.clientY - startY);
    if (dx > dy) e.preventDefault();
    onMove(t.clientX);
  }, { passive: false });
  card.addEventListener('touchend', () => onEnd());
}

function commitSwipe(liked) {
  if (state.cardIndex >= state.places.length) return;

  const place = state.places[state.cardIndex];
  wsSend({ type: 'swipe', placeId: place.id, liked });

  // Animate card off screen
  const topCard = $('card-stack').firstElementChild;
  if (topCard) {
    topCard.classList.add(liked ? 'flying-right' : 'flying-left');
    topCard.addEventListener('animationend', () => {
      topCard.remove();
      advanceCard();
    }, { once: true });
  } else {
    advanceCard();
  }
}

function advanceCard() {
  state.cardIndex++;
  state.swipedCount++;
  updateProgress();

  // Add the next card to the bottom of the stack
  const nextIdx = state.cardIndex + CARD_STACK_SIZE - 1;
  if (nextIdx < state.places.length) {
    const stack = $('card-stack');
    const newCard = createCard(state.places[nextIdx], false);
    stack.appendChild(newCard);
  }

  // Reattach drag to new top card
  const stack = $('card-stack');
  const newTop = stack.firstElementChild;
  if (newTop && newTop.classList.contains('restaurant-card')) {
    // Remove stale drag listeners by cloning – simpler approach: just call attach
    // (duplicate listeners are harmless with the isDragging guard)
    attachDragListeners(newTop);
  }

  if (state.cardIndex >= state.places.length) {
    // Out of cards – server will also send 'done'
    if (stack.children.length === 0) {
      stack.innerHTML = '<div class="card-empty"><p>No more restaurants! 🎉</p></div>';
    }
  }
}

function updateProgress() {
  const total = state.places.length;
  const pct   = total > 0 ? (state.swipedCount / total) * 100 : 0;
  $('progress-bar').style.width = `${pct}%`;
}

// ─── Button swipe controls ────────────────────────────────────────────────────

$('btn-like').addEventListener('click', () => commitSwipe(true));
$('btn-nope').addEventListener('click', () => commitSwipe(false));

// ─── Match handling ───────────────────────────────────────────────────────────

function onMatch(place) {
  state.matches.push(place);
  updateMatchCount();
  showMatchOverlay(place);
}

function updateMatchCount() {
  $('match-count').textContent = state.matches.length;
  $('btn-show-matches').classList.remove('hidden');
}

function showMatchOverlay(place) {
  $('match-name').textContent    = place.name;
  $('match-thumb').src           = place.photo || '';
  $('match-thumb').style.display = place.photo ? 'block' : 'none';

  // Meta badges
  const metaEl = $('match-meta');
  metaEl.innerHTML = '';
  if (place.rating) {
    const r = document.createElement('span');
    r.className = 'badge rating';
    r.textContent = `⭐ ${place.rating}`;
    metaEl.appendChild(r);
  }
  if (place.priceLevel !== null) {
    const p = document.createElement('span');
    p.className = 'badge price';
    p.textContent = '$'.repeat(place.priceLevel || 1);
    metaEl.appendChild(p);
  }
  if (place.vicinity) {
    const a = document.createElement('span');
    a.className = 'badge';
    a.textContent = `📍 ${place.vicinity}`;
    metaEl.appendChild(a);
  }

  // Tags
  const tagsEl = $('match-tags');
  tagsEl.innerHTML = '';
  place.types.slice(0, 4).forEach((t) => {
    const span = document.createElement('span');
    span.textContent = t.replace(/_/g, ' ');
    tagsEl.appendChild(span);
  });

  // Google Maps embed
  const mapEl = $('match-map');
  mapEl.innerHTML = '';
  if (place.location) {
    const { lat, lng } = place.location;
    const src = `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = `Map showing ${place.name}`;
    iframe.allowFullscreen = true;
    iframe.setAttribute('loading', 'lazy');
    mapEl.appendChild(iframe);
  } else if (place.name) {
    // Fall back to name-based search
    const query = encodeURIComponent(place.name + ' ' + (place.vicinity || ''));
    const src   = `https://maps.google.com/maps?q=${query}&output=embed`;
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = `Map showing ${place.name}`;
    iframe.setAttribute('loading', 'lazy');
    mapEl.appendChild(iframe);
  }

  $('match-overlay').classList.remove('hidden');
}

$('btn-dismiss-match').addEventListener('click', () => {
  $('match-overlay').classList.add('hidden');
  $('match-map').innerHTML = ''; // stop iframe loading
});

// ─── Matches sidebar ──────────────────────────────────────────────────────────

$('btn-show-matches').addEventListener('click', openSidebar);
$('btn-view-matches').addEventListener('click',  openSidebar);
$('btn-close-sidebar').addEventListener('click', closeSidebar);

function openSidebar() {
  const ul = $('match-list');
  ul.innerHTML = '';
  state.matches.forEach((place) => {
    const li = document.createElement('li');
    if (place.photo) {
      const img = document.createElement('img');
      img.src  = place.photo;
      img.alt  = place.name;
      img.loading = 'lazy';
      li.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.style.cssText = 'width:52px;height:52px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;background:var(--surface2);border-radius:10px;flex-shrink:0';
      ph.textContent = '🍴';
      li.appendChild(ph);
    }
    const info = document.createElement('div');
    info.className = 'match-info';
    info.innerHTML = `<h4>${escHtml(place.name)}</h4><small>${escHtml(place.vicinity || '')}</small>`;
    li.appendChild(info);

    li.style.cursor = 'pointer';
    li.addEventListener('click', () => { closeSidebar(); showMatchOverlay(place); });
    ul.appendChild(li);
  });

  $('matches-sidebar').classList.remove('hidden');
}

function closeSidebar() {
  $('matches-sidebar').classList.add('hidden');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
