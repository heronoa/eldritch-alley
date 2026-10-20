# Plan — Client: stop offering a camouflaged unit's cell as a direct ability aim

**Milestone:** m2-client
**Feature pai:** [playtest-201026-m4-camouflage-targeting.index.md](./playtest-201026-m4-camouflage-targeting.index.md)
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Fazer `abilityReach` (frontend) parar de pintar/oferecer como mira legal a célula de uma unidade
camuflada, para uma habilidade de dano sem raio — a mesma regra que o engine (m1) agora aplica no
servidor, para que o tile fique impossível de clicar em vez de clicável-e-depois-recusado, que é o
pedido literal do playtest ("precisa ser impossível clicar no tile").

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `frontend/src/game/highlight.ts` | modificar | `abilityReach` (linha ~68-90) ganha um novo `continue` no loop de células, ao lado do já existente para `revive` (`if (revived && isOccupied(state, cell)) continue;`): quando `ability.effect.kind === 'damage' && ability.effect.radius === 0`, pular células onde há uma unidade viva com `camouflage !== null` |
| `frontend/src/game/highlight.test.ts` | modificar | Novos casos (ver §4) |
| `frontend/src/scenes/MatchScene.test.ts` | modificar, se necessário | Confirmar que um clique na célula de uma unidade camuflada, com `piercing-shot` armado, não dispara a ação (mesmo caminho que já trata um clique fora da área pintada) |

## 3. Contrato da camada

- **`abilityReach`**: para uma habilidade `damage` com `radius: 0`, a lista de células devolvida nunca
  inclui a célula de uma unidade viva camuflada. Para qualquer outra habilidade (`radius > 0`, ou efeito
  não-`damage`), o comportamento não muda.
- **O que esta camada não faz**: não decide a regra — só espelha o que `validateUseAbility` (m1) já
  recusa, para a UI nunca oferecer uma mira que o servidor recusaria (a mesma garantia que o cabeçalho de
  `highlight.ts` já declara para toda área que pinta).

## 4. Testes previstos

**Unitários (`frontend/src/game/highlight.test.ts`):**
- [ ] `piercing-shot` armado, com uma unidade camuflada em alcance — a célula dela não aparece na lista
  de `abilityReach`.
- [ ] `fireball` armado, mesma situação — a célula continua aparecendo (AoE não é afetado).
- [ ] `area-heal` armado, aliado camuflado em alcance — a célula continua aparecendo (efeito não-`damage`
  não é afetado).
- [ ] Unidade camuflada fora de alcance — nenhuma mudança (a célula já não apareceria por alcance).

**Integração (`frontend/src/scenes/MatchScene.test.ts`), se o caminho de clique for testável isoladamente:**
- [ ] Clicar na célula de uma unidade camuflada com `piercing-shot` armado não produz uma ação de
  `useAbility` — o mesmo tratamento que já existe para um clique fora da área pintada.

Casos de borda cobertos: AoE preservado, efeito benéfico preservado, unidade fora de alcance.

## 5. Dependências

Depende de m1 aprovado — espelha exatamente a regra que o engine ships ali; nenhuma mudança de tipo ou
de protocolo é necessária (este fix não altera nenhum dado trafegado).

## 6. Fora de escopo

- Qualquer indicação visual adicional de "por que" a célula não está pintada (ex. um cursor de
  "proibido" ao passar o mouse) — o pedido do playtest é só impedir o clique; um feedback mais rico pode
  ser um item futuro, não desta entrega.
- O badge de chance de acerto (`targetPreviewChances`) já não apareceria para essa célula, porque ela
  deixa de estar em `legalCells` — nenhuma mudança adicional é necessária ali.
