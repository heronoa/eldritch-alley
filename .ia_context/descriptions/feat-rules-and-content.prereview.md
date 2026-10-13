# Pre-review — Cover, facing, height advantage and abilities as data (M3, slices 1–3)

**Branch:** `feat/rules-and-content`
**Gerado em:** 2026-10-13

---

### 1. O que testar

Sem rota HTTP exposta nesta mudança (engine e game-server são bibliotecas/serviço de match, não endpoints REST); os cenários críticos de regra são verificados pelos testes unitários abaixo, usados como proxy. A seção de UI tem fluxo manual porque depende de Phaser real.

**Proxy de teste unitário — regras do engine (mais crítico):**
- **Cover não cobre quem está em cima do prop:** `backend/engine/src/cover.test.ts` — "gives no cover from the prop the target itself stands on". Rodar `npm test -w @eldritch-alley/engine -- cover`.
- **Direção e altura não vazam para o dano errado:** `backend/engine/src/facing.test.ts` e `height.test.ts` — height nunca muda dano, direção muda hit e dano, altura muda hit e alcance.
- **Replay determinístico com os quatro modificadores juntos:** `backend/engine/src/properties.test.ts` — "replays every accepted sequence to the same hash". Esse é o teste que pegaria qualquer drift entre cover/direção/altura/habilidade no hash final.
- **Habilidade de área acerta aliados (fogo amigo intencional):** `backend/engine/src/abilities.test.ts` — confirmar visualmente a asserção "allies inside the area take the damage" antes de assumir que é bug em playtest.
- **Regeneração de mana nunca passa da capacidade, e classe de munição nunca regenera:** `backend/engine/src/mana.test.ts`.

**Proxy de teste unitário — bot e replay (server):**
- **Bot usa habilidade quando o score supera o ataque básico, e nunca uma que não pode pagar:** `backend/game-server/src/bot.test.ts`.
- **Partida bot-vs-bot terminada com habilidade reproduz o mesmo hash via eventos:** `backend/game-server/src/integration.test.ts`.

**Fluxo manual — cliente (rodar `npm run dev -w @eldritch-alley/frontend` e jogar uma partida local contra o bot):**
- **Badge de cobertura:** posicionar uma unidade ao lado de um `car`/`crates`/etc. → deve aparecer o texto sobre a cabeça nomeando o(s) lado(s). Desligar "Highlight Covers" no painel de configurações → os losangos de debug desaparecem, mas o badge continua.
- **Menu de habilidade, estado "sem recurso":** zerar a mana/munição da unidade e clicar em "Habilidade" → o menu deve abrir (não ficar morto) e a linha deve aparecer esmaecida, não escondida.
- **Menu de habilidade, happy path:** com recurso suficiente, escolher a linha → o modo arma com o alcance da habilidade escolhida (não sempre a mesma).
- **Impacto visual por tipo de efeito:** usar `fireball` (deve mostrar "blast" com flash em cada célula do raio), `piercing-shot` (deve reusar o tiro do sniper), `area-heal` (deve mostrar "glow" subindo).
- **Log nomeando a habilidade:** após o uso, a linha do log deve dizer o nome da habilidade ("usou Bola de Fogo"), não "usou uma habilidade".
- **Estado vazio do menu:** não há como chegar nele hoje (toda unidade carrega uma habilidade), mas vale confirmar que `abilityOptions` com uma unidade sem `abilities` não quebra o menu — ver `ability-menu.test.ts`, caso "A unit naming no ability offers no rows".

---

### 2. Checklist de código

- [x] Tipagem: `AbilityEffect` é união discriminada (`damage` | `heal`), sem `any`.
- [x] Sem `console.log` ou código de debug deixado nos arquivos novos.
- [x] `resolveHit` é o único ponto que lê cover, direção, altura e resolve o roll — nenhuma duplicação de rolagem em `abilities.ts`.
- [x] `canUseAbility` não tornou o gate de recurso redundante em dois lugares: o botão libera, a linha do menu (`affordable`) é quem bloqueia.
- [ ] **Confirmar que a ausência de controle de `facing` no cliente é a entrega pretendida desta MR**, e não um esquecimento — ver a divergência nomeada na description, seção 1. Se for esquecimento, falta: `face` em `action-shape.ts`, nos dois `protocol.ts`, e um controle na HUD.
- [x] `docs/adr/README.md` reflete a ordem real de aceite dos ADRs 0012–0017 (a numeração mudou em relação ao que os planos m3-02/m3-03 previam — ver description).
- [x] `npm run typecheck` sem erros (`backend/engine`, `backend/game-server`, `backend/platform-api`).
- [ ] `npm run build -w @eldritch-alley/frontend` ainda não executado nesta sessão — confirmar antes de abrir o MR.
- [x] Sem alterações fora do escopo dos cinco planos (m3-01, m3-02, m3-03, EA-15, EA-16), à exceção do commit `af7fd7d`, que só registra dívida técnica.

---

### 3. Checklist de comportamento

**Cover (m3-01 + EA-15):**
- [ ] Um tiro contra uma unidade ao lado de um `car`/`crates`/`dumpster`/`moto`/`ac`/`vent`/`fountain`/`bench` erra com mais frequência do que sem cobertura.
- [ ] Uma unidade em cima do prop de cobertura (não ao lado) não ganha o bônus.
- [ ] O badge de cobertura nomeia o lado certo, nos dois idiomas (pt-BR e en-US, trocar no seletor de idioma).
- [ ] O toggle "Highlight Covers" some com os losangos de debug sem recarregar a página.

**Facing e altura (m3-02):**
- [ ] Um ataque pela retaguarda acerta e causa mais dano que um ataque de frente contra a mesma unidade na mesma posição (reposicionar o atacante entre os dois ataques).
- [ ] Um ataque de um nível de altura acima alcança uma célula fora do alcance normal.
- [ ] A seta de direção na unidade aponta para o lado certo em todas as quatro rotações de câmera.
- [ ] **Não existe hoje** um jeito de o jogador virar a unidade manualmente sem mover ou atacar — confirmar que isso é aceitável para este MR (ver checklist de código, item pendente).

**Habilidades e mana (m3-03 + EA-16):**
- [ ] O botão "Habilidade" abre o menu mesmo com a unidade sem recurso suficiente.
- [ ] Escolher uma linha do menu arma exatamente aquela habilidade (testar com mais de uma classe na partida).
- [ ] `fireball` acerta um aliado que esteja dentro do raio junto com o alvo.
- [ ] Uma classe de mana termina o turno com 0 e começa o próximo turno com 1 ponto (visível no painel inferior).
- [ ] O log nomeia a habilidade usada, não "uma habilidade" genérica, para as três habilidades do roster atual.
