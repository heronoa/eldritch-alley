# Eldritch Alley: Tactics

> Título provisório. Conceito para um MVP de RPG tático por turnos no navegador.

## Pitch

Esquadrões de soldados, iniciados e adeptos disputam a cidade quadra a quadra. Cada partida é um combate tático por turnos num mapa urbano com altura: telhados, escadas de incêndio, becos, viadutos. O jogador monta um time com classes de armas e de magia e enfrenta um bot ou outro jogador.

## Pilares

1. **Altura é tática.** Subir um prédio muda o alcance, a linha de visão e o dano. O mapa não é cenário: é a decisão.
2. **Armas e magia jogam diferente.** Classes de armas dependem de munição, cobertura e linha de visão. Classes de magia dependem de mana, área e posicionamento.
3. **Toda partida é verificável.** O servidor decide tudo, e qualquer partida pode ser revista ação por ação.

## Universo

Ambientado numa cidade contemporânea onde a magia é real e disputada. Pode compartilhar o universo do projeto Magia Urbana (sociedade secreta de caçadores, magia como parte da realidade), como um jogo paralelo nesse mundo. É uma decisão em aberto.

## Loop

1. Montar o esquadrão (no MVP, três unidades escolhidas entre as classes disponíveis).
2. Entrar na fila: contra bot ou PvP ranqueado.
3. Jogar a partida até um esquadrão ser eliminado.
4. Ganhar experiência de classe e ajuste de rating (fora do MVP: desbloquear classes avançadas).

## Combate

- **Grid com altura:** cada célula tem um nível (térreo, primeiro andar, telhado...). Subir custa movimento; cada classe tem um limite de quantos níveis vence por passo.
- **Turno por iniciativa:** a ordem é definida pela velocidade de cada unidade, numa fila visível para os dois lados. Na sua vez, a unidade pode mover e agir, em qualquer ordem.
- **Direção conta:** atacar pelas costas ou pelo flanco dá bônus de acerto e de dano.
- **Linha de visão e cobertura:** armas precisam de linha de visão; muros, carros e caixas dão cobertura e reduzem a chance de acerto. Magia de área ignora cobertura, mas exige posicionamento.
- **Recursos:**
  - Classes de armas: munição, com ação de recarregar.
  - Classes de magia: mana, que regenera um pouco a cada turno.
- **Vantagem de altura:** quem ataca de cima ganha alcance e acerto; quem ataca de baixo perde.

## Classes

### Progressão

Toda unidade começa numa classe base e, ao subir de nível nela, desbloqueia as avançadas da sua linha.

| Linha | Classe base | Avançadas |
|---|---|---|
| Armas | **Soldier** | Sniper, Assaulter |
| Arcana | **Initiated** | Wizard, Warlock |
| Fé | **Adept** | Priest, Paladin |

### Classes avançadas

| Classe | Papel | Identidade |
|---|---|---|
| **Sniper** | Dano à distância longa | Fica no alto, enxerga longe, mata com um tiro bem posicionado. Frágil de perto |
| **Assaulter** | Tank e dano em curta e média distância | Avança, segura a linha, aguenta dano e pune quem chega perto |
| **Wizard** | Controle e dano em área | Muda o campo: bloqueia caminhos, empurra unidades, castiga grupos juntos |
| **Warlock** | Dano explosivo (burst) | Concentra muito dano num alvo em um turno, com custo alto de mana ou de vida |
| **Priest** | Cura e controle de grupo | Mantém o time vivo e trava inimigos com atordoamento ou silêncio |
| **Paladin** | Cura e tank | Linha de frente que se sustenta e protege os aliados próximos |

### Ideias de habilidades (ponto de partida para o balanceamento)

- **Soldier:** Tiro, Recarregar, Granada de fumaça (bloqueia linha de visão).
- **Sniper:** Tiro preciso (alcance maior quanto mais alto), Vigia (atira em quem entrar no campo de visão no turno inimigo), Disparo perfurante.
- **Assaulter:** Rajada (cone curto), Investida (move e ataca), Provocar (inimigos próximos precisam mirar nele).
- **Initiated:** Faísca, Escudo arcano simples.
- **Wizard:** Bola de fogo (área), Muralha (cria cobertura temporária), Empurrão (desloca a unidade; queda de altura causa dano).
- **Warlock:** Drenar (dano que cura o Warlock), Maldição (dano ao longo do tempo), Ruptura (dano altíssimo, custa vida).
- **Adept:** Cura simples, Bênção (bônus de defesa).
- **Priest:** Cura em área, Silêncio (impede magia), Ressuscitar.
- **Paladin:** Golpe sagrado, Aura (aliados adjacentes recebem menos dano), Imposição de mãos.

