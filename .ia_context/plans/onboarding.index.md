# Index — Onboarding (intro e tutorial)

**Criado em:** 2026-10-14
**Roadmap:** [ROADMAP.md](../../ROADMAP.md) § M3.5. Onboarding

## Escopo

Motivado por feedback de jogadores no playtest do M3: não entenderam o conceito do jogo nem como
jogar. Duas peças, uma sequência só: cards de história (o teste de admissão da Agência de Controle
do Sobrenatural) seguidos por cards estáticos de como jogar (grade e altura, iniciativa, mover e
atacar, recursos, cobertura/direção/altura e a chance de acerto, habilidades). Sem passo guiado
sobre o tabuleiro real — decisão do dono, 2026-10-14.

## Decisões já tomadas (dono, 2026-10-14)

| # | Pergunta | Resposta |
|---|---|---|
| D1 | Onde vive tecnicamente? | DOM, como a title screen — não Phaser. |
| D2 | Profundidade do tutorial | Estático: telas explicativas, sem travar nenhuma ação na partida real. |
| D3 | Onde entra no ROADMAP | Milestone novo e solto, M3.5, entre M3 e M4. |
| D4 | Pular em partidas seguintes | Sim, via `localStorage`, sem depender de conta (M4 ainda não existe). |

## Milestones

### Frontend:

| # | Plano | Status | PR |
|---|---|---|---|
| 1 | [onboarding-m1-logic.plan.md](./onboarding-m1-logic.plan.md) | [ ] pendente | — |
| 2 | [onboarding-m2-integration.plan.md](./onboarding-m2-integration.plan.md) | [ ] pendente | — |
| 3 | [onboarding-m3-design.plan.md](./onboarding-m3-design.plan.md) | [ ] pendente | — |

## Notas de dependência

- m1 (Logic) não depende de nada: conteúdo, máquina de estado dos passos e a flag de "já visto" são
  módulos puros, sem DOM.
- m2 (Integration) depende de m1 aprovado: liga os módulos puros a um HTML real — uma camada própria,
  independente de `title.ts` — e aos testes de integração.
- m3 (Design) depende de m2 aprovado. Este projeto não tem um design já aprovado para esta tela, então
  m3 cobre o CSS e o teste de contraste, na convenção de `visual-identity.lesson.md`.
- Nenhuma ADR nova: isto é conteúdo e UX, não uma regra de jogo — o mesmo tratamento que
  `title-screen` e `visual-identity` já tiveram, nenhum dos dois abriu ADR.

## Fora de escopo

- Tutorial guiado/interativo sobre o tabuleiro real (travar ações, tooltips contextuais durante a
  partida) — fica para uma iteração futura, se o feedback depois desta entrega ainda pedir.
- Persistência por conta (M4). A flag de "já visto" é só do navegador.
- Qualquer alteração a `connect-flow.ts` ou à sessão: o onboarding nunca atrasa nem participa da
  conexão com o servidor.
