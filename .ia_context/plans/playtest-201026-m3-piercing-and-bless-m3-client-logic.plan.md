# Plan — Client logic: a third menu row and aiming Bless at an ally

**Milestone:** m3-client-logic
**Feature pai:** [playtest-201026-m3-piercing-and-bless.index.md](./playtest-201026-m3-piercing-and-bless.index.md)
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Oferecer a terceira linha do menu de habilidades (vazia para Sniper/Wizard, `bless` para o Priest),
mirar Bless numa célula com um aliado vivo como qualquer habilidade de alvo único, e falar a palavra
nova no log e no i18n — tudo lógica pura, sem toque de cena.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `frontend/src/view/layout.ts` | modificar | `ABILITY_MENU_ROWS` de 2 para 3 (linha 471); a geometria do painel (`ABILITY_MENU_RECT`, linha ~492) e o hit-test (linha ~518) seguem a constante, sem outra mudança |
| `frontend/src/view/layout.test.ts` | modificar | Asserções que hardcodam `2` (linhas 554, 556) passam a esperar `3`; o teste de não-sobreposição das linhas (561-568) cobre a nova linha automaticamente pelo loop existente |
| `frontend/src/game/ability-menu.ts` | modificar | Nenhuma mudança de lógica — `armedAbilitySlots`/as linhas já são construídas a partir de `activeSets.filter(id => id !== null)` (linha 36), que já suporta um terceiro slot; só os testes precisam de um caso com três slots |
| `frontend/src/game/ability-menu.test.ts` | modificar | Caso novo: unidade com três slots (um `null`) produz duas linhas; unidade com os três preenchidos produz três |
| `frontend/src/game/highlight.ts` | modificar | `abilityReach` (linha ~68) ganha um ramo análogo ao de `revive`: quando o efeito é `buff`, a célula só entra no alcance pintado se tiver um aliado vivo (`isOccupied` não basta — precisa checar time); mesma função que decide o que é clicável decide o que é pintado, então "mirar fora de um aliado" já fica impossível de clicar |
| `frontend/src/game/highlight.test.ts` | modificar | Casos novos cobrindo o ramo de `buff` |
| `frontend/src/game/targetPreview.ts` | modificar | `abilityChances` já lê `abilityCells`/`hitChanceFor` do engine (linha 18-27) para popular o badge sobre a cabeça do alvo; para `buff` o badge não é uma "chance de acerto" (a cura não rola, o buff também não) — ajustar para não desenhar um badge numérico de chance sobre um alvo de `buff`, igual ao que já ocorre para `heal` (confirmar o tratamento atual de `heal` e espelhar) |
| `frontend/src/game/log.ts` | modificar | Novos `case 'buffed'` e `case 'bless-ended'` no switch de eventos (ao lado de `camouflage-ended`, linha ~127), devolvendo as chaves de i18n novas |
| `frontend/src/game/log.test.ts` | modificar | Casos novos para os dois eventos |
| `frontend/src/i18n/catalog.en-US.ts`, `catalog.pt-BR.ts` | modificar | `ability.name.bless`, `ability.detail.buff` (ex. `'+{hit}% hit, +{damage} damage, {turns} turns'`), `log.event.blessed`, `log.event.blessExpired` |
| `frontend/src/protocol.ts` | — | Já coberto por m2 (bump de versão e novos campos/eventos); esta milestone só consome os tipos |

## 3. Contrato da camada

- **`abilityReach` (exportada de `highlight.ts`)**: para uma habilidade `buff`, devolve só as células com
  um aliado vivo do time do unidade que mira — nenhuma célula vazia ou com inimigo é oferecida como mira
  legal, espelhando a mesma regra que o engine aplica em `validateUseAbility` (m1, I3).
- **`abilityChances`**: para `buff`, não produz uma entrada de "chance de acerto" no mapa que
  `drawTargetPreview` lê — o efeito não rola.
- **`log.ts`**: toda entrada de log tem uma chave de i18n; nenhum evento passa sem tradução.
- **O que esta camada não faz**: não desenha nada na cena (isso é m4); não decide os números de Bless
  (lidos do catálogo que a rede entrega); não cria um segundo mecanismo de alcance paralelo ao que
  `abilityReach` já tem — estende o mesmo.

## 4. Testes previstos

**Unitários:**
- [ ] `ABILITY_MENU_ROWS === 3`; o painel cresce de altura na mesma proporção que cresceu de 1 para 2 em
  `secondary-abilities`.
- [ ] Unidade com `activeSets` de três entradas, uma `null` — o menu mostra duas linhas (filtra o `null`),
  na ordem do array.
- [ ] Unidade com as três entradas preenchidas (ex. um Priest hipotético com três habilidades) — três
  linhas, mesma ordem.
- [ ] `abilityReach` com `bless` armado — célula com aliado vivo entra no alcance pintado; célula vazia,
  com inimigo, ou com um corpo não entra.
- [ ] `abilityChances` com `bless` armado sobre um aliado em alcance — não inclui esse alvo no mapa de
  chances (nenhum badge numérico).
- [ ] `log.ts` traduz `buffed` e `bless-ended` para as chaves novas, com os parâmetros certos
  (`turns`, `hitBonus`, `damageBonus`).
- [ ] Paridade de chaves entre `catalog.en-US.ts` e `catalog.pt-BR.ts` continua passando com as chaves
  novas presentes nos dois.

**E2E:** não se aplica a esta milestone (sem runner de DOM no repo); a cobertura "ponta a ponta" de um
Bless completo é a do `integration.test.ts` do servidor (m2) e a verificação manual de m4.

Casos de borda cobertos: slot vazio no meio do array, mira fora de um aliado, efeito que não rola uma
chance.

## 5. Dependências

Depende de m2's protocolo 12 congelado (os tipos `AbilityEffect` com `buff`, os eventos `buffed`/
`bless-ended`, e `activeSets` de três entradas) — não precisa de m2 mergeado, só do contrato fixado.

## 6. Fora de escopo

- Qualquer desenho na cena (sprite, cor, camada) — m4.
- Mudar o comportamento de `heal`, `camouflage`, `terrain` ou `revive` nesta camada.
- Validação de servidor — esta camada só espelha o que o engine já recusa, para a UI não oferecer uma
  mira que o servidor recusaria (mesma garantia que `highlight.ts` já documenta para as áreas existentes).
