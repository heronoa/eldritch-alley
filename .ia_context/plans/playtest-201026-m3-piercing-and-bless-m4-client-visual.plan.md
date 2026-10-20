# Plan — Client visual: the Blessed indicator

**Milestone:** m4-client-visual
**Feature pai:** [playtest-201026-m3-piercing-and-bless.index.md](./playtest-201026-m3-piercing-and-bless.index.md)
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Dar ao jogador um sinal visual de que uma unidade está abençoada, espelhando o padrão que a silhueta
branca do Camouflage já estabeleceu em `frontend/src/scenes/units.ts`, e fazer a verificação manual
desta entrega (o repositório não tem infraestrutura de teste visual).

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `frontend/src/scenes/units.ts` | modificar | Novo método `setBlessed(active: boolean)` (ao lado de `setCamouflage`, linha 467) — um ícone/brilho pequeno sobre a figura, distinto da silhueta do Camouflage; chamado onde `setCamouflage` já é chamado (linhas 399, 421) e também quando o estado chega com `blessed !== null` |
| `frontend/src/view/theme.ts` | modificar | Nova cor para o indicador de Bless (ex. `BLESSED_INDICATOR_COLOR`), distinta da cor do Camouflage |
| `frontend/src/view/depth.ts` | modificar, se necessário | Confirmar que o novo indicador tem uma camada (`LAYER`) definida — provavelmente a mesma camada de outros ícones de status, se já existir uma |
| `frontend/src/scenes/MatchScene.ts` | modificar | Garante que `setBlessed` é chamado na sincronização de estado de cada unidade, igual a `setCamouflage` |
| `frontend/src/scenes/units.test.ts` | modificar | Caso novo cobrindo `setBlessed(true/false)` |

## 3. Contrato da camada

- **`UnitSprite.setBlessed(active: boolean): void`** — mostra ou esconde o indicador. Sem retorno, sem
  leitura de estado por conta própria: quem chama decide `active` a partir de `unit.blessed !== null`.
- **O que esta camada não faz**: não decide a duração nem o bônus (isso já aconteceu no engine/server);
  não anima a transição além do que o padrão visual do projeto já faz para outros status.

## 4. Testes previstos

**Unitários:**
- [ ] `setBlessed(true)` mostra o indicador; `setBlessed(false)` esconde.
- [ ] Uma unidade abençoada que morre não mantém o indicador (mesma regra que já vale para Camouflage:
  um corpo não carrega status).

**Manual (pré-revisão, sem infraestrutura de teste visual):**
- [ ] O indicador aparece sobre a unidade abençoada e desaparece quando o status termina ou a unidade
  morre.
- [ ] O indicador não se confunde visualmente com a silhueta de Camouflage nem com o sprite prono.
- [ ] Largura de celular: o indicador não quebra o layout da figura em telas estreitas.

## 5. Dependências

Depende de m3 aprovado — lê `unit.blessed` do estado que m3's lógica já consome corretamente.

## 6. Fora de escopo

- Qualquer animação de entrada/saída além do padrão já usado por outros indicadores de status.
- Um painel de status na ficha da unidade (mesma decisão que `secondary-abilities` tomou em sua I8: o
  jogador lê o status pelo sprite, pelo menu de habilidades e pelo log).
