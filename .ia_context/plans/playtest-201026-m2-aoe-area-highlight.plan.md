# Plan — Highlight an area ability's footprint on hover

**Milestone:** —
**Feature pai:** [playtest-201026.index.md](./playtest-201026.index.md), item 2
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Quando o jogador arma uma habilidade de área (`radius > 0`, ex.: `fireball`) e passa o mouse sobre uma
célula dentro do alcance, pintar no tabuleiro exatamente as células que aquele cast afetaria — hoje só o
texto da descrição informa o raio (`frontend/src/game/ability-menu.ts:83,87,99`), e a área de alcance
pintada (`highlight.ts`) marca onde o cast pode ser mirado, não o que ele cobriria a partir do ponto
mirado.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `frontend/src/game/highlight.ts` | modificar | Novo export, ex. `abilityFootprintCells(state, previewCell, ability)` — fino wrapper sobre o `abilityCells` do engine, retornando `[]` quando `ability.effect.radius === 0` ou `previewCell` é `null` |
| `frontend/src/view/theme.ts` | modificar | Nova cor/alpha para o tom da área (ex. `ABILITY_AREA_HIGHLIGHT_COLOR`, `_ALPHA`), distinta do tom `ability` (alcance) já existente |
| `frontend/src/view/depth.ts` | modificar | Novo nível de `LAYER` para a pintura da área, acima do highlight de alcance e abaixo da unidade — seguindo o padrão já usado por `LAYER.hover` (`tile-hover-highlight.plan.md`) |
| `frontend/src/scenes/MatchScene.ts` | modificar | `setPreviewCell`/`drawTargetPreview` (linhas ~629-704) ganham uma chamada a `drawAbilityAreaHighlight`, recalculada junto com os badges de chance, só quando `mode === 'ability'` e a habilidade armada tem `radius > 0` |
| `frontend/src/scenes/MatchScene.test.ts` | modificar | Novos casos cobrindo a pintura/limpeza da área (ver §4) |
| `frontend/src/game/highlight.test.ts` | modificar | Testes unitários de `abilityFootprintCells` |

Não toca em `frontend/src/game/presentation.ts` (o "glow"/"blast" pós-cast já usa `abilityCells` para a
animação de impacto — esse código já existe e não muda; esta milestone adiciona o mesmo cálculo *antes*
da confirmação, como prévia).

## 3. Contrato da camada

- **`abilityFootprintCells(state: PublicState, previewCell: Cell | null, ability: AbilityDefinition | undefined): Cell[]`**
  — entrada: o estado público, a célula sob o mouse (ou `null`), a definição da habilidade armada (ou
  `undefined`). Saída: as células que `abilityCells(state, previewCell, ability)` do engine devolve,
  exceto quando `ability` é `undefined`, `previewCell` é `null`, ou `ability.effect.radius === 0` — nesses
  casos, `[]`.
- **Exceções esperadas**: nenhuma — função pura, sem I/O, sem lançar.
- **O que esta camada não faz**: não decide se a célula é um alvo legal (isso já é `highlightedCells`/o
  engine); não desenha nada sozinha fora do método de cena que a chama; não altera a lógica de dano ou
  de quem é afetado — é só leitura do mesmo `abilityCells` que a resolução no servidor usa, então o que é
  pintado nunca pode discordar do que o servidor resolveria (mesma garantia que `presentation.ts` já cita
  para o glow pós-cast).

## 4. Testes previstos

**Unitários (`frontend/src/game/highlight.test.ts`):**
- [ ] Habilidade de área (`radius: 1`) com `previewCell` dentro do alcance — retorna as 9 células do
  quadrado 3×3 em torno de `previewCell`, clipadas na borda do tabuleiro.
- [ ] Habilidade single-target (`radius: 0`, ex. `piercing-shot`) — retorna `[]`.
- [ ] `previewCell === null` (nada sob o mouse) — retorna `[]`.
- [ ] `ability === undefined` (nenhuma habilidade armada) — retorna `[]`.
- [ ] `previewCell` fora do tabuleiro — retorna `[]` (mesmo comportamento do `abilityCells` do engine).

**Integração (`frontend/src/scenes/MatchScene.test.ts`):**
- [ ] Armar `fireball`, mover o mouse sobre uma célula em alcance — a pintura da área aparece com as
  células esperadas.
- [ ] Mover o mouse para fora do alcance (ou para `null`) — a pintura da área é limpa.
- [ ] Armar `piercing-shot` (single-target) — nenhuma pintura de área aparece, só o alcance de sempre.
- [ ] A pintura da área nunca aparece fora do modo `ability` (ex. durante `move` ou `attack`).

Não há "erro de negócio" aqui — é renderização pura; os casos de borda acima (fora do tabuleiro, sem
habilidade armada, sem célula sob o mouse) cobrem o que existe.

## 5. Dependências

Nenhuma. Usa `abilityCells`, já exportado pelo engine (`backend/engine/src/abilities.ts:28`) e já
importado no frontend em outros módulos (`game/targetPreview.ts`, `game/presentation.ts`).

## 6. Fora de escopo

- Mudar a cor ou o texto da descrição de alcance no menu de habilidades (`ability-menu.ts`) — só a
  pintura no tabuleiro é nova.
- Prever a área antes de o jogador armar a habilidade (ex. ao passar o mouse sobre a entrada do menu,
  antes de confirmá-la) — a prévia só aparece depois que a habilidade está armada e o mouse está sobre o
  tabuleiro, igual ao badge de chance de acerto que já existe hoje.
- Qualquer alteração no cálculo de `abilityCells` do engine — ele já faz exatamente o que esta milestone
  precisa.
