# Plano — DT-73: `applyEvent('moved')` valida o caminho antes de aplicar

**Milestone:** — (camada única: engine. O gatilho original é o início do M4)
**Feature pai:** —
**Criado em:** 2026-10-06
**Status:** aplicado, aguardando revisão (opção a, lançar `Error`; aplicado por pedido explícito do responsável, com o gate do M2-b/M4 em aberto)

> **Alerta de gate (regra do CLAUDE do backend):** o gatilho do DT-73 é o início do M4, e o M4 ainda não começou. Antes dele, o ROADMAP mostra o M2-b com um teste pendente (reconexão através do túnel, `ROADMAP.md`, seção M2-b) e o ponto de comparação do M2 ainda não decidido. O M3 só acontece "se o projeto for escolhido". Este plano está à frente do gatilho. Ele não bloqueia nada e pode ser escrito agora, mas a **execução** precisa do aval explícito do responsável: "prosseguir mesmo assim". Sugestão para desbloquear: fechar o teste de reconexão do M2-b, ou aceitar o trabalho antecipado.

## 1. Objetivo

`applyEvent` recusa um evento `moved` cujo caminho não seja uma caminhada válida a partir de `from`, em vez de aplicar custo e posição erradas em silêncio. Hoje o custo é calculado sobre os passos recebidos sem conferir adjacência, limites, perfil ou o destino. Um replay de eventos armazenados com caminho malformado produz um estado final errado sem erro.

## 2. Arquivos alterados

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `backend/engine/src/events.ts` | modificar | No ramo `moved`, valida o evento antes de calcular o custo (regras abaixo). |
| `backend/engine/src/events.test.ts` | modificar | Casos de caminho válido e inválido (seção 4). |

## 3. Contrato da camada

- **`applyEvent(state, event)`**: assinatura inalterada. Para um `moved` válido, o resultado é o mesmo de hoje.
- **Validações do `moved`**, nesta ordem:
  1. `event.path` não vazio.
  2. Último passo de `event.path` igual a `event.to`.
  3. Cada passo dentro do tabuleiro (`inBounds`).
  4. Cada passo adjacente ao anterior, começando em `event.from`: Chebyshev igual a 1, mesmo vizinho que `findPath`.
  5. Cada passo permitido pelo perfil da unidade (`stepAllowed`).
  6. Custo total do caminho menor ou igual a `movementLeft` antes do evento.
- **Exceções esperadas:** um `Error` com mensagem que diz qual regra falhou (ex.: `moved: step 2 is not adjacent to the previous cell`). Um evento inválido nunca é aplicado parcialmente.
- **Entrada imutável:** o estado recebido nunca muda, nem quando a validação falha. Hoje `cloneState` já garante isso; a validação roda sobre o clone ou antes dele.
- **O que esta camada não faz:** não confere ocupação das células (quem está onde é regra do `findPath` na hora da ação, e replicá-la aqui acopla o replay ao estado em cada passo); não muda o servidor nem a persistência (M4); não reinterpreta eventos que não sejam `moved`.

### Decisão pendente de aprovação

**Como reportar um caminho inválido.** Recomendo **(a)**.
- **(a) Lançar `Error` em `applyEvent`.** Replay falha alto e cedo, e o erro aparece no teste ou no carregamento. Simples, e não muda a assinatura. *Recomendo.*
- **(b) `applyEvents` devolve um resultado com erro, sem lançar.** Quem chama decide o que fazer. Mais código no caminho feliz e uma assinatura nova para `applyEvents`.
- **(c) Validar só num `validateEvent` separado, chamado pelo carregador do M4.** Mantém `applyEvent` barato. O risco é o carregador esquecer a validação, que é exatamente o problema que o DT-73 descreve.

## 4. Testes previstos

**Unitários** (`events.test.ts`):
- [ ] Caminho válido de dois passos com custo de subida: mesma posição e mesmo `movementLeft` de hoje.
- [ ] Caminho vazio é recusado.
- [ ] Último passo diferente de `to` é recusado.
- [ ] Passo fora do tabuleiro é recusado.
- [ ] Passo não adjacente (salto de 2 células) é recusado.
- [ ] Passo de subida acima de `maxStepUp` é recusado, com perfil explícito de `maxStepUp 1`.
- [ ] Custo maior que `movementLeft` é recusado.
- [ ] Em todos os casos recusados, o estado de entrada fica igual ao que era antes (comparação profunda).

**Propriedade** (`properties.test.ts` ou no próprio `events.test.ts`):
- [ ] Para cada caminho devolvido por `findPath` em mapas de exemplo, `applyEvent` aceita o evento `moved` correspondente. Garante que a validação não recusa o que o motor produz.

**Guarda:** `no-node-deps.test.ts` continua passando (nenhum import de I/O).

## 5. Dependências

- Nenhuma dependência de outro milestone para o código.
- Gate de milestone descrito no alerta do topo.

## 6. Fora de escopo

- Conferir ocupação das células no replay (ver seção 3).
- Qualquer mudança em `battle-room.ts`, em `protocol.ts` ou no cliente.
- Persistência, carregamento de eventos e replay endpoint (M4).
- Validar eventos que não sejam `moved` (`attacked`, `turn-ended` e os outros têm outras entradas, e o DT-73 é sobre o caminho).
- Remover o fallback "evento sem caminho usa só o destino" do comentário em `events.ts`. Se a validação do passo 1 passar a exigir caminho, esse fallback vira código morto; a remoção fica para o mesmo PR só se o responsável aprovar.
