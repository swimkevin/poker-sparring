// worker/index.js — Worker entry: routes /room/<CODE>/ws to the Room Durable
// Object for that code (idFromName gives one DO instance per room code).

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{6})(\/ws)?$/);
    if (!m) {
      return new Response(
        'Poker Sparring relay — play from the Online tab: https://swimkevin.github.io/poker-sparring/',
        { status: 200, headers: { 'content-type': 'text/plain' } }
      );
    }
    const code = m[1].toUpperCase();
    const id = env.ROOM.idFromName(code);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  }
};
