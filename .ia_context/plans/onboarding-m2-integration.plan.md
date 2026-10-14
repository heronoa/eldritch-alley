# Plano — Onboarding (integração)

**Milestone:** m2-integration
**Feature pai:** onboarding
**Criado em:** 2026-10-14
**Status:** pendente

## 1. Objetivo

Liga os módulos puros da m1 a uma tela real: uma camada por cima do título, independente de
`title.ts`, que aparece sozinha na primeira visita, pode ser pulada ou concluída, e pode ser reaberta
a qualquer momento por um link no rodapé do título. A conexão com o servidor (`connect-flow.ts`,
`Session`) nunca é tocada.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---|---|---|
| `frontend/index.html` | modificar | Um `<div id="onboarding" role="dialog" aria-modal="true" hidden>` com o card atual (`heading`, `body`), os controles (`back`, `advance`/`finish`, `skip`) e os pontos de passo, no mesmo padrão de fallback que `#notice` já usa (texto fixo em português, reescrito pelo catálogo quando o script sobe). Um link `id="how-to-play"` novo no `<footer>` existente. A tag `<script type="module" src="/src/onboarding/onboarding.ts">`, ao lado da de `title.ts` |
| `frontend/src/onboarding/onboarding.ts` | criar | A versão DOM, no molde de `title/title.ts`: lê `hasSeenOnboarding`, decide se abre sozinho no load; os botões chamam `flow.ts`; cada card é escrito com `copy.ts`; ao chegar em `done` (fim ou pular) chama `markOnboardingSeen` e esconde o overlay; o link do rodapé sempre abre, nunca marca como visto (é uma consulta, não uma primeira vez) |
| `frontend/src/title/title.ts` | modificar | Expõe um jeito de avisar a troca de idioma para fora de si mesmo (um `onLocaleChange(handler)`, no mesmo molde de `whenTitleShown` que `main.ts` já usa), chamado de dentro de `switchLanguage`. É a única linha que `onboarding.ts` precisa de `title.ts` — para reescrever o card aberto se o jogador trocar o idioma com o overlay em tela |
| `frontend/src/onboarding/onboarding.test.ts` | criar | Seção 4, com jsdom (o ambiente que `storage.test.ts` e os testes de `title/` já usam) |

## 3. Contrato da camada

**Visibilidade.** `#onboarding` começa `hidden`. No load, `onboarding.ts` remove `hidden` se e somente
se `hasSeenOnboarding(browserStorage())` for `false`. O `#cta` do título permanece no DOM e utilizável
por teclado atrás do overlay — focável, mas o overlay captura o foco enquanto aberto (o mesmo ciclo de
Tab que `#notice` já implementa), então não há necessidade de desabilitar o botão por baixo.

**O link do rodapé.** Sempre visível, sempre reabre `#onboarding` do passo 0, independente da flag.
Não muda a flag.

**O que esta camada não faz.** Não decide o roteiro de conexão: `press()`, `handOver()` e tudo em
`connect-flow.ts` continuam exatamente como estão. Não bloqueia `Enter`/`cta` por baixo além do que o
foco preso já garante. Não guarda nenhum estado que a m1 não exponha.

## 4. Testes previstos

**Unitários/jsdom:**
- [ ] Primeira visita (storage vazio): `#onboarding` perde `hidden` no load
- [ ] Visita com a flag marcada: `#onboarding` continua `hidden` no load
- [ ] `skip` em qualquer passo marca a flag e esconde o overlay
- [ ] `advance` no último card marca a flag e esconde o overlay
- [ ] O link do rodapé reabre o overlay no passo 0 mesmo com a flag já marcada, e não altera a flag
- [ ] Trocar o idioma com o overlay aberto reescreve o card atual sem mudar de passo
- [ ] Tab dentro do overlay aberto nunca sai dele (mesmo teste de ciclo que `notice` já tem em `title`)

**E2E:** nenhum além do jsdom acima — o projeto não roda Playwright hoje (`frontend/package.json` só
tem Vitest); abrir essa frente fica fora de escopo desta milestone.

## 5. Dependências

- m1 (Logic) aprovado: `flow.ts`, `seen.ts`, `copy.ts`, `content.ts`.
- Nenhuma dependência de backend, sessão ou Phaser.

## 6. Fora de escopo

- O CSS do overlay — nesta milestone ele funciona, mas sem a identidade visual (m3 cuida disso); os
  testes de integração não dependem de estilo.
- Qualquer mudança em `main.ts`, `BootScene`, `MatchScene` ou no fluxo de conexão.
