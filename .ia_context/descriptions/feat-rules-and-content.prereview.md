# Pre-review — Cover, facing, height advantage, abilities as data, the battle report and the odds of a shot (M3, slices 1–3, plus EA-17/EA-18)

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

**Proxy de teste unitário — EA-18 (chance de acerto):**
- **`attackChance` nunca diverge de `hitChanceFor`:** `frontend/src/game/targetPreview.test.ts` — "matches the engine's own hitChanceFor exactly". Se esse teste passa, a porcentagem na tela nunca pode mentir sobre o que o servidor vai rolar.
- **Habilidade de cura nunca mostra número:** mesmo arquivo — "answers nothing for a heal effect — it never rolls".
- **Hover de mouse vs. toque:** `frontend/src/game/press.test.ts` — um finger down nunca produz `hover`; só um mouse sem botão pressionado produz.

**Proxy de teste unitário — EA-17 (relatório de batalha):**
- **O relatório nunca perde linha:** `frontend/src/scenes/MatchScene.test.ts` — "opens the moment the match ends, seeded with every line played — not only the last six". É o teste que pegaria uma regressão de volta ao comportamento do ring de 6 linhas.
- **Export é determinístico e corresponde ao conteúdo:** `frontend/src/game/battle-report.test.ts` + o teste de cena que espiona `download.text`.

**Fluxo manual — cliente (rodar `npm run dev -w @eldritch-alley/frontend` e jogar uma partida local contra o bot):**
- **Badge de cobertura:** posicionar uma unidade ao lado de um `car`/`crates`/etc. → deve aparecer o texto sobre a cabeça nomeando o(s) lado(s). Desligar "Highlight Covers" no painel de configurações → os losangos de debug desaparecem, mas o badge continua.
- **Menu de habilidade, estado "sem recurso":** zerar a mana/munição da unidade e clicar em "Habilidade" → o menu deve abrir (não ficar morto) e a linha deve aparecer esmaecida, não escondida.
- **Impacto visual por tipo de efeito:** usar `fireball` (blast com flash por célula), `piercing-shot` (reusa o tiro do sniper), `area-heal` (glow subindo).
- **Log nomeando a habilidade:** após o uso, a linha do log deve dizer o nome da habilidade ("usou Bola de Fogo"), não "usou uma habilidade".
- **Chance de acerto no hover (mouse):** armar "Atacar", passar o mouse sobre um inimigo no alcance → porcentagem aparece sobre a cabeça dele. Mover para fora → desaparece. Passar sobre um inimigo fora de alcance → nada aparece.
- **Chance de acerto em área:** armar "Habilidade" com `fireball`, posicionar o cursor perto de um aglomerado (aliado + inimigo) → cada unidade dentro do raio mostra sua própria porcentagem, inclusive um aliado ou o próprio conjurador se estiverem na área.
- **Chance de acerto no toque:** no celular/tablet, manter o dedo pressionado sobre um alvo com "Atacar" armado → a porcentagem aparece em vez do sheet de inspeção. Soltar → porcentagem some. Tocar novamente (toque normal, não longo) → o ataque é enviado normalmente.
- **Relatório de batalha ao fim da partida:** terminar uma partida → o modal deve abrir automaticamente com o histórico completo, não só as últimas 6 linhas. Rolar com a roda do mouse ou os chevrons → a faixa "X–Y de Z" atualiza. Clicar em "Baixar .txt" → arquivo `.txt` é salvo com o resultado, a data e todas as linhas.
- **Relatório, fechar e reabrir:** clicar fora do painel → fecha. Clicar em "Sair" com o relatório ainda aberto → não sai, só fecha o relatório (é o painel por cima, não um botão morto). Clicar em "Ver registro completo" → reabre do início.

---

### 2. Checklist de código

