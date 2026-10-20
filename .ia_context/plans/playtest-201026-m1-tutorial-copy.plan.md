# Plan — Reword the "Your Squad" tutorial card

**Milestone:** —
**Feature pai:** [playtest-201026.index.md](./playtest-201026.index.md), item 1
**Criado em:** 2026-10-20
**Status:** pendente

## 1. Objetivo

Trocar o texto do card `story-squad` do onboarding, que hoje lê como preenchimento genérico de IA, por
um fecho mais direto, nos dois idiomas que o catálogo carrega.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `frontend/src/i18n/catalog.en-US.ts` | modificar | `onboarding.story-squad.body` (linhas 46-48) troca o fecho da frase |
| `frontend/src/i18n/catalog.pt-BR.ts` | modificar | `onboarding.story-squad.body` (linhas 55-57), tradução equivalente do novo fecho |

Nenhum outro arquivo muda: `frontend/src/onboarding/onboarding.ts` e `content.ts` leem o card
genericamente pelas chaves `onboarding.<id>.heading`/`.body`.

**Confirmado na exploração (`frontend/src/i18n/catalog.test.ts`)**: **pt-BR é a catalogação de
referência** (suas chaves são o tipo; en-US que não traduz uma chave recebe o texto em português como
fallback) — o oposto do que uma primeira leitura sugeriria. O arquivo de teste tem dois tipos de
verificação, nenhum dos quais trava o texto desta milestone:
1. **Paridade de chaves**: `Object.keys(enUS).sort()` deve ser igual a `Object.keys(ptBR).sort()` — já
   satisfeito, pois nenhuma chave é criada ou removida.
2. **Completude de tradução por área**: um teste específico (`untranslatedOnboarding`) garante que
   nenhuma chave `onboarding.*` fique sem tradução em en-US — já satisfeito, pois ambas as chaves
   continuam preenchidas.

Não há, hoje, nenhuma asserção que trave o texto literal de `onboarding.story-squad.body` (diferente do
que o arquivo faz para o texto do título e do log, que são pinados literalmente) — então não há teste a
atualizar além de rodar a suíte para confirmar que as duas verificações acima continuam verdes.

## 3. Contrato da camada

Mudança de dado (string literal), não de código. Não há método público novo, nem exceção nova.

- **O que muda**: o valor de duas chaves do catálogo de i18n, em dois arquivos.
- **O que não muda**: a chave `story-squad`, o heading ("Your squad" / "O seu esquadrão"), a ordem dos
  cards, e qualquer lógica de renderização do onboarding.
- **Limite explícito**: esta milestone não toca em nenhum outro card do tutorial, mesmo que também
  pareça "cringe" — só o que o feedback citou.

### Texto proposto

**EN (en-US)**, mantendo a primeira metade e substituindo o fecho pelo texto que o feedback já deu
literalmente:

> You go into the alley with three agents — a sniper, a wizard and a priest, each bringing their own
> set of skills and excelling at different situations in combat.

**PT (pt-BR)** — tradução equivalente proposta (o feedback não deu o texto em português; isto é uma
escolha de implementação, ver §6):

> Você entra no beco com três agentes — um sniper, um wizard e um priest, cada um trazendo seu próprio
> conjunto de habilidades e se destacando em diferentes situações de combate.

## 4. Testes previstos

**Unitários:**
- [ ] `frontend/src/i18n/catalog.test.ts` continua verde: a paridade de chaves entre `enUS` e `ptBR`
  (`Object.keys(enUS).sort()` === `Object.keys(ptBR).sort()`) e a completude de `onboarding.*` em
  en-US (`missingKeys('en-US')` sem nenhuma chave `onboarding.`).
- [ ] Rodar a suíte de i18n existente (`npm run test -w frontend` filtrado por `i18n`) e confirmar verde.

Não há caso de borda, erro de validação ou erro de negócio aqui: é troca de string.

## 5. Dependências

Nenhuma. Não depende de nenhum outro milestone deste index.

## 6. Fora de escopo

- Qualquer mudança visual ou de layout do card — é só o texto.
- Revisar os outros cards do onboarding.
- A tradução pt-BR exata é uma escolha desta plano, não um pedido literal do feedback (que só deu o
  texto em inglês); o revisor deve prestar atenção nela e pode pedir ajuste de tom antes do PR.
