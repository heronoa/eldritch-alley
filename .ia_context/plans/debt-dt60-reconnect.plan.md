# Plano — DT-60: retomar a partida depois de um refresh no meio dela

**Milestone:** —
**Feature pai:** nenhuma (débito isolado, fora do index de quick wins)
**Criado em:** 2026-10-05
**Status:** pendente

---

### 1. Objetivo

Quando a página é recarregada durante uma partida, o título tenta retomar a partida com o token guardado em `sessionStorage`, antes de tentar entrar em uma sala nova. Assim o jogador volta à partida em vez de ver "Servidor indisponível". A camada `Session` passa a expor `open()`, que retoma ou entra em sala nova, e o título só chama esse método.

---

### 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `frontend/src/net/session.ts` | modificar | `reconnect()` apaga o token de `sessionStorage` quando a retomada falha. Novo método `open()`: se `reconnect()` der certo, retorna; senão chama `connect()`. Novo helper `removeToken()` com try/catch, no mesmo padrão de `readToken` e `writeToken` |
| `frontend/src/net/session.test.ts` | modificar | O fake ganha uma opção para o `reconnect` falhar e contadores de `joinOrCreate` e `reconnect`. Novos casos listados na seção 4 |
| `frontend/src/title/title.ts` | modificar | Em `press()`, `opening.connect()` vira `opening.open()`. Nenhuma outra mudança no fluxo do título |
| `.ia_context/inputs/technical-debt.md` | modificar | Ao concluir: mover DT-60 para a tabela de fechados com a resolução, e corrigir a referência a `LobbyScene.ts`, que não existe mais (o fluxo está em `frontend/src/title/title.ts`) |

Não há mudança visual, não há mudança no `backend/` e não há mudança no protocolo.

---

### 3. Contrato da camada

**`Session.open(): Promise<void>`**
- **Entrada:** nenhuma. Usa o token guardado, se houver.
- **Saída:** resolve quando a sessão está numa sala, retomada ou nova.
- **Fluxo:** se há token e `reconnect()` dá certo, resolve sem entrar em sala nova. Em qualquer outro caso chama `connect()`.
- **Exceções:** lança o que `connect()` lançar, quando a sala nova também falha (servidor fora, sala cheia). Nunca lança por causa de token ausente ou obsoleto.
- **O que não faz:** não mostra mensagem, não muda estado de UI e não decide o que o título exibe.

**`Session.reconnect(): Promise<boolean>`** (assinatura inalterada)
- Sem token: retorna `false` sem chamar o cliente.
- Com token e falha: apaga o token de `sessionStorage` e retorna `false`. Assim o token obsoleto não é tentado de novo.
- Com token e sucesso: retorna `true`, como hoje.

**`Session.connect()`** (inalterado): continua entrando em sala nova via `joinOrCreate`.

---

### 4. Testes previstos

**Unitários** (`frontend/src/net/session.test.ts`, com o fake do SDK):
- [ ] `open()` com token válido retoma a sala: `reconnect` chamado uma vez, `joinOrCreate` não chamado, o token da sala retomada é gravado.
- [ ] `open()` sem token entra em sala nova: `joinOrCreate` chamado uma vez, `reconnect` não chamado.
- [ ] `open()` com token obsoleto (o `reconnect` falha): o token é apagado, a sala nova é criada, e uma segunda chamada a `open()` não tenta `reconnect`.
- [ ] `reconnect()` com falha apaga o token e retorna `false`.
- [ ] `reconnect()` sem token retorna `false` e não chama o cliente.
- [ ] `open()` lança o erro de `joinOrCreate` quando não há retomada e a sala nova também falha.
- [ ] `open()` sem `sessionStorage` disponível cai em `connect()` sem lançar.
- [ ] Casos já existentes continuam passando, em especial "offers a way to reconnect when the storage is unavailable" e "keeps the subscriptions when it reconnects into a new room".

**Manuais** (sem e2e no projeto; roteiro a seguir na integração):
- [ ] Começar partida contra o bot, dar F5, pressionar o botão do título: a partida volta com o tabuleiro e o HUD do estado atual.
- [ ] Repetir o refresh após mais de 120 s sem partida em andamento: o servidor já encerrou a vaga, a retomada falha, o token é apagado e uma partida nova começa.
- [ ] Depois de uma partida terminada, dar F5 e pressionar o botão: começa partida nova, sem "Servidor indisponível".

Comando de verificação: `npm test` e `npm run build` em `frontend/`.

---

### 5. Dependências

- Base: `develop`. O PR #8 (`feat/visual-identity`) já está no histórico de `develop`, então não há bloqueio.
- Nenhuma milestone anterior: é um plano único.
- Ordem interna: **Logic** (`session.ts` e `session.test.ts`) primeiro, aprovado e testado; depois **Integration** (`title.ts`, verificação manual). Design não se aplica, porque não há mudança visual.

---

### 6. Fora de escopo

- **Nova aba durante a partida.** A aba nova não tem token, porque o `sessionStorage` é por aba. Ela continua caindo em `room full` e mostrando "Servidor indisponível". Exige decisão de servidor ou de UI e será registrado como débito separado.
- **Retomada automática sem pressionar o botão.** O jogador pressiona o botão do título para retomar. A retomada automática foi descartada na escolha de desenho.
- **Mudança no servidor.** `onReconnect` já envia o `state`, como o ADR 0008 prevê.

**Risco conhecido, aceito:** `reconnect()` não diferencia falha de rede de token rejeitado. Uma queda momentânea de rede durante a retomada também apaga o token, e a vaga válida se perde. Se isso incomodar na prática, a correção futura é apagar o token só quando o servidor recusar a retomada.
