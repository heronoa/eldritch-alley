# Plano — Onboarding (design)

**Milestone:** m3-design
**Feature pai:** onboarding
**Criado em:** 2026-10-14
**Status:** implementado, aguardando revisão; correções da revisão aplicadas (2026-10-16)

## 1. Objetivo

A aparência do overlay, na mesma identidade do resto do cliente (palette noturna, tinta de papel, a
mesma tipografia do título), com o contraste medido e não só visto — a lição registrada em
`visual-identity.lesson.md` ("cada par de texto e marcador é um teste, não um julgamento").

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---|---|---|
| `frontend/src/onboarding/onboarding.css` | criar | O layout do card, os pontos de passo, os três controles e o link do rodapé, lendo as mesmas variáveis/tokens que `title/title.css` já define (sem duplicar cor como valor literal) |
| `frontend/index.html` | modificar | `<link rel="stylesheet" href="/src/onboarding/onboarding.css">`, ao lado do de `title.css` |
| `frontend/src/onboarding/contrast.test.ts` | criar | Cada par texto/fundo do overlay (card, controles, o link do rodapé em seus estados hover/focus — a armadilha que a lição de `visual-identity` já registrou) passa o piso de 4.5:1, lendo o cálculo de `view/contrast.ts`, ou o dono assina a exceção explicitamente, como já aconteceu na title screen |

## 3. Contrato da camada

Só CSS e a medição de contraste. Nenhum arquivo `.ts` de regra muda de comportamento aqui — se um
teste desta milestone pede uma mudança de marcação ou de estado, isso é sinal de que a m2 ficou
incompleta, não trabalho para a m3.

## 4. Testes previstos

**Unitários:**
- [x] Todo par texto/fundo do overlay listado em `contrast.test.ts` passa 4.5:1, incluindo hover e
      focus dos três controles e do link do rodapé
- [x] Nenhum valor de cor novo fora do que `view/theme.ts`/`title.css` já define — o teste falha se
      uma cor literal nova aparecer em `onboarding.css`

**E2E:** nenhum.

## 5. Dependências

m2 (Integration) aprovado.

## 6. Fora de escopo

- Qualquer ilustração nova (arte do carimbo, ícones por tópico) — os cards são texto, como o resto do
  título hoje; arte fica para quando (e se) o feedback pedir.

## 7. Correções da revisão (2026-10-16)

Duas correções pedidas na revisão do dono. A primeira é um defeito da m3: o overlay cobria o seletor de
idioma, então a sequência abria no idioma do navegador sem nenhuma forma de trocá-lo. A segunda é um
defeito de texto da m1: o card do esquadrão nomeava as classes do pitch, não as que a partida escala.

| Correção | Arquivos | O que muda |
|---|---|---|
| A língua tinha de ser escolhível já no primeiro card | `frontend/index.html`, `frontend/src/title/title.css`, `frontend/src/onboarding/onboarding.css` | O seletor sai de dentro de `.title` e vira caixa própria da página (`position: fixed`, `z-index: 2`); `#game` sobe de 2 para 3 para continuar cobrindo o seletor durante a partida. `onboarding.css` perde uma comparação que ficou sem referente |
| O card do esquadrão nomeava as classes erradas | `frontend/src/i18n/catalog.pt-BR.ts`, `frontend/src/i18n/catalog.en-US.ts` | "soldados, iniciados e adeptos" (classes base) vira "um sniper, um wizard e um priest" — as avançadas, que são as que `backend/game-server/src/map.ts` escala |
| (guarda) A ordem das camadas da página | `frontend/src/onboarding/layers.test.ts` | Criar: prende os números (sequência e aviso em 1, seletor em 2, tabuleiro em 3) e a estrutura que os sustenta |

O `z-index` sozinho não resolvia a primeira, e isso foi medido em navegador em vez de deduzido: `.title`
é `position: fixed`, e uma caixa fixa abre um contexto de empilhamento, então um número escrito lá
dentro ordena o seletor contra o texto do título e contra mais nada — com `elementFromPoint` no canto do
seletor e a sequência aberta, o clique caiu em `.onboarding` mesmo com `z-index: 2` no `.lang`, e só caiu
no botão depois que o seletor passou a ser irmão de `.title`. O teste prende o que se lê; o ponteiro é
do navegador, e foi conferido nos dois estados.

**Pendência conhecida, não corrigida aqui:** o Tab da sequência fica preso nos seus três controles
(`aria-modal`), então quem joga só de teclado ainda não alcança o seletor no primeiro card — o caminho é
Pular (ou ler até o fim) e reabrir pelo link do rodapé. Estender o ciclo de foco aos botões de idioma é
uma decisão de design (diálogo modal de verdade, ou cromo alcançável) e ficou para o dono.
