# Plan — Server: Bless's catalog entry, Piercing Shot's cost, the bot and protocol 12

**Milestone:** m2-server-protocol
**Feature pai:** [playtest-201026-m3-piercing-and-bless.index.md](./playtest-201026-m3-piercing-and-bless.index.md)
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Autorar os dados que o engine (m1) resolve: o novo custo de `piercing-shot`, a definição de `bless`, o
terceiro slot de cada classe, o peso do bot para a nova habilidade, e a versão 12 do protocolo nos dois
espelhos (servidor e cliente), congelando o contrato que m3 constrói contra.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `backend/game-server/src/abilities.ts` | modificar | `piercing-shot.cost` de 1 para 2 (linha 16); nova entrada `bless` no `ABILITY_CATALOG` (`cost: 1, range: 3, needsSight: true, effect: { kind: 'buff', radius: 0, hitBonus: 10, damageBonus: 1, turns: 3 }`); `CLASS_ABILITIES` ganha o terceiro slot: `sniper: ['piercing-shot', 'camouflage', null]`, `wizard: ['fireball', 'mud', null]`, `priest: ['area-heal', 'resurrection', 'bless']` |
| `backend/game-server/src/abilities.test.ts` | modificar | Atualiza a asserção do custo total do sniper (o comentário do arquivo diz que o teste "assert[s] the number still equals the roster's attack plus two" — ajustar para o novo custo de `piercing-shot`); novos casos para `bless` e para o terceiro slot |
| `backend/game-server/src/bot.ts` | modificar | Novo peso provisório (I9) para considerar `bless` como candidato quando o Priest tem um aliado elegível em alcance e mana suficiente |
| `backend/game-server/src/bot.test.ts` | modificar | Caso novo: o bot conjura `bless` quando é a melhor opção disponível |
| `backend/game-server/src/protocol.ts` | modificar | `PROTOCOL_VERSION` de 11 para 12 (linha 34) |
| `frontend/src/protocol.ts` | modificar | Mesmo bump, espelho do cliente (linha 386) — os dois arquivos devem ficar idênticos no que descrevem |
| `backend/game-server/src/battle-room.test.ts`, `frontend/src/net/session.test.ts`, `frontend/src/scenes/MatchScene.test.ts` | modificar | Asserções que hardcodam `11` (ex. `battle-room.test.ts:215`, `session.test.ts:446`) passam a esperar `12` |
| `backend/game-server/src/integration.test.ts` | modificar | Novo caso: uma partida completa onde o Priest conjura `bless` e o aliado abençoado então ataca, replay incluído |

## 3. Contrato da camada

- **O catálogo**: `ABILITY_CATALOG` e `CLASS_ABILITIES` são dados puros que o engine (m1) consome sem
  conhecer — nenhuma lógica nova aqui, só valores.
- **O bot**: ganha um peso provisório para `bless`; não há contrato público novo além do já existente
  (`decideBotAction` ou equivalente continua com a mesma assinatura).
- **Protocolo 12**: o único contrato formal que esta camada expõe ao cliente — a versão numérica, mais
  os novos campos que o estado público carrega (`blessed` em `UnitState`, o terceiro slot em
  `activeSets`, os eventos `buffed`/`bless-ended`) já definidos em m1 e simplesmente serializados aqui
  sem transformação.
- **O que esta camada não faz**: não decide os números de `bless` diferente do que a ADR 0024 fixou; não
  muda a validação (isso é do engine); não migra partidas armazenadas (fora de escopo, como em
  `secondary-abilities`).

## 4. Testes previstos

**Unitários:**
- [ ] `ABILITY_CATALOG` contém `bless` com os campos exatos da ADR 0024/I7.
- [ ] `piercing-shot.cost === 2`.
- [ ] `CLASS_ABILITIES.sniper` e `.wizard` têm `null` no terceiro slot; `.priest` tem `'bless'`.
- [ ] O bot escolhe `bless` quando um aliado elegível está em alcance, há mana e nenhuma ação de maior
  prioridade está disponível (caso feliz); não escolhe quando não há aliado elegível ou mana insuficiente
  (caso de borda).
- [ ] `PROTOCOL_VERSION === 12` nos dois arquivos (`backend/game-server/src/protocol.ts:34` e
  `frontend/src/protocol.ts:386`). **Confirmado na exploração**: não existe hoje nenhum teste cruzado
  entre os dois espelhos — cada lado só se afirma contra o literal `11` em seu próprio arquivo
  (`battle-room.test.ts:215`, `session.test.ts:446`). Os dois literais são atualizados manualmente nesta
  milestone, cada um em seu teste próprio passando a esperar `12`; nenhum teste novo de paridade é
  necessário para fechar esta milestone, mas é uma lacuna pré-existente que vale registrar — se
  divergirem no futuro, nada hoje pega isso automaticamente.

**E2E (`backend/game-server/src/battle-room.test.ts`):**
- [ ] Uma mensagem com `version` diferente de 12 é recusada, como já ocorre para a versão atual.
- [ ] O estado público de uma partida nova inclui o terceiro slot (mesmo vazio) sem quebrar a
  serialização existente.

**Integração (`backend/game-server/src/integration.test.ts`):**
- [ ] Partida completa: Priest conjura `bless` em um aliado, o aliado ataca com o bônus aplicado, e o
  replay dos eventos reconstrói o mesmo hash final.

## 5. Dependências

Depende de m1 aprovado: os tipos (`Blessed`, `AbilityEffect` com `buff`, `activeSets` de três entradas)
e os eventos (`buffed`, `bless-ended`) precisam estar congelados antes desta camada os referenciar.

## 6. Fora de escopo

- Qualquer mudança na lógica do engine — só dados e transporte.
- Migração de partidas armazenadas: a mudança de protocolo altera o hash final; partidas antigas não são
  re-verificadas (mesma posição de `secondary-abilities` I10).
- Afinar o peso do bot além de um valor plausível inicial — é provisório (I9), ajustado em playtest.
