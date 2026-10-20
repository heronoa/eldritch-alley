// Bootstrap for the match server: one Colyseus server with the battle room, and nothing else.
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ENGINE_VERSION } from '@eldritch-alley/engine';
import { Server } from 'colyseus';
import { BattleRoom, DEFAULT_MAX_CONCURRENT_MATCHES } from './battle-room';
import { readMaxConcurrentMatches, readPort, readPublicKey, readQueueUrl } from './config';
import { ROOM_NAME } from './protocol';
import { sqsPublisherFromEnvironment } from './queue';

const port = readPort(process.env.GAME_SERVER_PORT, 2567);
const maxConcurrentMatches = readMaxConcurrentMatches(
  process.env.GAME_SERVER_MAX_MATCHES,
  DEFAULT_MAX_CONCURRENT_MATCHES,
);
const publicKey = readPublicKey(process.env.GAME_TICKET_PUBLIC_KEY);
const publisher = sqsPublisherFromEnvironment(readQueueUrl(process.env.MATCH_ENDED_QUEUE_URL));

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

// The third argument is the room's default options, which `onCreate` always sees merged over
// whatever a client's own join options claim — so a client cannot raise its own cap this way, and
// cannot hand the room a public key of its own to check a ticket against.
gameServer.define(ROOM_NAME, BattleRoom, {
  maxConcurrentMatches,
  publisher,
  publicKey,
});

gameServer.listen(port).then(() => {
  console.log(
    `game-server (engine ${ENGINE_VERSION}) listening on port ${port}, up to ${maxConcurrentMatches} matches at once`,
  );

  // Said out loud rather than left to be discovered: without the platform's key every join is a
  // guest's, and every match a signed-in player finishes goes unrecorded.
  if (publicKey === undefined) {
    console.warn(
      'game-server: GAME_TICKET_PUBLIC_KEY is not set, so every player joins as a guest and no match is recorded',
    );
  }
});
