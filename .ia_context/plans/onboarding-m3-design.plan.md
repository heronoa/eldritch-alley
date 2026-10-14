# Plano — Onboarding (design)

**Milestone:** m3-design
**Feature pai:** onboarding
**Criado em:** 2026-10-14
**Status:** pendente

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
- [ ] Todo par texto/fundo do overlay listado em `contrast.test.ts` passa 4.5:1, incluindo hover e
      focus dos três controles e do link do rodapé
- [ ] Nenhum valor de cor novo fora do que `view/theme.ts`/`title.css` já define — o teste falha se
      uma cor literal nova aparecer em `onboarding.css`

**E2E:** nenhum.

## 5. Dependências

m2 (Integration) aprovado.

## 6. Fora de escopo

- Qualquer ilustração nova (arte do carimbo, ícones por tópico) — os cards são texto, como o resto do
  título hoje; arte fica para quando (e se) o feedback pedir.
