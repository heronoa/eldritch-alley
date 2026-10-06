# Plano — Lote 1 de dívidas técnicas: ruído de teste, ADR 0008 e DT-25

**Milestone:** — (sem milestone; dívidas em `inputs/technical-debt.md`)
**Feature pai:** —
**Criado em:** 2026-10-06
**Status:** aplicado, aguardando revisão (ADR 0008 confirmado pelo responsável)

## 1. Objetivo

Fechar três dívidas de baixo risco, sem mudança de comportamento: parar de imprimir o stack de `room full` no teste de sala cheia (DT-66), corrigir a frase do ADR 0008 que contradiz a própria decisão (DT-22) e fechar DT-25, que já está resolvida pelo trabalho do EA-7. Não há contrato novo.

DT-70 e DT-72 não entram aqui: foram para dentro da PR do EA-2 (ver `ea-2-ea-7-movement-path.plan.md`, seção Cliente).

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `backend/game-server/src/battle-room.test.ts` | modificar | No caso `refuses a second human with "room full"`, captura o `console.error` com `vi.spyOn` e afirma que a mensagem `room full` foi registrada. O stack deixa de sair na saída do teste. |
| `docs/adr/0008-colyseus-0.18.md` | modificar | Na seção Decision, a frase "which merges into the existing metadata" passa a dizer que `setMetadata` substitui o objeto inteiro. A decisão (usar `setMetadata`, não atribuir o campo) não muda. |
| `.ia_context/inputs/technical-debt.md` | modificar | Remove DT-22, DT-25 e DT-66 da seção Open. |
| `.ia_context/inputs/technical-debt-closed.md` | modificar | Adiciona as três linhas com a resolução de cada uma. |

## 3. Contrato da camada

Não há contrato público alterado. Nenhuma assinatura, evento, mensagem ou rejeição muda.

- **Teste DT-66:** o texto da exceção `room full` continua igual em `battle-room.ts:107`. O teste passa a afirmar que o servidor registrou esse texto, então a ligação com `frontend/src/net/join-failure.ts` continua travada.
- **ADR 0008:** só o texto que contradiz a própria decisão muda. Nenhuma outra seção é reescrita.
- **O que esta camada não faz:** não altera `battle-room.ts`, não altera o log do Colyseus em produção e não muda o comportamento do `setMetadata`.

## 4. Testes previstos

**Verificação do DT-66:**
- [ ] O caso `refuses a second human with "room full"` continua passando.
- [ ] O `console.error` espionado recebe uma chamada cujo conteúdo contém `room full`.
- [ ] A saída do teste não mostra mais o stack de `BattleRoom.onJoin`.

**ADR e documentação:** sem teste automatizado. Revisão por leitura: a frase nova bate com `backend/game-server/node_modules/@colyseus/core/build/Room.cjs:693-696` (`this._listing.metadata = meta`, substituição) e com o comentário da linha 736.

**Ambiente:** `vitest` exige Node 22 ou mais novo. O `node` padrão do shell é 18.19.1. Use `~/.nvm/versions/node/v22.19.0/bin` antes de rodar `npx vitest run`.

## 5. Dependências

Nenhuma. Pode ser feito antes ou depois do EA-2.

## 6. Fora de escopo

- **Mensagem `onMessage() not registered for type 'state'`** que aparece na mesma execução. Vem do SDK do cliente de teste, não do servidor. É outra dívida: se o responsável aprovar, entra como DT novo.
- **Silenciar o log globalmente** na suíte (por exemplo, configurar o logger do Colyseus). Afeta todos os testes e não só este caso.
- **Mudar a decisão do ADR 0008** (usar `setMetadata` e não atribuir o campo). Só o texto que se contradiz muda.
- **DT-21 e DT-23**, que são de outra natureza e têm gatilhos próprios.

## 7. Notas de execução

- **ADR aceito:** a regra de precedência põe ADR acima de tudo. A edição corrige uma frase errada, mas altera um documento aceito. Confirmar com o responsável antes de aplicar.
- **DT-25:** a linha de fechamento diz: "Resolvido pelo EA-7: `selection.ts:71` devolve `move-preview` com `path` e `cost`, e `MatchScene.ts` trata a intenção." Não há código a remover.
