// Bootstrap do servidor de partidas.
// As salas (BattleRoom), a sincronização e o bot entram nos próximos passos.
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ENGINE_VERSION } from '@mystic-alley/engine';

const port = Number(process.env.GAME_SERVER_PORT ?? 2567);

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

gameServer.listen(port).then(() => {
  console.log(`game-server (engine ${ENGINE_VERSION}) ouvindo na porta ${port}`);
});
