# Pre-review — One room per human player, a process-wide cap on how many, and the same-tab guard restored client-side

**Branch:** `fix/rooms`
**Gerado em:** 2026-10-14

---

### 1. O que testar

Rode `npm run dev:game-server` e `npm run dev:frontend` a partir da raiz, exceto quando o passo disser outra coisa. Do mais crítico para o menos crítico.

**1. O bug original — dois jogadores "diferentes" ao mesmo tempo.** Abra o jogo em duas janelas **anônimas separadas** (ou dois navegadores diferentes, para garantir `localStorage` isolado — isso simula dois jogadores de verdade, não duas abas do mesmo navegador). Clique em "Iniciar partida" nas duas. Esperado: as duas conectam, cada uma em sua própria sala, sem nenhuma recusada. Esse é o bug que motivou o branch; se isso falhar, nada mais importa.

**2. A trava de mesma aba.** Abra o jogo em duas abas do **mesmo** navegador (mesmo perfil, não anônimo). Na aba 1, clique em "Iniciar partida" e espere a partida carregar. Na aba 2, clique em "Iniciar partida": esperado, o aviso "Você já tem uma partida aberta em outra aba" aparece quase instantaneamente. Abra as ferramentas de desenvolvedor da aba 2, aba Rede, filtre por WS: não deve haver nenhuma tentativa de conexão ao `:2567` — só o socket de HMR do Vite (em dev) ou nenhum (em build de produção).

**3. A trava se libera quando a partida termina de verdade.** Com o cenário acima, feche a aba 1 (ou clique em "Fechar" no aviso da aba 2 e espere alguns segundos). Clique de novo em "Iniciar partida" na aba 2: deve conectar normalmente agora.

**4. Uma aba que trava sem fechar (o caso dos 15 s).** Na aba 1, em partida, mate o processo do navegador de um jeito que não dispare `pagehide` (ex.: `kill -9` do processo do Chrome/Firefox, não só fechar a aba) — ou, mais simples, use o DevTools da aba 1 para rodar `window.onpagehide = null` antes de fechá-la, para simular um crash. Na aba 2, tente entrar: esperado, ainda recusa por até ~15 s depois do último batimento da aba 1, e depois disso conecta normalmente.

**5. Reload no meio da partida continua funcionando (DT-60).** Em uma aba, entre numa partida e dê F5. Esperado: a mesma partida volta (token de `sessionStorage`), sem passar pelo aviso de "outra aba" — a trava é liberada no `pagehide` do reload antes da nova página pedir a trava de volta.

**6. `localStorage` bloqueado ou indisponível.** Em uma janela anônima com cookies/armazenamento bloqueados nas configurações do navegador (ou via DevTools, "Block all storage"), clique em "Iniciar partida": esperado, conecta normalmente, sem exceção no console. A trava simplesmente não funciona nesse caso, mas o jogo não trava por causa disso — é a mesma política que `panSensitivity.ts` já usa.

**7. O teto de partidas simultâneas.** Mais difícil de testar manualmente (exigiria 30 jogadores reais), então a cobertura real está no teste automatizado de `battle-room.test.ts` (item 8). Para uma checagem rápida manual: suba o game-server com `GAME_SERVER_MAX_MATCHES=1`, abra uma partida numa janela anônima, depois tente abrir outra em outra janela anônima (storage isolado, então não é a trava de aba) — esperado, a segunda recusa com "Servidor indisponível". Feche a primeira e tente de novo: conecta.

**8. Suítes e build, como proxy para o que não dá para clicar.** `npm test -w @eldritch-alley/game-server` (precisa de Node 22 — o próprio `vitest.config.mts` do pacote barra Node 18, e o ambiente local pode ter um `npm`/`npx` resolvendo para Node 18 por engano; se dois `node -v` seguidos derem versões diferentes, invoque o binário do Node 22 diretamente em vez de via `npm run`/`npx`); `npm test -w @eldritch-alley/frontend`; `npm run typecheck`; `npx tsc -p frontend/tsconfig.json --noEmit`; `npm run build -w @eldritch-alley/frontend`.

---

### 2. Checklist de código

- [ ] `backend/game-server/src/battle-room.ts`: `this.maxClients = 1` é a primeira linha de `onCreate`, antes de `createMatchSetup`.
- [ ] `frontend/src/net/tab-lock.ts` usa `Date.now()` em todo lugar, nunca `performance.now()`.
- [ ] `frontend/src/net/tab-lock.ts` segue o padrão de `game/panSensitivity.ts`: todo acesso a storage em try/catch, nunca lança.
- [ ] `frontend/src/title/title.ts`: `endLock()` é chamado em todo ponto onde a sessão desta aba termina — o catch de `press()`, o branch "flow não é mais `connecting`", a falha de download em `handOver()`, `resume()` e `pagehide`. Nenhum desses pontos foi esquecido.
- [ ] `frontend/src/title/title.ts`: `window.setInterval`/`window.clearInterval` explícitos (não a versão bare), porque o ambiente Node do monorepo sombreia o tipo de retorno do `setInterval` global.
- [ ] Nenhuma mudança em `frontend/src/title/connect-flow.ts`, `notice.ts`, `net/join-failure.ts` ou nos catálogos de i18n — a cópia `'occupied'` já existia e não precisou mudar.
- [ ] `backend/game-server/src/battle-room.test.ts`: o comentário acima do teste não afirma mais que a string é um contrato cruzando o boundary cliente/servidor.
- [ ] `backend/game-server/src/battle-room.ts`: `activeMatches += 1` é a última linha de um `onCreate` bem-sucedido, não a primeira — qualquer coisa que falhar antes dela nunca conta a sala.
- [ ] `backend/game-server/src/main.ts`: `maxConcurrentMatches` vai como terceiro argumento de `gameServer.define`, não dentro de `onCreate` nem lido direto de `process.env` ali — é isso que impede o cliente de sobrescrever.
- [ ] `npm test -w @eldritch-alley/game-server` 85/85; `npm test -w @eldritch-alley/frontend` 793/793 em 58 arquivos.
- [ ] `npm run typecheck` e `npx tsc -p frontend/tsconfig.json --noEmit` limpos.
- [ ] Nada no diff fora do escopo: sem mudança em `.ia_context/inputs/technical-debt*.md` (deixado fora de propósito, ver notas da description).

---

### 3. Checklist de comportamento

- [ ] Dois jogadores "diferentes" (storage isolado) conectam ao mesmo tempo, cada um em sua própria sala — o bug original está corrigido.
- [ ] Uma segunda aba do mesmo navegador vê o aviso de "outra aba" quase instantaneamente, sem nenhuma tentativa de WebSocket ao game-server.
- [ ] Fechar a primeira aba libera a segunda imediatamente; um crash sem `pagehide` libera em até ~15 s.
- [ ] Um F5 no meio da partida ainda resume a mesma partida, sem passar pelo aviso.
- [ ] Com storage bloqueado, o jogo ainda conecta normalmente.
- [ ] Com `GAME_SERVER_MAX_MATCHES=1`, uma segunda partida de um jogador "diferente" (storage isolado) é recusada com "Servidor indisponível"; liberar a primeira libera a vaga para a próxima.
