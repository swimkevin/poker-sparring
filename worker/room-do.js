// worker/room-do.js — Cloudflare Durable Object hosting one authoritative Room.
// Each room code maps to one DO instance (via idFromName), so all players at a
// table share the same Room state. Wrangler bundles ../js/room-server.js
// directly — no code duplication: the same DOM-free Room class runs in Node
// tests, the in-page mock server, and here.
//
// NOTE: this file is the documented production path. It is not executed by
// `npm test` (see worker/README.md for deploy + free-tier notes).

import { Room, isValidRoomCode } from '../js/room-server.js';

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;              // created on first 'create' message
    this.sessions = new Map();     // ws -> {clientId, name}
  }

  async fetch(request) {
    const url = new URL(request.url);
    const m = url.pathname.match(/\/room\/([A-Za-z0-9]{6})\/ws$/);
    if (request.headers.get('Upgrade') !== 'websocket' || !m) {
      return new Response('Poker Sparring relay — connect via WebSocket at /room/<CODE>/ws?name=You', { status: 200 });
    }
    const code = m[1].toUpperCase();
    if (!isValidRoomCode(code)) return new Response('bad room code', { status: 400 });
    const name = (url.searchParams.get('name') || 'Player').slice(0, 18);
    const emoji = (url.searchParams.get('emoji') || '').slice(0, 8) || null;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation API: the socket survives DO eviction; per-socket metadata
    // rides along via serializeAttachment.
    this.state.acceptWebSocket(server);
    const clientId = 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    // The attachment must carry the room code: after a DO restart the sessions
    // map is empty and _meta() falls back to deserializeAttachment() — without
    // `code`, every message on a hibernated socket fails "Room not found".
    server.serializeAttachment({ clientId: clientId, name: name, code: code, emoji: emoji });
    this.sessions.set(server, { clientId: clientId, name: name, code: code, emoji: emoji });
    return new Response(null, { status: 101, webSocket: client });
  }

  _meta(ws) {
    let meta = this.sessions.get(ws);
    if (!meta) {
      try { meta = ws.deserializeAttachment(); } catch (e) { meta = null; }
      // Hibernated socket on a restarted DO: the sessions map is empty, so
      // re-register it — otherwise broadcasts (lobby/state) never reach it.
      if (meta) this.sessions.set(ws, meta);
    }
    return meta || null;
  }

  _getRoom(code) {
    if (!this.room) return null;
    return this.room.code === code ? this.room : null;
  }

  // Rooms live in DO storage, not just memory: idle DOs are evicted, and the
  // room must still be there when players (re)connect minutes later.
  async _ensureRoom(code) {
    if (this.room) return;
    try {
      var data = await this.state.storage.get('room');
      // The DO instance is already scoped to one room code (idFromName), so a
      // stored room is always ours; the code check is belt-and-braces.
      if (data && (!code || data.code === code)) this.room = Room.fromJSON(data);
    } catch (e) { /* storage unavailable; stay memory-only */ }
  }

  async _saveRoom() {
    try {
      if (this.room) await this.state.storage.put('room', this.room.toJSON());
    } catch (e) { /* persistence is best-effort */ }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const meta = this._meta(ws);
    if (!meta) return;
    const code = meta.code;
    await this._ensureRoom(code);

    if (msg.t === 'create') {
      if (!this.room) {
        this.room = new Room({ code: code, config: msg.config || {} });
      }
      // fall through to join below
      msg = { t: 'join', name: meta.name };
    }

    if (!this.room || this.room.code !== code) {
      ws.send(JSON.stringify({ t: 'error', message: 'Room not found. The host creates it first.' }));
      return;
    }
    const room = this.room;
    let changed = false;

    if (msg.t === 'join') {
      const r = room.addPlayer(meta.clientId, meta.name, { emoji: msg.emoji || meta.emoji || null });
      if (!r.ok) { ws.send(JSON.stringify({ t: 'error', message: r.error })); return; }
      changed = true;
    } else if (msg.t === 'start') {
      const r = room.start(meta.clientId);
      if (!r.ok) ws.send(JSON.stringify({ t: 'error', message: r.error }));
      else changed = true;
    } else if (msg.t === 'action') {
      const r = room.applyAction(meta.clientId, msg.action, msg.amount);
      if (!r.ok) ws.send(JSON.stringify({ t: 'error', message: r.error }));
      else changed = true;
    } else if (msg.t === 'pause' || msg.t === 'resume') {
      const r = room.setPaused(meta.clientId, msg.t === 'pause');
      if (!r.ok) ws.send(JSON.stringify({ t: 'error', message: r.error }));
      else changed = true;
    } else if (msg.t === 'sitout') {
      const r = room.setSitOut(meta.clientId, msg.out);
      if (!r.ok) ws.send(JSON.stringify({ t: 'error', message: r.error }));
      else changed = true;
    } else if (msg.t === 'chat') {
      const r = room.sendChat(meta.clientId, msg.text);
      if (!r.ok) ws.send(JSON.stringify({ t: 'error', message: r.error }));
      else changed = true;
    } else if (msg.t === 'rebuy') {
      const r = room.rebuy(meta.clientId);
      if (!r.ok) ws.send(JSON.stringify({ t: 'error', message: r.error }));
      else changed = true;
    } else if (msg.t === 'leave') {
      room.removePlayer(meta.clientId);
      changed = true;
      try { ws.close(1000, 'left'); } catch (e) {}
    } else {
      ws.send(JSON.stringify({ t: 'error', message: 'Unknown message.' }));
      return;
    }

    if (changed) { this.broadcast(); await this._saveRoom(); }
    this.scheduleTick();
  }

  async webSocketClose(ws, code, reason, wasClean) {
    const meta = this.sessions.get(ws);
    this.sessions.delete(ws);
    // Keep the seat: the player auto-folds on their turns and can reclaim it
    // by rejoining with the same name (Room.addPlayer reclaims ghost seats).
    if (meta && this.room) {
      this.room.setConnected(meta.clientId, false);
      this.broadcast();
      await this._saveRoom();
      this.scheduleTick();
    }
  }

  async webSocketError(ws, error) {
    this.webSocketClose(ws, 1011, 'error', false);
  }

  // Per-seat snapshots: hole cards go only to their owner.
  broadcast() {
    if (!this.room) return;
    const room = this.room;
    for (const [ws, meta] of this.sessions) {
      const p = room.playerByClientId(meta.clientId);
      if (!p) continue;
      try {
        if (room.state === 'lobby') {
          const lob = room.getLobby();
          ws.send(JSON.stringify(Object.assign({}, lob, { you: p.seat, isHost: p.isHost })));
        } else {
          ws.send(JSON.stringify(room.getSnapshot(p.seat)));
        }
      } catch (e) { /* dead socket; close handler cleans up */ }
    }
  }

  scheduleTick() {
    if (this.room && this.room.needsTick()) {
      // Re-arm the alarm loop while anything time-based is pending.
      this.state.storage.setAlarm(Date.now() + 500).catch(function () {});
    }
  }

  async alarm() {
    if (!this.room) { await this._ensureRoom(); return; }
    const changed = this.room.tick();
    if (changed) {
      await this._saveRoom();
      if (this.room.state === 'lobby') this.broadcast(); // game over -> lobby
      else this.broadcast();
    } else if (this.room.state === 'playing' && !this.room.paused && this.room.config.turnTimerSec > 0) {
      const msLeft = this.room._msLeft();
      for (const [ws] of this.sessions) {
        try { ws.send(JSON.stringify({ t: 'timer', msLeft: msLeft })); } catch (e) {}
      }
    }
    this.scheduleTick();
  }
}