- [x] Tipagem: `AbilityEffect` é união discriminada (`damage` | `heal`), sem `any`.
- [x] Sem `console.log` ou código de debug deixado nos arquivos novos.
- [x] `resolveHit`/`hitChanceFor` são o único ponto que lê cover, direção, altura e resolve o roll ou a prévia — nenhuma duplicação de cálculo em `abilities.ts` ou em `targetPreview.ts`.
- [x] `canUseAbility` não tornou o gate de recurso redundante em dois lugares: o botão libera, a linha do menu (`affordable`) é quem bloqueia.
- [x] O badge de chance de acerto nunca aparece para uma célula que o highlight já não ofereceria (fora de alcance, fora de visão, time errado, unidade morta) — ver `targetPreviewChances` em `MatchScene.ts`.
- [x] A cor do badge de chance (`HIT_CHANCE_BADGE_FILL`/`STROKE`) passa no piso de contraste 7:1 contra os três mapas — não é a cor que o plano recomendava de início (ver divergência na description).
- [ ] **Confirmar que a ausência de controle de `facing` no cliente é a entrega pretendida desta MR**, e não um esquecimento — ver a divergência nomeada na description, seção 1.
- [x] `docs/adr/README.md` reflete a ordem real de aceite dos ADRs 0012–0017.
- [x] `npm run typecheck` sem erros (`backend/engine`, `backend/game-server`, `backend/platform-api`, `frontend`).
- [x] `npm run build -w @eldritch-alley/frontend` limpo (apenas o aviso de tamanho de chunk já existente desde M2).
- [x] Sem alterações fora do escopo dos sete planos (m3-01, m3-02, m3-03, EA-15, EA-16, EA-17, EA-18), à exceção do commit `af7fd7d`, que só registra dívida técnica.

---

### 3. Checklist de comportamento

**Cover (m3-01 + EA-15):**
- [ ] Um tiro contra uma unidade ao lado de um `car`/`crates`/`dumpster`/`moto`/`ac`/`vent`/`fountain`/`bench` erra com mais frequência do que sem cobertura.
- [ ] Uma unidade em cima do prop de cobertura (não ao lado) não ganha o bônus.
- [ ] O badge de cobertura nomeia o lado certo, nos dois idiomas (pt-BR e en-US, trocar no seletor de idioma).
- [ ] O toggle "Highlight Covers" some com os losangos de debug sem recarregar a página.

**Facing e altura (m3-02):**
- [ ] Um ataque pela retaguarda acerta e causa mais dano que um ataque de frente contra a mesma unidade na mesma posição.
- [ ] Um ataque de um nível de altura acima alcança uma célula fora do alcance normal.
- [ ] A seta de direção na unidade aponta para o lado certo em todas as quatro rotações de câmera.
- [ ] **Não existe hoje** um jeito de o jogador virar a unidade manualmente sem mover ou atacar — confirmar que isso é aceitável para este MR.

**Habilidades e mana (m3-03 + EA-16):**
- [ ] O botão "Habilidade" abre o menu mesmo com a unidade sem recurso suficiente.
- [ ] Escolher uma linha do menu arma exatamente aquela habilidade.
- [ ] `fireball` acerta um aliado que esteja dentro do raio junto com o alvo.
- [ ] Uma classe de mana termina o turno com 0 e começa o próximo turno com 1 ponto.
- [ ] O log nomeia a habilidade usada, não "uma habilidade" genérica.

**Chance de acerto na mira (EA-18):**
- [ ] Hover sobre um inimigo no alcance, com "Atacar" armado, mostra a porcentagem; mover para fora, desaparece.
- [ ] A porcentagem do hover é exatamente a que o tiro acerta ou erra de fato (comparar com alguns disparos reais na mesma posição).
- [ ] Área de `fireball` mostra uma porcentagem por unidade viva dentro do raio, aliados e o conjurador inclusive.
- [ ] `area-heal` nunca mostra porcentagem nenhuma.
- [ ] No toque, manter pressionado mostra a porcentagem em vez do sheet; soltar e tocar de novo ainda ataca normalmente.
- [ ] Trocar de unidade, passar o turno, ou a partida terminar — a porcentagem desaparece em todos os casos.

**Relatório de batalha (EA-17):**
- [ ] O relatório abre sozinho ao fim da partida, com o histórico completo (testar uma partida longa, com mais de 6 eventos).
- [ ] Rolar o relatório (roda do mouse ou chevrons) muda a faixa exibida ("X–Y de Z").
- [ ] "Baixar .txt" produz um arquivo com o resultado, a data e todas as linhas, nessa ordem.
- [ ] Fechar o relatório e reabrir pelo link mostra o mesmo conteúdo, do início.
- [ ] Com o relatório aberto, a roda do mouse rola o relatório e não dá zoom no mapa; fora do painel, a roda continua dando zoom normalmente.
