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

  // The onboarding: the cards of the admission test, read once before the first match. One heading and
  // one body per card, keyed by the id the sequence gives it (`src/onboarding/content.ts`), plus the
  // four controls and the footer link of the title that opens the sequence again. The wording is the
  // owner's to review before the milestone closes.
  'onboarding.story-incident.heading': 'Ocorrência aberta',
  'onboarding.story-incident.body':
    'A Secretaria de Assuntos Ocultos abriu uma ocorrência no beco atrás do mercado: magia sem licença, três testemunhas e nenhuma explicação que fique de pé.',
  'onboarding.story-admission.heading': 'O teste de admissão',
  'onboarding.story-admission.body':
    'A Agência de Controle do Sobrenatural licencia quem pode usar magia na cidade. Não há prova escrita: a sua admissão é a partida que você vai jogar agora.',
  // The three classes the match actually fields, named the way the game names them: the advanced
  // classes are what ships (`sniper`, `wizard`, `priest` in `backend/game-server/src/map.ts`), while
  // the pitch's own opening line names the base classes they are promoted from.
  'onboarding.story-squad.heading': 'O seu esquadrão',
  'onboarding.story-squad.body':
    'Você entra no beco com três agentes — um sniper, um wizard e um priest. Cada um traz a sua classe, a sua arma ou a sua magia, e a sua própria noção de risco.',

  'onboarding.grid-and-height.heading': 'A grade tem altura',
  'onboarding.grid-and-height.body':
    'O mapa é uma grade de casas, e cada casa tem um nível: calçada, primeiro andar, telhado. Subir custa movimento, e cada classe sobe um tanto por passo. Quem está mais alto vê mais longe, atira mais longe e acerta melhor.',
  'onboarding.initiative-order.heading': 'A fila de iniciativa',
  'onboarding.initiative-order.body':
    'A ordem das vezes vem da velocidade de cada unidade e fica visível para os dois lados, na fila no alto da tela. Na vez de uma unidade, ela pode mover e agir, na ordem que você quiser.',
  'onboarding.move-and-attack.heading': 'Mover e atacar',
  'onboarding.move-and-attack.body':
    'Escolha Mover para ver as casas ao alcance e clique na que quiser; escolha Atacar e clique no alvo. As costas e o flanco do inimigo rendem bônus de acerto e de dano — a direção para a qual ele olha importa.',
  'onboarding.ammo-and-reload.heading': 'Munição e energia',
  'onboarding.ammo-and-reload.body':
    'Quem luta com arma gasta munição e a repõe em Recarregar; quem luta com magia gasta energia, que volta aos poucos a cada rodada pela mesma ação — o registro da partida chama isso de meditar. Os pips sobre a unidade mostram o que ainda resta.',
  'onboarding.cover-and-chance.heading': 'Cobertura e chance de acerto',
  'onboarding.cover-and-chance.body':
    'Paredes, carros e caixotes dão cobertura e cortam a linha de visão: um tiro contra cobertura acerta menos. Aponte para um alvo e a badge verde sobre ele mostra a chance daquele tiro, em porcentagem, antes de você atirar.',
  'onboarding.abilities.heading': 'Habilidades',
  'onboarding.abilities.body':
    'Cada classe carrega habilidades: magias de área, curas, golpes próprios. O botão Habilidade abre a lista, mostra o custo de cada uma e desenha no mapa as casas que ela alcança antes de você confirmar.',
  // The account card: optional for a guest, what an account keeps, and how to sign in. It closes the
  // sequence because it is about keeping the squad, not about the first match.
  'onboarding.account.heading': 'A sua conta',
  'onboarding.account.body':
    'Você pode jogar como visitante. Com uma conta, o esquadrão e o histórico de batalhas ficam guardados, e você continua de outro aparelho; avisos de novidades e novas versões só chegam se você marcar a opção no perfil. O botão Entrar fica no canto superior da tela: dá para criar a conta com e-mail e senha, GitHub, Google ou SSO.',

  'onboarding.advance': 'Continuar',
  'onboarding.back': 'Voltar',
  'onboarding.skip': 'Pular',
  'onboarding.finish': 'Concluir',
  // The footer link of the title, which reopens the sequence: a question, never a first visit.
  'onboarding.howToPlay': 'Como jogar',

  // The account (m4-04): the control in the corner, the sign-in dialog, the profile and the history.
  // The failure lines are one per code a player can act on, read by `account/auth-flow.ts`; the two
  // forms say the same sentence for a known and an unknown address, which is the anti-enumeration
  // answer of the whole flow.
  'account.control': 'Conta',
  'account.dialog.title': 'Conta',
  'account.signIn': 'Entrar',
  'account.signOut': 'Sair',
  'account.close': 'Fechar',
  'account.tab.signIn': 'Entrar',
  'account.tab.signUp': 'Criar conta',
  'account.tab.forgot': 'Esqueci a senha',
  'account.providers': 'Entrar com',
  'account.provider.keycloak': 'SSO',
  'account.provider.github': 'GitHub',
  'account.provider.google': 'Google',
  'account.field.email': 'Endereço de e-mail',
  'account.field.password': 'Senha',
  'account.field.confirmation': 'Repita a senha',
  'account.field.displayName': 'Nome de agente',
  'account.password.hint': 'De 12 a 128 caracteres',
  'account.submit.signIn': 'Entrar',
  'account.submit.signUp': 'Criar conta',
  'account.submit.forgot': 'Enviar o link',
  'account.checkMail.heading': 'Verifique o seu e-mail',
  'account.checkMail.body':
    'Se este endereço tiver conta, o link já está a caminho. Abra-o neste navegador.',
  'account.checkMail.back': 'Voltar',
  'account.problem.invalidCredentials': 'Endereço ou senha incorretos',
  'account.problem.emailNotVerified': 'Confirme o seu e-mail antes de entrar',
  'account.problem.tooManyAttempts': 'Muitas tentativas. Espere alguns minutos.',
  'account.problem.offline': 'O serviço não respondeu',
  'account.problem.unknown': 'Não foi possível completar o pedido',
  'account.problem.invalidPassword': 'A senha tem de ter entre 12 e 128 caracteres',
  'account.problem.invalidBody': 'Confira o que foi preenchido',
  'account.problem.tooShort': 'A senha tem de ter pelo menos 12 caracteres',
  'account.problem.tooLong': 'A senha não pode passar de 128 caracteres',
  'account.problem.mismatch': 'As duas senhas não conferem',
  'account.profile.title': 'Perfil',
  'account.profile.agents': 'Esquadrão',
  'account.profile.noAgents': 'Nenhum agente registrado',
  'account.profile.level': 'nível {level}',
  'account.history': 'Histórico',
  'account.history.title': 'Histórico de batalhas',
  'account.history.empty': 'Nenhuma batalha registrada ainda',
  'account.history.loadMore': 'Carregar mais',
  'account.history.loading': 'Carregando…',
  'account.history.failure': 'Não foi possível carregar o histórico',
  'account.history.rounds': '{rounds} rodadas',
  'account.history.won': 'Vitória',
  'account.history.lost': 'Derrota',
  // The release e-mails (m4-05, D6): the consent is off until the player presses it, and the label is
  // the only line the checkbox needs.
  'account.releaseEmails.label': 'Receber novidades e novas versões por e-mail',

  // The security card and the deletion confirmation. The confirmation word is not copy: `DELETE` is
  // spelled the same in both languages because it is the token the platform checks
  // (`frontend/src/account/delete-account.ts`).
  'account.security.label': 'Segurança',
  'account.security.methods.password': 'Entra com e-mail e senha',
  'account.security.methods.provider': 'Entra por um provedor de identidade',
  'account.security.delete': 'Excluir conta',
  'account.delete.title': 'Excluir conta',
  'account.delete.warning':
    'A conta, o esquadrão e o histórico de batalhas serão apagados. Não é possível desfazer.',
  'account.delete.confirmLabel': 'Digite DELETE para confirmar',
  'account.delete.submit': 'Excluir conta',
  'account.delete.cancel': 'Cancelar',
  'account.delete.problem.confirmation': 'Digite DELETE exatamente como está escrito',
  'account.delete.problem.password': 'Senha incorreta',
  'account.delete.problem.signedOut': 'A sessão terminou. Entre outra vez.',

  // The two pages a mailed link lands on. The link only opens the page: the token is spent on a press
  // (ADR 0021 § D12), which is why each page carries the sentence that asks for one.
  'mail.verify.heading': 'Confirmar o seu e-mail',
  'mail.verify.body': 'Clique no botão para confirmar este endereço e entrar na sua conta.',
  'mail.verify.action': 'Confirmar endereço',
  'mail.verify.working': 'Confirmando…',
  'mail.verify.doneHeading': 'Endereço confirmado',
  'mail.verify.doneBody': 'A sua conta está pronta. Volte ao início e comece uma partida.',
  'mail.reset.heading': 'Escolher nova senha',
  'mail.reset.body': 'Escolha uma senha de 12 a 128 caracteres.',
  'mail.reset.action': 'Guardar a senha',
  'mail.reset.working': 'Guardando…',
  'mail.reset.doneHeading': 'Senha alterada',
  'mail.reset.doneBody': 'Já pode entrar com a nova senha.',
  'mail.invalid.heading': 'Este link já não vale',
  'mail.invalid.body': 'Os links valem uma vez. Peça outro no início do jogo.',
  'mail.missing.heading': 'Link incompleto',
  'mail.missing.body': 'Este endereço não trouxe um token. Abra o link do e-mail outra vez.',
  'mail.back': 'Voltar ao início',

  // The contact form (m4-05): the one unauthenticated write in the client. Each failure says what the
  // player can do about it — the challenge is retried, the limit is waited out, an outage is retried
  // later — and the field lines name the field that stopped the form before any request existed.
  'contact.open': 'Contato',
  'contact.title': 'Contato',
  'contact.field.name': 'Seu nome',
  'contact.field.email': 'Endereço de e-mail',
  'contact.field.message': 'Mensagem',
  'contact.submit': 'Enviar',
  'contact.sending': 'Enviando…',
  'contact.close': 'Fechar',
  'contact.privacyLabel': 'Política de privacidade',
  'contact.sent.heading': 'Mensagem enviada',
  'contact.sent.body': 'Obrigado. Vamos responder pelo endereço que você deixou.',
  'contact.problem.name': 'Escreva o seu nome',
  'contact.problem.email': 'Informe um endereço de e-mail válido',
  'contact.problem.message': 'Escreva uma mensagem de até 5000 caracteres',
  'contact.problem.rateLimited': 'Muitas mensagens. Tente de novo mais tarde.',
  'contact.problem.challengeFailed': 'A verificação não passou. Tente de novo.',
  'contact.problem.offline': 'O serviço não respondeu. Tente de novo.',
  'contact.problem.unknown': 'Não foi possível enviar a mensagem.',
  // The footer's third link, next to the contact one.
  'privacy.link': 'Privacidade',

  // The battle log. One sentence per event, and the placeholders are filled by `interpolate`.
  'log.event.moved': '{actor} moveu de {from} para {to}',
  // A pending move taken back or confirmed (EA-5); the walk itself is `moved`.
  'log.event.moveCancelled': '{actor} cancelou o movimento',
  'log.event.moveCommitted': '{actor} confirmou o movimento',
  'log.event.attacked': '{actor} acertou {target} por {damage}',
  // The same shot told with the crate one of the two ends was behind: the engine's word is cover, the
  // screen's is the fiction's (ADR 0012 § D3). Which end it was is the whole difference between the
  // four pairs, and the shooter's own cover is read on the board, because the event carries only the
  // target's (ADR 0012 § D4, ADR 0013).
  'log.event.attackedCover': '{actor} acertou {target} por {damage} em cobertura',
  'log.event.missed': '{actor} errou {target}',
  'log.event.missedCover': '{actor} errou {target} em cobertura',
  'log.event.attackedFromCover': '{actor}, em cobertura, acertou {target} por {damage}',
  'log.event.missedFromCover': '{actor}, em cobertura, errou {target}',
  'log.event.attackedBothCover':
    '{actor}, em cobertura, acertou {target} por {damage}, que também estava em cobertura',
  'log.event.missedBothCover': '{actor}, em cobertura, errou {target}, que também estava em cobertura',
  'log.event.reloaded': '{actor} recarregou',
  // The same action for a magic class (ADR 0011 §3): the engine calls it a reload either way, and the
  // player reads the word of their own class.
  'log.event.meditated': '{actor} meditou',
  'log.event.defeated': '{target} caiu',
  'log.event.corpseRemoved': 'Corpo de {target} removido',
  'log.event.turnEnded': 'Vez de {next}',
  'log.event.regained': '{actor} recuperou {amount} de mana',
  // The use of an ability (ADR 0016): the action names a cell, never a unit, so the sentence shows the
  // position the same way every other event that names one does. The two outcomes of the use follow as
  // events of their own: one `damaged` per body the effect reached, and one `healed` per body a heal
  // covered.
  'log.event.ability-used': '{actor} usou uma habilidade em {cell}',
  // The same use with the ability named (EA-16): the sentence says what was cast, by the word the
  // catalogs give the id. An id this build has no word for keeps the sentence above (D7).
  'log.event.ability-used-named': '{actor} usou {ability} em {cell}',
  'log.event.damaged': '{target} sofreu {damage} de dano',
  'log.event.healed': '{target} recuperou {amount} de vida',
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
  // An ability the caster's own slots do not name, or the catalog has no definition for (ADR 0016 §7).
  'log.rejection.ability-unknown': 'Habilidade desconhecida',
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
  // The one active ability of the class (ADR 0016). It is the class's own, so the button is named for
  // what it does rather than for the ability. The menu it opens carries the same heading (EA-16).
  'action.ability': 'Habilidade',
  'action.reload': 'Recarregar',
  'action.endTurn': 'Terminar turno',
  'action.confirmMove': 'Confirmar',
  'action.cancelMove': 'Cancelar',
  // Shown instead, in place of the label above, while the turn still has something left to do and
  // End Turn is asking once before it is sent (M4 playtest fix, P3).
  'action.confirmEndTurn': 'Confirma?',

  // The abilities (EA-16): one word per id this build knows, and the fragments the menu composes the
  // effect line from. The engine never learns a name (ADR 0016 §13) — the id is an opaque string and
  // the words live here, which is the split ADR 0009 draws. An id with no word is named by itself in
  // the menu and by the generic sentence in the log: the catalog travels with the match (ADR 0016 §3),
  // so a newer server can ship an ability this build cannot name.
  'ability.piercing-shot': 'Tiro Perfurante',
  'ability.fireball': 'Bola de Fogo',
  'ability.area-heal': 'Cura em Área',
  'ability.detail.damage': 'Dano {amount}',
  'ability.detail.heal': 'Cura {amount}',
  'ability.detail.radius': 'raio {radius}',
  // The cover of an area only means something to a roll, and only a damage effect rolls (ADR 0016 §9).
  'ability.detail.ignoresCover': 'ignora cobertura',
  // A damage effect that covers more than one cell hurts every body in it, the caster's own side
  // included (ADR 0016 §12): the rule the player has to read before aiming.
  'ability.detail.hitsAllies': 'atinge todos, inclusive aliados',

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
  // The settings panel the gear opens: the toggle of the automatic end of turn, the stepper of the
  // drag sensitivity (owner's request) with the value it reads between its two signs, and the checkbox
  // of the marks of the rules (owner's request, EA-15). The label of the second row is drawn beside
  // that stepper, so it stays short: a longer one runs under the −.
  'hud.settings': 'Ajustes',
  'hud.settings.autoEndTurn': 'Passar o turno automaticamente',
  'hud.settings.panSensitivity': 'Arrasto do mapa',
  'hud.settings.panSensitivity.value': '{percent}%',
  'hud.settings.highlightCovers': 'Realçar Coberturas',
  // The battle report (EA-17): the modal that opens the moment a match ends, with the whole log, a
  // scroll and a plain-text export — the dashboard's six lines are not the only view of a fight.
  'hud.report.title': 'Registro da partida',
  'hud.report.export': 'Baixar .txt',
  'hud.report.reopen': 'Ver registro completo',
  'hud.report.range': '{from}–{to} de {total}',
  // The odds over a unit's head while it is being aimed at (EA-18). Named rather than a bare number,
  // so the badge reads on its own — without the green fill or the aiming context — what the figure in
  // front of the % sign actually answers (owner's request, M5 playtest polish).
  'hud.target.chance': 'Acerto {value}%',
  // The badge a unit in cover wears over its head: the label, the conjunction that joins two sides, and
  // the name of each of the eight. The sides are the board's own and the camera never renames one
  // (m3-02, D1), so these are not the letters of the camera panel above. Shortened from a full sentence
  // to a label, pairing with `hud.target.chance` above it (M5 playtest polish): `cobertura` keeps the
  // fiction's own word (ADR 0012 § D3) rather than the effect it has.
  'hud.cover.sides': 'Cobertura: {sides}',
  'hud.cover.and': ' e ',
  'hud.cover.north': 'norte',
  'hud.cover.northeast': 'nordeste',
  'hud.cover.east': 'leste',
  'hud.cover.southeast': 'sudeste',
  'hud.cover.south': 'sul',
  'hud.cover.southwest': 'sudoeste',
  'hud.cover.west': 'oeste',
  'hud.cover.northwest': 'noroeste',
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
