# Plan — Engine: the buff effect, Blessed status and a third active set

**Milestone:** m1-engine
**Feature pai:** [playtest-201026-m3-piercing-and-bless.index.md](./playtest-201026-m3-piercing-and-bless.index.md)
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Dar ao engine um novo tipo de efeito (`buff`), o status `Blessed` que ele escreve, o bônus de chance de
acerto e de dano que esse status concede a quem o carrega, e um terceiro slot em `activeSets` — tudo
registrado na ADR 0024 antes do código, como a ADR 0023 fez para `secondary-abilities`. Esta milestone
expõe o contrato que o game-server (m2) consome.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `docs/adr/0024-a-third-active-set-and-bless.md` | criar | ADR 0024, escrita antes do código (ver §7) |
| `docs/adr/README.md` | modificar | Nova linha da tabela para 0024 |
| `backend/engine/src/types.ts` | modificar | `AbilityEffect` ganha o membro `buff` (linha ~104, junto de `terrain`/`revive`); novo `interface Blessed { turns: number; hitBonus: number; damageBonus: number }` (próximo a `Camouflage`, linha ~114); `Abilities.activeSets` e `UnitState` ganham o terceiro slot (linha 73: `[string \| null, string \| null, string \| null]`); `UnitState` ganha `blessed: Blessed \| null` (próximo a `camouflage`, linha ~226) |
| `backend/engine/src/actions.ts` | modificar | `hitChanceFor` (linha 72-85) soma o bônus de chance de quem ataca; a função nova `blessDamageBonus(unit)` é lida no cômputo de dano do ataque básico (linha 612) e no de uma habilidade de dano (linha ~474); `validateUseAbility` (linha 248) ganha o ramo de validação do `buff` (célula deve ter um aliado vivo, igual ao ramo de `revive`); `carriesAbility`/`abilityEvents` leem o terceiro slot sem mudança de lógica (já iteram `activeSets` genericamente) |
| `backend/engine/src/events.ts` | modificar | Novo evento `buffed` (escreve `blessed` no alvo, análogo ao bloco `camouflage` de `ability-used`, linha ~158); countdown por turno do alvo abençoado (espelha o bloco de `camouflage` em `turn-ended`, linha ~254); `blessed = null` em `unit-defeated` (junto de `camouflage`/`prone`, linha ~207); novo evento `bless-ended` (reason `'expired'`, análogo a `camouflage-ended`) |
| `backend/engine/src/match.ts` | modificar | `newMatch`/validação de setup (linha ~94) passam a aceitar três entradas em `activeSets`, e a inicializar `blessed: null` |
| `backend/engine/src/index.ts` | verificar | Exporta os novos tipos (`Blessed`) se o padrão de exports exigir |
| `backend/engine/src/actions.test.ts`, `events.test.ts`, `match.test.ts`, novo `bless.test.ts` | criar/modificar | Ver §4 |

## 3. Contrato da camada

**Tipos novos / alterados** (consumidos pelo game-server em m2):

```ts
type AbilityEffect =
  | ...
  | { kind: 'buff'; radius: 0; hitBonus: number; damageBonus: number; turns: number };

interface Blessed {
  turns: number;
  hitBonus: number;
  damageBonus: number;
}

interface Abilities {
  activeSets: [string | null, string | null, string | null];
  // ...
}

interface UnitState {
  // ...
  blessed: Blessed | null;
}
```

**Eventos novos**: `{ type: 'buffed'; target: UnitId; hitBonus: number; damageBonus: number; turns: number }`,
`{ type: 'bless-ended'; target: UnitId; reason: 'expired' }`.

**Validação** (`validateUseAbility`): um uso de uma habilidade `buff` é recusado com `target-invalid`
quando a célula mirada não tem um aliado vivo do time do conjurador (o próprio conjurador conta como
aliado de si mesmo). Nenhum `RejectReason` novo é necessário.

