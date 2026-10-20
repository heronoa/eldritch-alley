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
| `frontend/src/i18n/catalog.en-US.test.ts` / `pt-BR.test.ts` (se existir um teste de snapshot/paridade de chaves) | verificar | Nenhuma chave muda de nome, só o valor — não deveria quebrar, mas confirmar que não há teste de snapshot do texto literal |

Nenhum outro arquivo muda: `frontend/src/onboarding/onboarding.ts` e `content.ts` leem o card
genericamente pelas chaves `onboarding.<id>.heading`/`.body` (DT confirmado na exploração).

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
- [ ] Se existir teste de paridade de chaves entre `catalog.en-US.ts` e `catalog.pt-BR.ts` (chaves
  presentes nos dois lados), ele continua passando sem alteração — nenhuma chave foi adicionada ou
  removida.
- [ ] Rodar a suíte de i18n existente (`npm run test -w frontend` filtrado por `i18n`) e confirmar verde.

Não há caso de borda, erro de validação ou erro de negócio aqui: é troca de string.

## 5. Dependências

Nenhuma. Não depende de nenhum outro milestone deste index.

## 6. Fora de escopo

- Qualquer mudança visual ou de layout do card — é só o texto.
- Revisar os outros cards do onboarding.
- A tradução pt-BR exata é uma escolha desta plano, não um pedido literal do feedback (que só deu o
  texto em inglês); o revisor deve prestar atenção nela e pode pedir ajuste de tom antes do PR.
