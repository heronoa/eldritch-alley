/* Palette, tile types, map definitions and placeholder sprites. */
(function () {
  /* ---------- paleta ---------- */
  const C = {
    outline: '#07080e', paper: '#e6dcc4', skin: '#c9a37e',
    ally: ['#d9cfb6', '#3d6ab3'], enemy: ['#d9cfb6', '#c8322a'],
    neon: ['#ff3df2', '#3de9ff'], warm: '#f0d9a0',
    move: 'rgba(111,149,214,.42)', atk: 'rgba(200,50,42,.48)'
  };
  const TILE = {
    a: { name: 'asfalto', top: '#23283a', left: '#171b28', right: '#11141f' },
    s: { name: 'calçada', top: '#343b51', left: '#22283a', right: '#1a1f2e' },
    x: { name: 'beco', top: '#3a3f52', left: '#262a38', right: '#1e212c' },
    d: { name: 'plataforma de carga', top: '#3b3a45', left: '#28272f', right: '#201f26' },
    g: { name: 'grama', top: '#1f3029', left: '#16221d', right: '#111a16' },
    p: { name: 'caminho', top: '#3a3a44', left: '#28282f', right: '#202026' },
    w: { name: 'lago', top: '#142446', left: '#0f1a33', right: '#0b1428' },
    q: { name: 'praça', top: '#3f4152', left: '#2b2d39', right: '#22242e' },
    r: { name: 'laje', top: '#30364a', left: '#212536', right: '#1a1d2b' },
    R: { name: 'cascalho do telhado', top: '#2a2d3a', left: '#1d1f29', right: '#171921' },
    B: { name: 'prédio (bloqueado)', top: '#1a1e2c', left: '#141826', right: '#0f121c' },
    z: { name: 'faixa de pedestres', top: '#23283a', left: '#171b28', right: '#11141f' },
    v: { name: 'vão até a rua', top: '#14182a', left: '#0d101c', right: '#0a0c16' },
    k: { name: 'tábua sobre o vão', top: '#5a4a36', left: '#3e3325', right: '#33291d' },
    f: { name: 'estacionamento cercado (bloqueado)', top: '#171a26', left: '#11131c', right: '#0d0f16' },
    k: { name: 'telhado vizinho', top: '#2e3140', left: '#1f212c', right: '#191a23' },
    h: { name: 'casa de máquinas (bloqueado)', top: '#3a3f55', left: '#2a2e3f', right: '#222533' },
    b: { name: 'tábua sobre o vão', top: '#5a4a36', left: '#3e3325', right: '#33291d' },
    v: { name: 'vão entre prédios', top: '#05070e', left: '#05070e', right: '#05070e' }
  };

  /* ---------- mapas ---------- */
  const MAPS = {
    street: {
      meta: 'OCORRÊNCIA 2026/0417 · 22h40', title: 'Rua do Comércio e beco',
      desc: 'Um T: o beco estreito desemboca numa rua de duas pistas. Quem sobe pelo beco anda em fila, e uma linha de tiro cobre todos de uma vez.',
      tiles: [
        'BBBBBBBBBB',
        'BssssssssB',
        'BaaaazaaaB',
        'BaaaazaaaB',
        'BssssssssB',
        'BBBBxfffff',
        'BBBxxfffff',
        'BBBBxxffff',
        'BBBBxfffff',
        'BBBsxsffff'
      ],
      h: (x, y, t) => t !== 'B' ? 0 : y === 0 ? [6, 7, 6, 7, 7, 6, 7, 6, 7, 6][x] : (x === 0 && y <= 4) ? 5 : 3,
      center: 2,
      shops: true,
      fence: true,
      props: [
        { t: 'lamp', x: 2, y: 1 }, { t: 'lamp', x: 7, y: 1 }, { t: 'lamp', x: 2, y: 4 }, { t: 'lamp', x: 7, y: 4 }, { t: 'lamp', x: 4, y: 7 },
        { t: 'car', x: 2, y: 2, c: '#4a2830' }, { t: 'car', x: 7, y: 3, c: '#2d3a55' }, { t: 'car', x: 8, y: 2, c: '#3d4152' }, { t: 'moto', x: 1, y: 3 },
        { t: 'traffic', x: 3, y: 1 }, { t: 'traffic', x: 5, y: 4 },
        { t: 'trash', x: 6, y: 4 }, { t: 'hydrant', x: 8, y: 1 }, { t: 'manhole', x: 6, y: 2 }, { t: 'puddle', x: 3, y: 3 }, { t: 'flyers', x: 1, y: 4 },
        { t: 'leak', x: 5, y: 1 }, { t: 'tape', x: 4, y: 1 }, { t: 'tape', x: 6, y: 1 },
        { t: 'crates', x: 3, y: 6 }, { t: 'dumpster', x: 5, y: 7 }, { t: 'bags', x: 4, y: 6 }, { t: 'puddle', x: 4, y: 5 }, { t: 'manhole', x: 4, y: 8 },
        { t: 'car', x: 7, y: 6, c: '#2d3a55' }, { t: 'car', x: 8, y: 8, c: '#3a3f55' }, { t: 'trash', x: 9, y: 7 }
      ],
      wires: [[2, 1, 7, 1], [2, 4, 2, 1], [7, 4, 7, 1]],
      fireEscape: [[3, 5], [3, 8], [2, 0], [7, 0]],
      threat: [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [4, 8]],
      units: [['aS', 'S', 'ally', 4, 9], ['aW', 'W', 'ally', 3, 9], ['aP', 'P', 'ally', 5, 9], ['eS', 'S', 'enemy', 4, 1], ['eW', 'W', 'enemy', 1, 2], ['eP', 'P', 'enemy', 7, 1]],
      sky: 'street',
      log: ['O beco tem uma célula de largura. Só há dois recuos para sair da fila.', 'O Sniper inimigo, do outro lado da rua, cobre a faixa e o beco inteiro (realce vermelho).', 'Carros estacionados nas duas pistas servem de cobertura.']
    },
    park: {
      meta: 'OCORRÊNCIA 2026/0418 · 01h15', title: 'Praça Municipal nº 3',
      desc: 'Alguém está desenhando círculos na grama. O chafariz não desliga há duas noites.',
      tiles: [
        'BBBBBBBBBB',
        'Bgggpggggg',
        'Bgwwpggggg',
        'Bgwwpppppp',
        'Bgggpggggg',
        'Bpppqqqppp',
        'Bgggqqqggg',
        'Bgggqqqggg',
        'Bggggpgggg',
        'Bggggpgggg'
      ],
      heights: { B: [4, 5, 4, 6, 5, 4, 5, 6, 4, 5], g: 1, p: 1, q: 1, w: 0 },
      hill: [[7, 7, 1], [8, 7, 1], [7, 8, 1], [8, 8, 2], [9, 8, 1], [8, 9, 1], [9, 9, 2]],
      props: [
        { t: 'tree', x: 2, y: 1 }, { t: 'tree', x: 7, y: 1 }, { t: 'tree', x: 9, y: 2 }, { t: 'tree', x: 6, y: 2 },
        { t: 'tree', x: 1, y: 7 }, { t: 'tree', x: 3, y: 8 }, { t: 'tree', x: 8, y: 8 },
        { t: 'bush', x: 3, y: 4 }, { t: 'bush', x: 7, y: 4 }, { t: 'bush', x: 2, y: 6 }, { t: 'bush', x: 9, y: 6 },
        { t: 'bench', x: 3, y: 6 }, { t: 'bench', x: 7, y: 6 }, { t: 'lamp', x: 4, y: 4 }, { t: 'lamp', x: 7, y: 5 }, { t: 'lamp', x: 1, y: 3 },
        { t: 'fountain', x: 5, y: 6 }, { t: 'leak', x: 2, y: 8 }, { t: 'tape', x: 2, y: 9 }, { t: 'tape', x: 1, y: 8 }
      ],
      units: [['aS', 'S', 'ally', 5, 9], ['aW', 'W', 'ally', 4, 9], ['aP', 'P', 'ally', 6, 9], ['eS', 'S', 'enemy', 8, 3], ['eW', 'W', 'enemy', 9, 4], ['eP', 'P', 'enemy', 8, 5]],
      sky: 'park',
      log: ['Chafariz em funcionamento contínuo há 49 horas.', 'Círculos na grama fotografados e arquivados.', 'Guarda municipal dispensada por ordem superior.']
    },
    roof: {
      meta: 'OCORRÊNCIA 2026/0419 · 03h02', title: 'Edifício Central, cobertura',
      desc: 'Verticalidade: quem começa no terraço baixo precisa subir. Do outro lado do vão, a laje do vizinho, ligada só por uma tábua.',
      tiles: [
        'RRRrrrvBBB',
        'RRRrrrvBBB',
        'RRrrrrvrrr',
        'rrrrrrvrrr',
        'rrrrrrkrrr',
        'rrrrrrvrrr',
        'rrrrrrvRRr',
        'rrrrrrvRRr',
        'rrrrrrvRrr',
        'rrrrrrvrrr'
      ],
      hmap: [
        [8, 8, 7, 6, 6, 6, -10, 11, 11, 11],
        [8, 8, 7, 6, 6, 6, -10, 11, 11, 11],
        [7, 7, 7, 6, 6, 6, -10, 5, 5, 6],
        [6, 6, 6, 6, 6, 6, -10, 5, 5, 6],
        [6, 6, 6, 6, 6, 6, 6, 5, 5, 5],
        [6, 6, 6, 6, 6, 6, -10, 5, 5, 5],
        [5, 5, 6, 6, 6, 6, -10, 6, 6, 5],
        [4, 5, 6, 6, 6, 6, -10, 7, 6, 5],
        [4, 4, 5, 6, 6, 6, -10, 6, 5, 5],
        [4, 4, 5, 6, 6, 6, -10, 5, 5, 5]
      ],
      lift: 40,
      parapet: true,
      props: [
        { t: 'tower', x: 0, y: 0 }, { t: 'antenna', x: 1, y: 0 }, { t: 'dish', x: 0, y: 2 }, { t: 'ac', x: 4, y: 1 }, { t: 'ac', x: 5, y: 1 },
        { t: 'skylight', x: 3, y: 4 }, { t: 'vent', x: 2, y: 3 }, { t: 'vent', x: 5, y: 9 }, { t: 'puddle', x: 4, y: 6 },
        { t: 'solar', x: 7, y: 2 }, { t: 'solar', x: 8, y: 2 }, { t: 'crates', x: 9, y: 8 }, { t: 'vent', x: 9, y: 5 },
        { t: 'chalk', x: 3, y: 7 }, { t: 'leak', x: 3, y: 7 }, { t: 'tape', x: 2, y: 7 }, { t: 'tape', x: 3, y: 8 },
        { t: 'pole', x: 4, y: 3 }, { t: 'pole', x: 5, y: 6 }
      ],
      lines: [[4, 3, 5, 6]],
      units: [['aS', 'S', 'ally', 1, 8], ['aW', 'W', 'ally', 0, 9], ['aP', 'P', 'ally', 1, 9], ['eS', 'S', 'enemy', 7, 7], ['eW', 'W', 'enemy', 8, 3], ['eP', 'P', 'enemy', 1, 1]],
      sky: 'roof',
      log: ['Níveis de 4 a 8: o terraço de chegada é o ponto mais baixo do mapa.', 'O Sniper inimigo ocupa o ponto alto da laje vizinha.', 'Tábua sobre o vão: travessia por conta e risco do agente.']
    }
  };

  /* ---------- sprites 14x17 ---------- */
  const SPR = {
    S: ['00000111100000','00001444410000','00001444410000','00000144100000','00011222211000','00122222222100','01223222232215','01222222222155','00142222224155','00011333311055','00001333310000','00001322310000','00001300310000','00001300310000','00011100111000','00000000000000','00000000000000'],
    W: ['00000011000000','00000122100000','00001222210000','00012222221000','00111444411100','00001444410000','00011222211005','00122222222155','01222322232150','01223222223150','00122222222150','00123222232150','00122222222150','00133333333100','00111111111100','00000000000000','00000000000000'],
    P: ['00005555550000','00050000005000','00001111100000','00014444410000','00014444410000','00001444100000','00011222110000','00122252221000','01222555222100','01222252222100','00122252221000','00122222221000','00122222221000','00133333331000','00111111111000','00000000000000','00000000000000']
  };

  window.EA_DATA = { C, TILE, MAPS, SPR };
})();
