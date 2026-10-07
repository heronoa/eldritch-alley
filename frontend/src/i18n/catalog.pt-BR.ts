// The reference catalog. Its keys are the `MessageKey` type, and every other locale is a partial
// map over them, so a key that only exists here is a compile error and never a silent miss.
//
// Keys are flat and prefixed with the area they belong to, which is what lets a test ask for one
// area alone. Two families build the key out of a code the engine already has, so a new code cannot
// arrive without its message: `log.rejection.*` is spelled with the `RejectReason` exactly, and
// `panel.label.*` and `action.*` with the `PanelKey` and the action id.
//
// The values are the Portuguese the game shipped with, moved here unchanged in M2. The title screen
// was moved in M1 (from `src/title/copy.ts`), and it is the only area this feature translates: M3
// wrote its English in `catalog.en-US.ts`, and every other key here is what a player who picks EN
// still reads until the game's own translation lands.

export const ptBR = {
  // The title screen. The markup keeps its own copy of these as the fallback for a page whose
  // script never runs; the screen overwrites every line from here as it loads.
  'title.document': 'Eldritch Alley: Tactics',
  'title.meta': 'SECRETARIA DE ASSUNTOS OCULTOS · OCORRÊNCIA Nº 2026/0001',
  'title.name': 'Eldritch Alley',
  'title.stampTag': 'TACTICS',
  'title.tagline':
    'Agentes licenciados, magia sem licença e uma cidade inteira de becos. Monte o seu esquadrão e responda à ocorrência.',
  'title.cta': 'Iniciar partida',
  'title.ctaBusy': 'Conectando…',
  'title.hint': 'ou pressione Enter',
  'title.granted': 'PARTIDA AUTORIZADA',
  'title.unavailable': 'Servidor indisponível',
  // The room refused the seat: another tab of this browser holds the match. Says so instead of
  // blaming the server, which is answering. See `frontend/src/net/join-failure.ts`.
  'title.occupied': 'Você já tem uma partida aberta em outra aba',
  // The match's own code did not download. The seat was granted, so this is not the server's fault.
  'title.loadFailed': 'Não foi possível carregar a partida',
  // The notice that carries the three sentences above: what it calls the failure, and how it closes.
  'title.notice.refused': 'ACESSO RECUSADO',
  'title.notice.loadFailed': 'FALHA AO CARREGAR',
  'title.notice.close': 'Fechar',
  'title.footerVersion': 'v0.1',
  'title.footerPlace': 'Belém · madrugada',
  // What the switcher is, for a screen reader. The two letters on its buttons need no translation.
  'title.language': 'Idioma',

  // The battle log. One sentence per event, and the placeholders are filled by `interpolate`.
  'log.event.moved': '{actor} moveu de {from} para {to}',
  'log.event.attacked': '{actor} acertou {target} por {damage}',
  // The same hit, told with the crate the target was crouched behind: the engine's word is cover, the
  // screen's is the fiction's (ADR 0012 § D3).
  'log.event.attackedCover': '{actor} acertou {target} por {damage}, apesar da cobertura',
  'log.event.missed': '{actor} errou',
  'log.event.reloaded': '{actor} recarregou',
  // The same action for a magic class (ADR 0011 §3): the engine calls it a reload either way, and the
  // player reads the word of their own class.
  'log.event.meditated': '{actor} meditou',
  'log.event.defeated': '{target} caiu',
  'log.event.corpseRemoved': 'Corpo de {target} removido',
  'log.event.turnEnded': 'Vez de {next}',
  'log.event.unknown': 'evento desconhecido',

  // One sentence per `RejectReason`, keyed by the code the server answers with. `unknown` is the
  // fallback for a reason this build does not know.
  'log.rejection.not-your-turn': 'Não é a sua vez',
  'log.rejection.out-of-bounds': 'Fora do tabuleiro',
  'log.rejection.cell-occupied': 'Casa ocupada',
  'log.rejection.height-step-too-high': 'Desnível alto demais',
  'log.rejection.no-path': 'Sem caminho',
  'log.rejection.already-acted': 'Ação já usada',
  'log.rejection.target-out-of-range': 'Alvo fora de alcance',
  'log.rejection.no-line-of-sight': 'Sem linha de visão',
  'log.rejection.target-invalid': 'Alvo inválido',
  'log.rejection.no-magazine': 'Sem carregador',
  // The pool of a basic attack is empty: a magazine to reload, or energy to meditate (ADR 0011). The
  // key keeps the engine's own word for the mechanism, mana; what the player reads is energy.
  'log.rejection.no-ammunition': 'Sem munição, recarregue',
  'log.rejection.no-mana': 'Sem energia, medite',
  'log.rejection.magazine-full': 'Carregador cheio',
  'log.rejection.game-over': 'Partida encerrada',
  // A command that names a round the match has left behind: the order arrived too late (EA-4).
  'log.rejection.stale-turn': 'Ordem atrasada',
  'log.rejection.malformed-action': 'Ação inválida',
  // A cancel or a confirmation of a move that is not waiting to be confirmed (EA-5).
  'log.rejection.no-pending-move': 'Nenhum movimento pendente',
  'log.rejection.unknown': 'Ação recusada',

  // The unit panel, one label per `PanelKey`, and the two words a turn row can show. The two resource
  // rows are the two kinds of pool: the Sniper's rounds stay ammunition, a magic class reads energy.
  'panel.label.hp': 'HP',
  'panel.label.movement': 'Movimento',
  'panel.label.action': 'Ação',
  'panel.label.ammo': 'Munição',
  'panel.label.reaction': 'Reação',
  'panel.label.energy': 'Energia',
  'panel.value.spent': 'Gasta',
  'panel.value.available': 'Disponível',

  // The action bar, one label per button id in `actionButtons`, and the two controls a pending move
  // floats above it (EA-5): they are not buttons of the bar, but they are read the same way.
  'action.move': 'Mover',
  'action.attack': 'Atacar',
  'action.reload': 'Recarregar',
  'action.endTurn': 'Terminar turno',
  'action.confirmMove': 'Confirmar',
  'action.cancelMove': 'Cancelar',

  // The rest of the HUD, and the lines the match shows over it: the two endings, the notice a
  // refused protocol version raises, and the two states of a dropped connection.
  'hud.legend':
    'Azul-tinta: você · Vermelho: bot · Papel: selecionado\nRealce azul: movimento · Realce vermelho: ataque',
  'hud.panel.log': 'Registro',
  'inspect.title': 'Ficha da unidade',
  'hud.back': 'Voltar ao início',
  // The banner a turn change raises, one line per side. It names the side that just took the turn
  // rather than the unit, which the carousel already tells apart.
  'hud.banner.yourTurn': 'Sua vez',
  'hud.banner.enemyTurn': 'Vez do inimigo',
  // The automatic end of turn (EA-4): the countdown, the way out of it, and the hint the button shows
  // when the feature is off.
  'hud.autoEndTurn.countdown': 'Turno encerrado em {seconds} s',
  'hud.autoEndTurn.link': 'Não passar automaticamente',
  'hud.autoEndTurn.hint': 'Nada mais a fazer: termine o turno',
  // The settings panel the gear opens: the toggle of the automatic end of turn, and the stepper of the
  // drag sensitivity (owner's request) with the value it reads between its two signs. The label of the
  // second row is drawn beside that stepper, so it stays short: a longer one runs under the −.
  'hud.settings': 'Ajustes',
  'hud.settings.autoEndTurn': 'Passar o turno automaticamente',
  'hud.settings.panSensitivity': 'Arrasto do mapa',
  'hud.settings.panSensitivity.value': '{percent}%',
  // The camera panel (EA-12): the view the camera looks from, the zoom step it is on, and the letter
  // each direction is written as — Norte, Leste, Sul, Oeste, as the prototype prints them.
  'hud.camera': 'Câmera',
  'hud.camera.view': 'VISTA {direction}',
  'hud.camera.zoom': '{step}x',
  'hud.camera.north': 'N',
  'hud.camera.east': 'L',
  'hud.camera.south': 'S',
  'hud.camera.west': 'O',
  'match.versionMismatch': 'Versão incompatível',
  'match.victory': 'Vitória',
  'match.defeat': 'Derrota',
  'match.reconnecting': 'Reconectando...',
  'match.lost': 'Partida perdida',

  // The map names, and the name of every tile the prototype draws. The server's copy of the maps
  // carries these same keys and never the text: the name is the client's to translate.
  'map.street.title': 'Rua do Comércio e beco',
  'map.park.title': 'Praça Municipal nº 3',
  'map.roof.title': 'Edifício Central, cobertura',
  'terrain.a': 'asfalto',
  'terrain.s': 'calçada',
  'terrain.x': 'beco',
  'terrain.d': 'plataforma de carga',
  'terrain.g': 'grama',
  'terrain.p': 'caminho',
  'terrain.w': 'lago',
  'terrain.q': 'praça',
  'terrain.r': 'laje',
  'terrain.R': 'cascalho do telhado',
  'terrain.B': 'prédio (bloqueado)',
  'terrain.z': 'faixa de pedestres',
  'terrain.f': 'estacionamento cercado (bloqueado)',
  'terrain.h': 'casa de máquinas (bloqueado)',
  'terrain.b': 'tábua sobre o vão',
  'terrain.k': 'telhado vizinho',
  'terrain.v': 'vão entre prédios',
} as const;

/** Every message the client can show. Defined by the reference catalog, never by the translations. */
export type MessageKey = keyof typeof ptBR;