## Mapas

Urbanos, compactos e verticais: telhado com caixas d'água, beco com escadas de incêndio, estação de metrô com plataformas, viaduto sobre uma avenida. Cada mapa tem pontos altos disputados, cobertura e pelo menos duas rotas entre os lados.

## MVP

O objetivo do MVP é uma partida completa e jogável, com o backend fazendo o trabalho pesado.

- **Um mapa** de 8 por 8 com três níveis de altura.
- **Três classes jogáveis,** uma por linha, para cobrir os três estilos. Sugestão: Sniper (mostra altura e linha de visão), Wizard (área e controle) e Priest (cura).
- **Times de três unidades,** sem progressão nem gestão de elenco.
- **Contra o bot primeiro,** depois PvP com matchmaking.
- **Visual 2D isométrico** (Phaser), sem 3D.

## O que o backend demonstra

- **Motor de batalha determinístico** em TypeScript puro: com a mesma seed e as mesmas ações, o resultado é sempre o mesmo.
- **Servidor autoritativo:** o cliente pede "mover para tal célula" e "usar tal habilidade em tal alvo"; o servidor valida alcance, altura, linha de visão, recurso e vez, e só então aplica.
- **Partida como sequência de eventos:** cada ação aceita é um evento guardado. Reconectar, assistir a um replay e auditar uma partida são a mesma coisa: rodar os eventos de novo.
- **Classes e habilidades como dados:** uma classe nova é configuração, não código novo no motor.
- **Bot no servidor,** com uma heurística simples de utilidade (atacar o alvo mais fraco ao alcance, buscar altura, recuar com pouca vida).
- **Matchmaking por rating** com fila no Redis, e atualização do rating de forma assíncrona depois da partida.
- **WebSockets** para o estado da partida, com PostgreSQL para jogadores, partidas e eventos.

## Stack recomendada

**Princípio:** o motor de batalha fica em TypeScript puro, determinístico e sem depender de framework. O Colyseus e o NestJS são camadas em volta dele; qualquer um dos dois pode ser trocado sem reescrever as regras.

| Camada | Tecnologia | Por quê |
|---|---|---|
| Motor de batalha | TypeScript puro (pacote compartilhado) | Regras, altura, linha de visão e iniciativa testáveis sem servidor; seed de aleatoriedade torna cada partida reproduzível |
| Servidor das partidas | Colyseus | Salas, sincronização do estado com envio só das diferenças, reconexão no meio da partida e espectadores; é onde um jogo de partidas longas e estado grande mais ganha com um framework próprio |
| Plataforma | NestJS | Contas, elencos, classes, rating, histórico e replays; é o stack da vaga e organiza bem o que não é a partida em si |
| Autenticação na sala | JWT emitido pelo NestJS, validado pelo Colyseus ao entrar na sala | Um único login para os dois serviços |
| Integração entre serviços | Fila (SQS com LocalStack, ou BullMQ) | A sala publica "partida encerrada" com os eventos da partida; o NestJS consome, grava o replay e atualiza o rating |
| Banco | PostgreSQL com MikroORM | Jogadores, elencos, partidas e eventos de cada partida; MikroORM é o ORM citado na vaga |
| Redis | Presença e driver do Colyseus, fila de matchmaking | Permite rodar várias instâncias do servidor de partidas e parear por rating |
| Cliente | Phaser e o cliente do Colyseus | Isométrico 2D com um motor que você já conhece |
| Ambiente local | Docker Compose (PostgreSQL, Redis, LocalStack) | Os dois serviços e as dependências com um comando |

**Estrutura sugerida**

```
engine/        motor de batalha determinístico (TypeScript puro)
game-server/   Colyseus: salas, sincronização, bot
platform-api/  NestJS: contas, elencos, rating, replays, matchmaking
client/        Phaser + cliente do Colyseus
```

Dois serviços que conversam por fila também contam uma história de microsserviços, que a vaga cita.

## Fora do MVP

Progressão de classes e desbloqueio das avançadas, gestão de elenco, habilidade secundária de outra classe, campanha PvE, mais mapas, equipamentos, visual 3D.

## Perguntas em aberto

- Universo compartilhado com o Magia Urbana ou próprio?
- Munição e mana como recursos separados, ou um recurso único por classe?
- Turno por iniciativa individual (cada unidade na sua vez) ou por time (o time inteiro age e passa a vez)? O individual é mais fiel à inspiração; o por time é mais simples para PvP.
- Partidas PvP com tempo por turno? Quanto?
- Morte permanente da unidade dentro da partida, ou contagem regressiva para ressuscitar?