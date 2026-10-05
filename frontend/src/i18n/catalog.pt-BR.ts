// The reference catalog. Its keys are the `MessageKey` type, and every other locale is a partial
// map over them, so a key that only exists here is a compile error and never a silent miss.
//
// Keys are flat and prefixed with the area they belong to, which is what lets a test ask for one
// area alone. Two families build the key out of a code the engine already has, so a new code cannot
// arrive without its message: `log.rejection.*` is spelled with the `RejectReason` exactly, and
// `panel.label.*` and `action.*` with the `PanelKey` and the action id.
//
// The values are the Portuguese the game shipped with, moved here unchanged in M2. The title screen
// was moved in M1 (from `src/title/copy.ts`), and it is the only area this feature translates.

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
  'title.footerVersion': 'v0.1',
  'title.footerPlace': 'Belém · madrugada',

  // The battle log. One sentence per event, and the placeholders are filled by `interpolate`.
  'log.event.moved': '{actor} moveu de {from} para {to}',
  'log.event.attacked': '{actor} acertou {target} por {damage}',
  'log.event.missed': '{actor} errou',
  'log.event.reloaded': '{actor} recarregou',
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
  'log.rejection.not-enough-movement': 'Movimento insuficiente',
  'log.rejection.already-acted': 'Ação já usada',
  'log.rejection.target-out-of-range': 'Alvo fora de alcance',
  'log.rejection.target-invalid': 'Alvo inválido',
  'log.rejection.no-magazine': 'Sem carregador',
  'log.rejection.magazine-full': 'Carregador cheio',
  'log.rejection.not-adjacent': 'Casa não adjacente',
  'log.rejection.game-over': 'Partida encerrada',
  'log.rejection.malformed-action': 'Ação inválida',
  'log.rejection.unknown': 'Ação recusada',

  // The unit panel, one label per `PanelKey`, and the two words a turn row can show.
  'panel.label.hp': 'HP',
  'panel.label.movement': 'Movimento',
  'panel.label.action': 'Ação',
  'panel.label.ammo': 'Munição',
  'panel.label.reaction': 'Reação',
  'panel.label.mana': 'Mana',
  'panel.value.spent': 'Gasta',
  'panel.value.available': 'Disponível',

  // The action bar, one label per button id in `actionButtons`.
  'action.move': 'Mover',
  'action.attack': 'Atacar',
  'action.reload': 'Recarregar',
  'action.endTurn': 'Terminar turno',

  // The rest of the HUD, and the lines the match shows over it: the two endings, the notice a
  // refused protocol version raises, and the two states of a dropped connection.
  'hud.legend':
    'Azul-tinta: você · Vermelho: bot · Papel: selecionado\nRealce azul: movimento · Realce vermelho: ataque',
  'hud.panel.unit': 'Unidade',
  'hud.panel.log': 'Registro',
  'hud.back': 'Voltar ao início',
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