**O que esta camada não faz**:
- Não sabe o nome `bless` ou `priest` — como toda ability, o engine lê um id opaco e um efeito.
- Não decide o alcance ou o custo de nenhuma habilidade — isso é dado do catálogo, de m2.
- Não aplica o bônus a nada que não seja `hitChanceFor` e o dano plano de ataque básico/ability — não
  cria um sistema genérico de modificadores além do que o Bless pede.

## 4. Testes previstos

**Unitários:**
- [ ] Castar `bless` em um aliado vivo em alcance — escreve `blessed = { turns: 3, hitBonus: 10,
  damageBonus: 1 }` no alvo (não no conjurador).
- [ ] Castar `bless` numa célula vazia ou com um inimigo — recusado `target-invalid`.
- [ ] Castar `bless` em alcance mas fora de linha de visão — recusado `no-line-of-sight` (I2).
- [ ] O conjurador paga 1 do seu próprio recurso (mana) — pool insuficiente recusa como qualquer outra
  habilidade.
- [ ] Unidade abençoada erra/acerta um ataque básico — `hitChanceFor` soma `+10` à chance; o dano de um
  acerto soma `+1`.
- [ ] Unidade abençoada usa uma habilidade de dano (ex. `piercing-shot`) — o mesmo bônus de chance e de
  dano plano se aplica (I4).
- [ ] Recast de `bless` no mesmo alvo já abençoado — substitui `turns`, não empilha (I5).
- [ ] Countdown: `turns` decresce a cada turno *do alvo abençoado*, não do conjurador; ao chegar a zero,
  emite `bless-ended` com `reason: 'expired'` e `blessed` volta a `null`.
- [ ] Unidade abençoada morre — `blessed` é limpo em `unit-defeated`, igual a `camouflage`/`prone`.
- [ ] `newMatch` aceita um setup com três entradas em `activeSets` e rejeita um com duas ou quatro
  (atualização do teste de validação de `match.ts:94`).
- [ ] Replay: uma partida com um `bless` aplicado re-hasheia igual quando reconstruída a partir dos
  eventos.

**E2E:** não se aplica — esta milestone é só engine, sem HTTP/rota.

Casos de borda cobertos: pool insuficiente, alvo inválido (vazio/inimigo), sem linha de visão, recast,
morte do alvo, terceiro slot vazio (`null`) numa classe sem nova habilidade.

## 5. Dependências

Nenhuma. Depende apenas da ADR 0024 estar escrita e aceita antes do código ser aberto a revisão (mesma
regra que `secondary-abilities` seguiu para a ADR 0023).

## 6. Fora de escopo

- O catálogo de `bless` em si (id, custo, alcance) — isso é dado do game-server, m2.
- O menu do cliente e a terceira linha visual — m3 e m4.
- Qualquer bônus de Bless a algo que não seja chance de acerto ou dano plano (ex. não afeta movimento,
  não afeta resistência).

## 7. ADR 0024 — esboço

**Statuses: a third active set and Bless**, escrita antes do código. Registra:

1. Uma classe pode carregar três habilidades ativas; `activeSets` passa de duas para três entradas
   (emenda à ADR 0023 §1).
2. Um quarto tipo de efeito entra na união `AbilityEffect`: `buff` (emenda à ADR 0016, que fixava dois
   tipos e depois três com a ADR 0023).
3. `UnitState` ganha `blessed`, um status com contagem de turnos como `Camouflage`, mas contado pelos
   turnos do alvo, não do conjurador.
4. O bônus de um `Blessed` se aplica a toda chance de acerto e a todo dano plano que a unidade rola,
   ataque básico e habilidade de dano igualmente, porque ambos já passam por `hitChanceFor`.
5. Um recast substitui a contagem; não empilha.
6. `blessed` termina com a morte da unidade.
7. Todo novo rolamento está em um evento; replay nunca rola de novo.
8. Esta ADR não registra números de jogo específicos de `bless` (custo, alcance, +10/+1) — isso é dado,
   não regra, e vive no game-server (ADR 0016 §1: o engine não conhece nomes nem balanceamento).

Amenda a ADR 0023 §1 (duas ativas → três) e a ADR 0016's union de efeitos.
