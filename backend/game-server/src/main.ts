// Bootstrap for the match server: one Colyseus server with the battle room, and nothing else.
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ENGINE_VERSION } from '@eldritch-alley/engine';
import { Server } from 'colyseus';
import { BattleRoom } from './battle-room';
import { readPort } from './config';
import { ROOM_NAME } from './protocol';

const port = readPort(process.env.GAME_SERVER_PORT, 2567);

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

gameServer.define(ROOM_NAME, BattleRoom);

gameServer.listen(port).then(() => {
  console.log(`game-server (engine ${ENGINE_VERSION}) listening on port ${port}`);
});
