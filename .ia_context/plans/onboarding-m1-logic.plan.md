# Plano — Onboarding (lógica)

**Milestone:** m1-logic
**Feature pai:** onboarding
**Criado em:** 2026-10-14
**Status:** pendente

## 1. Objetivo

Os módulos puros que decidem o quê mostrar e quando: o conteúdo dos cards (história + como-jogar), a
máquina de estado dos passos (avançar/voltar/pular/concluir) e a flag de "já visto" no navegador.
Nenhum DOM aqui — isso é a m2. O contrato que esta camada expõe é o que `onboarding.ts` (m2) consome
sem reimplementar nenhuma regra.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---|---|---|
| `frontend/src/onboarding/content.ts` | criar | A lista ordenada de cards: 2-3 de história (o teste de admissão da Agência), depois um por tópico de como jogar (grade e altura, fila de iniciativa, mover e atacar, munição/mana e recarga, cobertura/direção/altura e a badge de chance de acerto, habilidades). Cada card é só um id e uma categoria (`story` \| `howto`); o texto em si vem do catálogo, lido em `copy.ts` |
| `frontend/src/onboarding/content.test.ts` | criar | A ordem é história antes de como-jogar; nenhum id se repete; todo id tem uma entrada em `copy.ts` nos dois locales (teste cruzado com `i18n/catalog.test.ts`) |
| `frontend/src/onboarding/flow.ts` | criar | `OnboardingFlow` e `next(flow, event)`, no mesmo molde de `title/connect-flow.ts`: eventos `advance`, `back`, `skip`, `finish`; o passo nunca sai de `[0, total-1]`; `skip` e o último `advance` chegam ambos a um estado terminal `done` |
| `frontend/src/onboarding/flow.test.ts` | criar | Seção 4 |
| `frontend/src/onboarding/seen.ts` | criar | `hasSeenOnboarding(storage)` e `markOnboardingSeen(storage)`, sobre o `KeyValueStorage` que `storage/browser.ts` já define. Uma chave versionada (`eldritch-alley:onboarding-seen:v1`) — mudar `content.ts` de um jeito que mereça ser revisto de novo é subir a versão, não uma regra nova |
| `frontend/src/onboarding/seen.test.ts` | criar | Seção 4 |
| `frontend/src/onboarding/copy.ts` | criar | Uma linha por card (`heading`, `body`) mais os controles (`advance`, `back`, `skip`, `finish`, o link `howToPlay` no rodapé do título), lidos de `t('onboarding.*')` a cada chamada — o mesmo padrão de `title/copy.ts`, para sobreviver a uma troca de idioma em tempo real |
| `frontend/src/onboarding/copy.test.ts` | criar | Toda chave que `content.ts` pede tem resposta aqui, nos dois locales |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modificar | As chaves `onboarding.*`: os cards e os controles |
| `frontend/src/i18n/catalog.test.ts` | modificar | As novas chaves entram no teste existente de paridade entre os dois catálogos |

## 3. Contrato da camada

**`content.ts`** — `ONBOARDING_CARDS: readonly OnboardingCard[]`, cada um `{ id: string, category:
'story' | 'howto' }`. Puro, sem efeito colateral, nunca lê o idioma.

**`flow.ts`** — `next(flow: OnboardingFlow, event: FlowEvent): OnboardingFlow`. Responde um evento que
ignora devolvendo o mesmo objeto (o mesmo contrato de `connect-flow.ts`), então quem chama testa
`flow === before` para saber se algo mudou. `flow.step` é o índice em `ONBOARDING_CARDS`;
`flow.state` é `'active' | 'done'`.

**`seen.ts`** — duas funções, nenhuma classe. `hasSeenOnboarding` nunca lança: `storage` nulo ou que
lança é "não visto". `markOnboardingSeen` também engole o erro de um `setItem` recusado — perder a
marca custa, no pior caso, mostrar a sequência de novo, nunca travar a tela.

**`copy.ts`** — `onboardingCopy(): OnboardingCopy`, um mapa fechado de toda linha que `content.ts` e
os controles pedem. Uma chave que falta aqui é erro de compilação, igual a `title/copy.ts`.

**O que esta camada não faz.** Não decide se a sequência aparece agora — isso é o DOM da m2, lendo
`hasSeenOnboarding` e decidindo. Não sabe que existe um `#onboarding` no HTML. Não toca
`connect-flow.ts`, `Session` nem o `localStorage` de outra feature.

## 4. Testes previstos

**Unitários:**
- [ ] `ONBOARDING_CARDS` começa com todo card `story` antes de qualquer `howto`, e não repete id
- [ ] `next(flow, 'advance')` no último passo leva a `{ state: 'done' }`, não a um índice fora da lista
- [ ] `next(flow, 'back')` no primeiro passo devolve o mesmo `flow` (evento ignorado)
- [ ] `next(flow, 'skip')` leva a `{ state: 'done' }` de qualquer passo
- [ ] `next` depois de `done` ignora todo evento
- [ ] `hasSeenOnboarding` devolve `false` quando `storage` é `null`, quando a chave não existe, e quando `getItem` lança
- [ ] `markOnboardingSeen` seguido de `hasSeenOnboarding` com o mesmo storage devolve `true`
- [ ] `markOnboardingSeen` não lança quando `setItem` lança
- [ ] `onboardingCopy()` tem uma entrada para todo id de `ONBOARDING_CARDS`, nos dois locales
- [ ] `catalog.test.ts`: toda chave `onboarding.*` existe nos dois catálogos (teste de paridade já existente, estendido)

**E2E:** nenhum nesta milestone — não há DOM aqui.

## 5. Dependências

Nenhuma. Não lê `title/`, `net/` nem `scenes/`.

## 6. Fora de escopo

- O texto final de cada card por extenso — a lista de tópicos acima é o contrato de conteúdo; a
  redação fica para a implementação, revisada pelo dono antes do merge.
- Qualquer leitura ou escrita de DOM.
- Decidir a chave exata de versão (`v1`) além do princípio — fica para a implementação se o nome
  final dos tópicos mudar antes do merge.
