# Plan — Engine: refuse a direct damaging ability against a camouflaged unit

**Milestone:** m1-engine
**Feature pai:** [playtest-201026-m4-camouflage-targeting.index.md](./playtest-201026-m4-camouflage-targeting.index.md)
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Fechar a lacuna em `validateUseAbility`: uma habilidade de dano sem raio (`radius: 0`) mirada na célula
de uma unidade camuflada passa a ser recusada com `target-hidden`, igual ao ataque básico — sem afetar
habilidades de área (`radius > 0`) nem habilidades não-ofensivas. Registrado na ADR 0025 antes do código.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `docs/adr/0025-camouflage-blocks-direct-abilities.md` | criar | ADR 0025, amendando a decisão 2A da ADR 0023 §6 (ver §7) |
| `docs/adr/README.md` | modificar | Nova linha para 0025, "Accepted (amends 0023 decision 2A)" |
| `backend/engine/src/actions.ts` | modificar | `validateUseAbility` (linha 248-289) ganha, depois do `needsSight` (linha 267-269) e antes do ramo de `revive` (linha 273), um novo bloco: se `ability.effect.kind === 'damage' && ability.effect.radius === 0`, ler `occupantAt(state, action.to)`; se existir, estiver vivo e `camouflage !== null`, devolver `'target-hidden'` |
| `backend/engine/src/actions.test.ts` | modificar | Novos casos (ver §4) |

## 3. Contrato da camada

- **Alteração de `validateUseAbility`**: nenhuma assinatura muda. O único efeito observável é um novo
  caso em que a função devolve `'target-hidden'` em vez de `null` (ou de outro motivo de recusa que já
  seria aplicado antes, como custo ou alcance — a ordem dos checks não muda, este é só mais um, na mesma
  posição relativa que `validateAttack` já usa: depois da geometria, mas aqui goes right after sight
  since there is no separate pool-then-reach split to preserve, matching where the check naturally
  reads the cell's occupant).
- **Exceção esperada**: nenhuma nova — reusa o `RejectReason` `'target-hidden'` já existente.
- **O que esta camada não faz**: não recusa habilidades de área (`radius > 0`) contra uma unidade
  camuflada — essas continuam acertando, como a decisão 2A original já previa para o "splash". Não
  recusa uma habilidade benéfica (`heal`, `buff`, `terrain`, `revive`) mirada numa unidade camuflada —
  só `damage` com `radius: 0` é afetado (I1).

## 4. Testes previstos

**Unitários (`backend/engine/src/actions.test.ts`, ou um novo `camouflage-ability-targeting.test.ts` ao
lado de `camouflage.test.ts`):**
- [ ] `piercing-shot` (radius 0, damage) mirado na célula de uma unidade camuflada — recusado
  `target-hidden`.
- [ ] `fireball` (radius 1, damage) mirado numa célula que cobre uma unidade camuflada — não recusado
  por isso; a unidade camuflada é atingida pelo splash, como hoje (regressão da metade preservada da
  decisão 2A).
- [ ] `area-heal` (radius 1, heal) mirado numa célula com um aliado camuflado — não recusado; a cura
  funciona normalmente (I1 — efeito não-`damage` é imune a este check).
- [ ] Uma habilidade `damage` com `radius: 0` mirada numa célula vazia, ou com uma unidade não
  camuflada — comportamento inalterado.
- [ ] Ordem dos checks: se o alcance já recusaria (`target-out-of-range`), essa recusa continua vindo
  primeiro — o novo check nunca mascara uma recusa que já existia.
- [ ] Replay: uma partida que tenta e é recusada neste novo caso produz o mesmo `ActionResult` de
  recusa ao ser reconstruída (recusas não entram no replay de eventos, mas o teste confirma que a
  validação é determinística).

**E2E:** não se aplica — só engine.

Casos de borda cobertos: AoE preservado, efeito benéfico preservado, célula vazia, unidade não
camuflada, ordem de recusas.

## 5. Dependências

Nenhuma. Depende apenas da ADR 0025 escrita e aceita antes do código ser aberto a revisão.

## 6. Fora de escopo

- O bot continuar tentando `piercing-shot` contra um alvo camuflado e sendo recusado — ver "Fora de
  escopo" do index pai.
- Qualquer mudança em `validateAttack` (ataque básico) — já está correto.
- A habilidade `bless` (da entrega irmã `piercing-and-bless`) — não existe ainda nesta branch; quando
  existir, I1 já a protege por construção (não é `damage`).

## 7. ADR 0025 — esboço

**Camouflage blocks direct abilities, not splash**, escrita antes do código. Registra:

1. Uma habilidade de dano com `radius: 0` mirada na célula de uma unidade camuflada é recusada
   `target-hidden`, pela mesma razão que um ataque básico já é.
2. Uma habilidade de dano com `radius > 0` continua alcançando e acertando uma unidade camuflada que
   esteja numa das células cobertas — a metade de decisão 2A sobre splash permanece.
3. Um efeito não-`damage` (cura, buff, terreno, reviver) nunca é bloqueado por camuflagem, ainda que
   `radius: 0` — camuflagem esconde de ataque, não de ajuda.
4. Nenhum `RejectReason` novo é criado; reusa `target-hidden`.

Amenda a ADR 0023 §6, decisão 2A: a frase "Damaging abilities still reach the cell and hit it" passa a
valer só para `radius > 0`; para `radius: 0` ela se inverte.
