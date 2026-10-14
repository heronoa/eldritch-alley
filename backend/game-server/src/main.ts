// Bootstrap for the match server: one Colyseus server with the battle room, and nothing else.
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ENGINE_VERSION } from '@eldritch-alley/engine';
import { Server } from 'colyseus';
import { BattleRoom, DEFAULT_MAX_CONCURRENT_MATCHES } from './battle-room';
import { readMaxConcurrentMatches, readPort } from './config';
import { ROOM_NAME } from './protocol';

const port = readPort(process.env.GAME_SERVER_PORT, 2567);
const maxConcurrentMatches = readMaxConcurrentMatches(
  process.env.GAME_SERVER_MAX_MATCHES,
  DEFAULT_MAX_CONCURRENT_MATCHES,
);

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

// The third argument is the room's default options, which `onCreate` always sees merged over
// whatever a client's own join options claim — a client cannot raise its own cap this way.
gameServer.define(ROOM_NAME, BattleRoom, { maxConcurrentMatches });

gameServer.listen(port).then(() => {
  console.log(
    `game-server (engine ${ENGINE_VERSION}) listening on port ${port}, up to ${maxConcurrentMatches} matches at once`,
  );
});
