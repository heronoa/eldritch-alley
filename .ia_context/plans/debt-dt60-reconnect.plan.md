# Plano — DT-60: retomar a partida depois de um refresh no meio dela

**Milestone:** —
**Feature pai:** nenhuma (débito isolado, fora do index de quick wins)
**Criado em:** 2026-10-05
**Status:** concluído em 2026-10-05. As 3 checagens manuais da seção 4 foram feitas pelo dono no browser e passaram todas. DT-60 movido para [technical-debt-closed.md](../inputs/technical-debt-closed.md). O plano seguiu a seção 3 à risca: o token recusado **não** é apagado, o que contraria o "Suggested fix" original do DT-60 (que previa limpar o token obsoleto) — a seção 3 justifica a escolha, e `reconnect()` ficou inalterado.

---

### 1. Objetivo

Quando a página é recarregada durante uma partida, o título tenta retomar a partida com o token guardado em `sessionStorage`, antes de tentar entrar em uma sala nova. Assim o jogador volta à partida em vez de ver "Servidor indisponível". A camada `Session` passa a expor `open()`, que retoma ou entra em sala nova, e o título só chama esse método.

---

### 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `frontend/src/net/session.ts` | modificar | Novo método `open()`: se `reconnect()` der certo, retorna; senão chama `connect()`. `reconnect()` mantém o comportamento atual e não apaga o token |
| `frontend/src/net/session.test.ts` | modificar | O fake ganha uma forma de fazer o `reconnect` falhar e contadores de `joinOrCreate` e `reconnect`. Novos casos listados na seção 4 |
| `frontend/src/title/title.ts` | modificar | Em `press()`, `opening.connect()` vira `opening.open()`. Nenhuma outra mudança no fluxo do título |
| `.ia_context/inputs/technical-debt.md` | modificar | Ao concluir: mover DT-60 para a tabela de fechados com a resolução, e corrigir a referência a `LobbyScene.ts`, que não existe mais (o fluxo está em `frontend/src/title/title.ts`) |

Não há mudança visual, não há mudança no `backend/` e não há mudança no protocolo.

---

### 3. Contrato da camada

**`Session.open(): Promise<void>`**
- **Entrada:** nenhuma. Usa o token guardado, se houver.
- **Saída:** resolve quando a sessão está numa sala, retomada ou nova.
- **Fluxo:** se há token e `reconnect()` dá certo, resolve sem entrar em sala nova. Em qualquer outro caso chama `connect()`, que grava o token da sala nova por cima do antigo.
- **Exceções:** lança o que `connect()` lançar, quando a sala nova também falha (servidor fora, sala cheia). Nunca lança por causa de token ausente ou recusado.
- **O que não faz:** não mostra mensagem, não muda estado de UI e não decide o que o título exibe.

**`Session.reconnect(): Promise<boolean>`** (assinatura inalterada, comportamento inalterado)
- Sem token: retorna `false` sem chamar o cliente.
- Com token e falha, de qualquer tipo: retorna `false` e **não apaga o token**.
- Com token e sucesso: retorna `true`, como hoje.

**Por que não apagar o token:** um token obsoleto não causa dano. `open()` tenta `reconnect()`, falha, e `connect()` entra numa sala nova e grava o token novo. O único custo é um pedido extra por carregamento, até a próxima entrada. Não apagar evita decidir, agora, quais erros do servidor são recusas e quais são queda de rede ou timeout do Cloudflare Tunnel (que também usa os status 522 e 524). Isso também facilita o PvP: não há regra de apagamento para manter quando um segundo humano entrar.

**`Session.connect()`** (inalterado): continua entrando em sala nova via `joinOrCreate`.

---

### 4. Testes previstos

**Unitários** (`frontend/src/net/session.test.ts`, com o fake do SDK):
- [x] `open()` com token válido retoma a sala: `reconnect` chamado uma vez, `joinOrCreate` não chamado, o token da sala retomada é gravado. — "resumes the match when a token is stored"
- [x] `open()` sem token entra em sala nova: `joinOrCreate` chamado uma vez, `reconnect` não chamado. — "joins a new room when no token is stored"
- [x] `open()` com token recusado pelo servidor: `reconnect` falha, `joinOrCreate` é chamado e o token gravado passa a ser o da sala nova. — "joins a new room when the stored token is refused"
- [x] `reconnect()` com falha retorna `false` e **mantém** o token gravado. — "keeps the stored token when the reconnection is refused"
- [x] `reconnect()` sem token retorna `false` e não chama o cliente. — "refuses to reconnect, without calling the server, when no token is stored"
- [x] `open()` lança o erro de `joinOrCreate` quando a retomada falha e a sala nova também falha. — "throws the join error when the resumption fails and the new room does too"
- [x] `open()` sem `sessionStorage` disponível cai em `connect()` sem lançar. — "falls back to a new room when the storage is unavailable"
- [x] Casos já existentes continuam passando, em especial "offers a way to reconnect when the storage is unavailable" e "keeps the subscriptions when it reconnects into a new room". — `session.test.ts` 20/20; suíte completa 361/361 em 33 arquivos

**Manuais** (sem e2e no projeto):
- [x] Começar partida contra o bot, dar F5, pressionar o botão do título: a partida volta com o tabuleiro e o HUD do estado atual.
- [x] Repetir o refresh após mais de 120 s sem partida em andamento: a retomada falha, o título entra em sala nova e a partida nova começa.
- [x] Depois de uma partida terminada, dar F5 e pressionar o botão: começa partida nova, sem "Servidor indisponível".

As 3 manuais foram rodadas pelo dono em 2026-10-05, com o resultado esperado em todas.

Comando de verificação: `npm test` e `npm run build` em `frontend/`.

---

### 5. Dependências

- Base: `develop`. O PR #8 (`feat/visual-identity`) já está no histórico de `develop`, então não há bloqueio.
- Nenhuma milestone anterior: é um plano único.
- Ordem interna: **Logic** (`session.ts` e `session.test.ts`) primeiro, aprovado e testado; depois **Integration** (`title.ts`, verificação manual). Design não se aplica, porque não há mudança visual.

---

### 6. Fora de escopo

- **Nova aba durante a partida.** A aba nova não tem token, porque o `sessionStorage` é por aba. Ela continua caindo em `room full` e mostrando "Servidor indisponível". Exige decisão de servidor ou de UI e será registrado como débito separado.
- **Retomada automática sem pressionar o botão.** O jogador pressiona o botão do título para retomar.
- **Mudança no servidor.** `onReconnect` já envia o `state`, como o ADR 0008 prevê.
- **Apagamento de token em `reconnect()`.** Descartado de propósito (ver seção 3). Se no futuro houver um motivo real para apagar, como uma partida PvP com regras de vaga, ele entra num plano próprio.
