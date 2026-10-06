(function () {
  const SP = (function () {
  const W = 16, H = 24;
  const TEAM = { ally: ['#6f95d6', '#4a6aa8'], enemy: ['#d9473d', '#9a2a24'] };
  const OUT = '#06070c';
  const SKIN = ['#d6a77f', '#a87a58'];

  /* ---------- primitivas ---------- */
  function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  const OUTLINE = { ally: '#0d1a3a', enemy: '#3a0a0a' };
  function outline(g, color) {
    const img = g.getImageData(0, 0, W, H), d = img.data, a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[(y * W + x) * 4 + 3];
    const mark = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) mark.push([x, y]);
    mark.forEach(([x, y]) => rect(g, x, y, 1, 1, color || OUT));
  }
  function head(g, dy, hairTop) {
    rect(g, 5, 3 + dy, 6, 6, SKIN[0]); rect(g, 10, 3 + dy, 1, 6, SKIN[1]);
    rect(g, 6, 6 + dy, 1, 1, OUT); rect(g, 9, 6 + dy, 1, 1, OUT);
    if (hairTop) hairTop();
  }
  function legs(g, frame, anim, pants, pantsShade, shoe) {
    let l = 0, r = 0;
    if (anim === 'walk') { l = frame === 0 ? -1 : 1; r = -l; }
    rect(g, 5, 18 + Math.max(0, l), 3, 4 - Math.abs(l), pants); rect(g, 7, 18, 1, 4, pantsShade);
    rect(g, 9, 18 + Math.max(0, r), 3, 4 - Math.abs(r), pants); rect(g, 11, 18, 1, 4, pantsShade);
    rect(g, 4 + (l < 0 ? -1 : 0), 22, 4, 1, shoe); rect(g, 9 + (r < 0 ? 0 : 1), 22, 3, 1, shoe);
  }
  function armband(g, team, dy) { rect(g, 3, 12 + dy, 2, 2, TEAM[team][0]); }

  let MODE = 'ranged';
  /* ---------- classes ---------- */
  const CLASSES = {
    combatant: {
      group: 'base', name: 'Combatente', lean: 'BASE · NEUTRA · SEM MAGIA',
      text: '<b>Forma:</b> jaqueta curta e um cano de ferro no ombro. <b>Detalhe:</b> o zíper claro da jaqueta. <b>Néon:</b> nenhum. <b>Leva a:</b> Sniper e Street Vendor na v1.',
      draw(g, anim, frame, team, t) {
        const dy = anim === 'idle' && frame === 1 ? 1 : 0;
        const jk = '#5f6150', jkS = '#47493c';
        legs(g, frame, anim, '#3d4a66', '#2d374d', '#15171f');
        rect(g, 4, 9 + dy, 8, 8 - dy, jk); rect(g, 9, 9 + dy, 3, 8 - dy, jkS);
        rect(g, 8, 10 + dy, 1, 6, '#b8ad94');
        rect(g, 4, 16, 8, 2, '#3d4a66');
        rect(g, 3, 10 + dy, 2, 6, jk); rect(g, 11, 10 + dy, 2, 6, jkS);
        armband(g, team, dy);
        head(g, dy, () => { rect(g, 5, 2 + dy, 6, 2, '#3a2a22'); rect(g, 9, 2 + dy, 2, 2, '#2a1e18'); });
        if (anim === 'action' && MODE !== 'melee') { for (let i = 0; i < 6; i++) rect(g, 11 + Math.floor(i / 2), 9 - i + dy, 1, 1, '#8a8fa3'); rect(g, 12, 9 - frame * 2, 2, 2, '#8a4a32'); }
        else if (anim === 'action' && frame === 1) { rect(g, 12, 12, 4, 1, '#8a8fa3'); rect(g, 13, 11, 1, 1, '#f0d9a0'); }
        else if (anim === 'action') { for (let i = 0; i < 6; i++) rect(g, 12 + (i > 3 ? 1 : 0), 9 - i, 1, 1, '#8a8fa3'); }
        else for (let i = 0; i < 6; i++) rect(g, 11 + Math.floor(i / 2), 9 - i + dy, 1, 1, '#8a8fa3');
      }
    },
    initiate: {
      group: 'base', name: 'Iniciado', lean: 'BASE · NEUTRA · MAGIA ESTUDADA',
      text: '<b>Forma:</b> moletom com o capuz levantado, mãos no bolso. <b>Detalhe:</b> o rosto meio escondido pelo capuz. <b>Néon:</b> uma faísca entre os dedos, só na ação. <b>Leva a:</b> Wizard na v1.',
      draw(g, anim, frame, team, t) {
        const dy = anim === 'idle' && frame === 1 ? 1 : 0;
        const hd = '#4a4358', hdS = '#383246';
        legs(g, frame, anim, '#2b2d38', '#20222b', '#d8d2c4');
        rect(g, 4, 9 + dy, 8, 9 - dy, hd); rect(g, 9, 9 + dy, 3, 9 - dy, hdS);
        rect(g, 6, 14 + dy, 4, 2, hdS);
        rect(g, 3, 10 + dy, 2, 6, hd); rect(g, 11, 10 + dy, 2, 6, hdS);
        armband(g, team, dy);
        head(g, dy, () => {});
        rect(g, 4, 1 + dy, 8, 3, hd); rect(g, 4, 1 + dy, 1, 8, hd); rect(g, 11, 1 + dy, 1, 8, hdS); rect(g, 9, 1 + dy, 2, 3, hdS);
        rect(g, 5, 4 + dy, 6, 1, '#a87a58');
        if (anim === 'action' && MODE === 'melee') {
          rect(g, 12, 10 - frame * 2, 2, 2, hdS); rect(g, 12, 7 - frame * 2, 3, 4, '#d8cdb2'); rect(g, 14, 7 - frame * 2, 1, 4, '#a89878');
        } else if (anim === 'action') {
          rect(g, 12, 11, 2, 2, hdS); rect(g, 13, 10, 1, 1, '#d6a77f');
          rect(g, 14, 9, 1, 1, '#ff3df2'); if (frame === 1) { rect(g, 15, 8, 1, 1, '#ff3df2'); rect(g, 14, 7, 1, 1, '#3de9ff'); }
        }
      }
    },
    adept: {
      group: 'base', name: 'Adepto', lean: 'BASE · NEUTRA · FÉ',
      text: '<b>Forma:</b> xale cobrindo a cabeça e os ombros sobre um casaco comprido. <b>Detalhe:</b> as contas douradas no peito. <b>Néon:</b> as mãos unidas em ciano, só na ação. <b>Leva a:</b> Priest na v1.',
      draw(g, anim, frame, team, t) {
        const dy = anim === 'idle' && frame === 1 ? 1 : 0;
        const cg = '#5a4a3c', cgS = '#44372c', sh = '#8a7a62', shS = '#6e6150';
        legs(g, frame, anim, '#3a3029', '#2b231e', '#15171f');
        rect(g, 4, 9 + dy, 8, 12 - dy, cg); rect(g, 9, 9 + dy, 3, 12 - dy, cgS);
        rect(g, 3, 17, 10, 4, cg); rect(g, 10, 17, 3, 4, cgS);
        rect(g, 3, 10 + dy, 2, 6, cg); rect(g, 11, 10 + dy, 2, 6, cgS);
        armband(g, team, dy);
        head(g, dy, () => {});
        rect(g, 4, 1 + dy, 8, 3, sh); rect(g, 9, 1 + dy, 3, 3, shS);
        rect(g, 4, 3 + dy, 1, 6, sh); rect(g, 11, 3 + dy, 1, 6, shS);
        rect(g, 2, 9 + dy, 12, 3, sh); rect(g, 10, 9 + dy, 4, 3, shS); rect(g, 6, 9 + dy, 4, 1, '#a89878');
        for (let i = 0; i < 4; i += 2) rect(g, 8, 11 + i + dy, 1, 1, '#d9b44a');
        if (anim === 'action' && MODE === 'melee') {
          rect(g, 12, 10 - frame, 2, 2, cgS); for (let i = 0; i < 4; i++) rect(g, 13 + (i % 2), 6 - frame + i, 1, 1, '#d9b44a');
        } else if (anim === 'action') {
          rect(g, 7, 11 - frame, 2, 2, '#3de9ff');
          if (frame === 1) { rect(g, 6, 8, 1, 1, '#3de9ff'); rect(g, 10, 7, 1, 1, '#3de9ff'); rect(g, 8, 0, 1, 1, '#f0d9a0'); }
        }
      }
    },
    sniper: {
      group: 'adv', name: 'Sniper', lean: 'BUROCRACIA · SEM MAGIA',
      text: '<b>Forma:</b> casaco longo, gorro e o fuzil atravessado. <b>Detalhe:</b> o brilho na luneta. <b>Néon:</b> nenhum.',
      draw(g, anim, frame, team, t) {
        const dy = anim === 'idle' && frame === 1 ? 1 : 0;
        const coat = '#46506a', coatS = '#323a50';
        legs(g, frame, anim, '#2b3142', '#1f2433', '#15171f');
        rect(g, 4, 9 + dy, 8, 10 - dy, coat); rect(g, 9, 9 + dy, 3, 10 - dy, coatS);
        rect(g, 7, 9 + dy, 2, 2, '#e6dcc4');
        rect(g, 3, 10 + dy, 2, 6, coat); rect(g, 11, 10 + dy, 2, 6, coatS);
        armband(g, team, dy);
        head(g, dy, () => { rect(g, 5, 1 + dy, 6, 3, '#2a3550'); rect(g, 9, 1 + dy, 2, 3, '#1f2840'); rect(g, 5, 3 + dy, 6, 1, '#3d4b6e'); });
        const ry = anim === 'action' && MODE !== 'melee' ? 11 + dy - frame : 12 + dy;
        if (anim === 'reload') {
          for (let i = 0; i < 13; i++) rect(g, 2 + i, 12 + dy + Math.floor(i / 4), 1, 1, '#5a5f73');
          rect(g, 2, 13 + dy, 3, 1, '#4a3a2c'); rect(g, 8, 13 + dy, 2, 1, '#2a2d3a');
          if (frame === 0) { rect(g, 3, 14, 2, 1, SKIN[0]); }
          else { rect(g, 9, 15 + dy, 2, 2, '#3a3f55'); rect(g, 8, 16 + dy, 2, 1, SKIN[0]); rect(g, 12, 14 + dy, 1, 1, '#c9cbd8'); }
        } else {
        rect(g, 1, ry, 15, 1, '#5a5f73'); rect(g, 1, ry + 1, 3, 1, '#4a3a2c'); rect(g, 8, ry - 1, 3, 1, '#2a2d3a');
        }
        const glint = anim === 'reload' ? false : anim === 'action' ? frame === 1 : Math.floor(t / 900) % 4 === 0;
        if (glint) rect(g, 11, ry - 1, 1, 1, '#f0e6c0');
        if (anim === 'action' && frame === 1 && MODE !== 'melee') rect(g, 15, ry, 1, 1, '#f0d9a0');
        if (anim === 'action' && MODE === 'melee') { rect(g, 12, 15 - frame, 2, 1, SKIN[0]); rect(g, 13, 14 - frame, 3, 1, '#2a2d3a'); if (frame === 1) rect(g, 15, 13, 1, 1, '#f0d9a0'); }
      }
    },
    wizard: {
      group: 'adv', name: 'Wizard', lean: 'ENTRE A BUROCRACIA E A RUA · MÁGICO',
      text: '<b>Forma:</b> gola alta em duas pontas e casaco aberto em V. <b>Detalhe:</b> o forro bordô. <b>Néon:</b> a mão erguida, só ao lançar.',
      draw(g, anim, frame, team, t) {
        const dy = anim === 'idle' && frame === 1 ? 1 : 0;
        const coat = '#2c3654', coatS = '#1f2740', lining = '#8a2f42';
        legs(g, frame, anim, '#1f2433', '#161a26', '#0e1017');
        rect(g, 3, 9 + dy, 10, 10 - dy, coat); rect(g, 10, 9 + dy, 3, 10 - dy, coatS);
        rect(g, 2, 16 + dy, 12, 3 - dy, coat); rect(g, 11, 16 + dy, 3, 3 - dy, coatS);
        rect(g, 6, 9 + dy, 4, 6, '#e6dcc4'); rect(g, 7, 13 + dy, 2, 2, '#e6dcc4'); rect(g, 9, 9 + dy, 1, 5, '#b8ad94');
        rect(g, 5, 10 + dy, 1, 7, lining); rect(g, 10, 10 + dy, 1, 7, lining);
        rect(g, 3, 4 + dy, 2, 6, coat); rect(g, 11, 4 + dy, 2, 6, coatS);
        armband(g, team, dy);
        head(g, dy, () => { rect(g, 5, 2 + dy, 6, 2, '#2a2026'); rect(g, 4, 3 + dy, 1, 2, '#2a2026'); rect(g, 8, 1 + dy, 2, 1, '#2a2026'); });
        if (anim === 'action') {
          rect(g, 12, 6 - frame, 2, 5, coatS); rect(g, 12, 5 - frame, 2, 1, SKIN[0]);
          rect(g, 12, 5 - frame, 2, 1, '#ff3df2');
          if (frame === 1) { rect(g, 14, 3, 1, 1, '#ff3df2'); rect(g, 11, 2, 1, 1, '#3de9ff'); rect(g, 15, 5, 1, 1, '#3de9ff'); }
        } else {
          rect(g, 2, 11 + dy, 1, 5, coat); rect(g, 13, 11 + dy, 1, 5, coatS);
        }
      }
    },
    priest: {
      group: 'adv', name: 'Priest', lean: 'BUROCRACIA · MÁGICO',
      text: '<b>Forma:</b> casaco longo com duas faixas claras descendo dos ombros. <b>Detalhe:</b> o colarinho branco. <b>Néon:</b> as mãos em ciano, só ao curar.',
      draw(g, anim, frame, team, t) {
        const dy = anim === 'idle' && frame === 1 ? 1 : 0;
        const coat = '#33333f', coatS = '#24242e';
        legs(g, frame, anim, '#24242e', '#1a1a22', '#0e0e14');
        rect(g, 4, 9 + dy, 8, 11 - dy, coat); rect(g, 9, 9 + dy, 3, 11 - dy, coatS);
        rect(g, 6, 10 + dy, 1, 9, '#e6dcc4'); rect(g, 9, 10 + dy, 1, 9, '#b8ad94');
        rect(g, 7, 9 + dy, 2, 1, '#f6f1e4');
        rect(g, 3, 10 + dy, 2, 6, coat); rect(g, 11, 10 + dy, 2, 6, coatS);
        armband(g, team, dy);
        head(g, dy, () => { rect(g, 5, 2 + dy, 6, 2, '#8a8f9c'); rect(g, 9, 2 + dy, 2, 2, '#6c7180'); });
        const hand = anim === 'action' && MODE !== 'melee' ? '#3de9ff' : SKIN[0];
        const hy = anim === 'action' ? 13 - frame : 16 + dy;
        rect(g, 3, hy, 2, 1, hand); rect(g, 11, hy, 2, 1, hand);
        if (anim === 'action' && MODE === 'melee') { rect(g, 12, 9 - frame * 2, 3, 4, '#2a2030'); rect(g, 13, 10 - frame * 2, 1, 1, '#d9b44a'); }
        if (anim === 'action' && frame === 1 && MODE !== 'melee') { rect(g, 2, 10, 1, 1, '#3de9ff'); rect(g, 13, 9, 1, 1, '#3de9ff'); rect(g, 8, 0, 1, 1, '#3de9ff'); }
      }
    },
    vendor: {
      group: 'adv', name: 'Street Vendor', lean: 'ANARQUIA · SEM MAGIA',
      text: '<b>Forma:</b> mochila maior que a cabeça e boné virado. <b>Detalhe:</b> o amuleto que pisca. <b>Néon:</b> uma piscada fraca, que pode nem ser magia.',
      draw(g, anim, frame, team, t) {
        const dy = anim === 'idle' && frame === 1 ? 1 : 0;
        rect(g, 2, 2 + dy, 12, 13, '#6b4a2e'); rect(g, 10, 2 + dy, 4, 13, '#523822');
        rect(g, 2, 2 + dy, 12, 1, '#8a6a40');
        rect(g, 14, 0 + dy, 1, 12, '#3a3f55'); rect(g, 13, 0 + dy, 2, 1, '#7a2a3a');
        rect(g, 1, 9 + dy, 2, 4, '#8a3a2a'); rect(g, 1, 9 + dy, 2, 1, '#b8ad94');
        rect(g, 12, 13 + dy, 2, 2, '#3d6b9a');
        legs(g, frame, anim, '#4a4f66', '#363a4c', '#1a1d26');
        rect(g, 4, 9 + dy, 8, 9 - dy, '#3f6b5a'); rect(g, 9, 9 + dy, 3, 9 - dy, '#2e5143');
        rect(g, 5, 15 + dy, 6, 2, '#2a2a2a'); rect(g, 7, 15 + dy, 2, 1, '#5c6175');
        rect(g, 3, 10 + dy, 2, 6, '#3f6b5a');
        armband(g, team, dy);
        head(g, dy, () => { rect(g, 5, 2 + dy, 6, 2, '#b8862f'); rect(g, 3, 3 + dy, 2, 1, '#8a6420'); rect(g, 9, 2 + dy, 2, 2, '#8a6420'); });
        const blink = Math.floor(t / 700) % 6 === 0;
        rect(g, 8, 11 + dy, 1, 1, blink ? '#ff3df2' : '#d9b44a');
        if (anim === 'action' && MODE === 'melee') {
          rect(g, 11, 9, 2, 3, '#3f6b5a');
          for (let i = 0; i < 6; i++) rect(g, frame ? 12 + i : 12 + Math.floor(i / 2), frame ? 10 : 9 - i, 1, 1, '#3a3f55');
          rect(g, frame ? 15 : 13, frame ? 9 : 3, 1, 2, '#7a2a3a');
        } else if (anim === 'action') {
          const ax = frame === 0 ? 12 : 13, ay = frame === 0 ? 7 : 10;
          rect(g, 11, 9, 2, 3, '#3f6b5a'); rect(g, ax, ay, 2, 2, '#c8322a'); rect(g, ax, ay, 1, 1, '#f3ead6');
        } else {
          rect(g, 11, 10 + dy, 2, 6, '#2e5143'); rect(g, 11, 16 + dy, 2, 1, SKIN[0]);
        }
      }
    }
  };

    const cache = new Map();
    function get(key, anim, frame, team, face) {
      const id = [key, anim, frame, team, face].join('|');
      if (cache.has(id)) return cache.get(id);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      MODE = 'ranged'; CLASSES[key].draw(g, anim, frame, team, 1000); outline(g, OUTLINE[team]);
      let out = c;
      if (face === -1) { const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d'); mg.translate(W, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0); out = m; }
      cache.set(id, out); return out;
    }
    return { get, TEAM };
  })();
  const CLS = { S: 'sniper', W: 'wizard', P: 'priest' };
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
      units: [['aS', 'S', 'ally', 5, 9], ['aW', 'W', 'ally', 4, 9], ['aP', 'P', 'ally', 6, 9], ['eS', 'S', 'enemy', 8, 3], ['eW', 'W', 'enemy', 9, 4], ['eP', 'P', 'enemy', 8, 1]],
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

  const cvs = document.getElementById('map'), ctx = cvs.getContext('2d');
  const off = document.createElement('canvas'), g = off.getContext('2d');
  const TW = 32, TH = 16, HZ = 8, N = 10;
  const MAPW = 340, MAPH = 250;
  let M, key, H, T, units, selected, propAt, blocked, hover = null, OX = 0, OY = 0, scale = 1, t0 = performance.now();
  let R = 0, laneEdges = {}, rotAnim = null, base = null;
  const cam = { z: 1, zt: 1, px: 0, py: 0 };

  function rnd(seed) { let s = (seed * 2654435761) % 4294967296; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  function iso(x, y, h) { return [OX + (x - y) * TW / 2, OY + (x + y) * TH / 2 - h * HZ]; }
  function poly(pts, fill) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = fill; g.fill(); }
  function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }

  function isoBox(cx, cy, a, b, h, top, left, right) {
    const P = (u, v, z) => [cx + (u - v) * TW / 2, cy + (u + v) * TH / 2 - z];
    poly([P(-a, b, 0), P(a, b, 0), P(a, b, h), P(-a, b, h)], left);
    poly([P(a, -b, 0), P(a, b, 0), P(a, b, h), P(a, -b, h)], right);
    poly([P(-a, -b, h), P(a, -b, h), P(a, b, h), P(-a, b, h)], top);
  }

  const rot = (x, y) => { let a = x, b = y; for (let i = 0; i < R; i++) { const na = N - 1 - b, nb = a; a = na; b = nb; } return [a, b]; };
  function load(k, keepCam) {
    key = k; const B = MAPS[k];
    // grade base (sem rotação)
    const bH = [], bT = [];
    for (let y = 0; y < N; y++) {
      bH.push([]); bT.push([]);
      for (let x = 0; x < N; x++) {
        const t = B.tiles[y][x]; bT[y].push(t);
        let h = 0;
        if (B.hmap) h = B.hmap[y][x];
        else if (B.h) h = B.h(x, y, t);
        else if (t === 'B') h = B.heights.B[(x * 3 + y * 7) % B.heights.B.length];
        else if (B.heights[t] !== undefined) h = B.heights[t];
        bH[y].push(h);
      }
    }
    (B.hill || []).forEach(([x, y, d]) => bH[y][x] += d);
    base = { T: bT, H: bH, units: B.units };
    // grade girada
    H = []; T = [];
    for (let y = 0; y < N; y++) { H.push(new Array(N)); T.push(new Array(N)); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [nx, ny] = rot(x, y); H[ny][nx] = bH[y][x]; T[ny][nx] = bT[y][x]; }
    const rp = (arr) => (arr || []).map(([x, y, ...rest]) => [...rot(x, y), ...rest]);
    const rl = (arr) => (arr || []).map(([x1, y1, x2, y2]) => [...rot(x1, y1), ...rot(x2, y2)]);
    M = Object.assign({}, B, {
      props: B.props.map(p => p.x === undefined ? p : Object.assign({}, p, { x: rot(p.x, p.y)[0], y: rot(p.x, p.y)[1], rot: R % 2 === 1 })),
      wires: rl(B.wires), lines: rl(B.lines), threat: rp(B.threat), fireEscape: rp(B.fireEscape), door: rp(B.door),
      graffiti: (B.graffiti || []).map(gf => Object.assign({}, gf, { x: rot(gf.x, gf.y)[0], y: rot(gf.x, gf.y)[1] })),
      center: undefined, crosswalk: undefined
    });
    // linha central das pistas como arestas entre células
    laneEdges = {};
    if (B.center !== undefined) for (let x = 0; x < N; x++) {
      const c = B.center, ta = bT[c][x], tb = bT[c + 1][x];
      if (!['a', 'z'].includes(ta) || !['a', 'z'].includes(tb) || ta === 'z') continue;
      const [ax, ay] = rot(x, c), [bx, by] = rot(x, c + 1);
      const dir = bx > ax ? '+x' : bx < ax ? '-x' : by > ay ? '+y' : '-y';
      (laneEdges[ax + ',' + ay] = laneEdges[ax + ',' + ay] || []).push({ dir, dash: x % 2 === 0 });
    }
    propAt = {}; M.props.forEach(p => { if (p.x !== undefined) (propAt[p.x + ',' + p.y] = propAt[p.x + ',' + p.y] || []).push(p); });
    const BLOCKING = ['car', 'dumpster', 'tree', 'fountain', 'tower', 'crates', 'ac', 'kiosk', 'chimney', 'moto'];
    blocked = (x, y) => ['B', 'w', 'v', 'h', 'f'].includes(T[y][x]) || (propAt[x + ',' + y] || []).some(p => BLOCKING.includes(p.t));
    const prevSel = selected && selected.id;
    units = B.units.map(([id, cls, team, x, y]) => { const [nx, ny] = rot(x, y); return { id, cls, team, x: nx, y: ny }; });
    selected = units.find(u => u.id === prevSel && keepCam) || units[0];
    hover = null;
    if (!keepCam) { cam.z = cam.zt = window.innerWidth < 700 ? 2 : 1; cam.px = cam.py = 0; }
    document.getElementById('c-view').textContent = 'VISTA ' + 'NLSO'[R];
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === k)));
    document.getElementById('m-meta').textContent = M.meta;
    document.getElementById('m-title').textContent = M.title;
    document.getElementById('m-desc').textContent = M.desc;
    document.getElementById('log-title').textContent = 'Protocolo nº ' + M.meta.split(' ')[1];
    document.getElementById('log').innerHTML = M.log.map(l => `<li>${l}</li>`).join('');
    renderHud();
  }

  function inMove(x, y) {
    const d = Math.abs(x - selected.x) + Math.abs(y - selected.y);
    return d > 0 && d <= 3 && !blocked(x, y) && !units.some(u => u.x === x && u.y === y) && Math.abs(H[y][x] - H[selected.y][selected.x]) <= 1;
  }
  function inAtk(x, y) { return units.some(u => u.team === 'enemy' && u.x === x && u.y === y); }

  /* ---------- fundo ---------- */
  function drawSky(W, Hh, time) {
    const grd = g.createLinearGradient(0, 0, 0, Hh);
    if (M.sky === 'roof') { grd.addColorStop(0, '#0a1230'); grd.addColorStop(.6, '#121a3a'); grd.addColorStop(1, '#1a1c34'); }
    else { grd.addColorStop(0, '#0d1428'); grd.addColorStop(1, '#05070f'); }
    g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
    const r = rnd(11);
    const stars = M.sky === 'roof' ? 160 : 50;
    for (let i = 0; i < stars; i++) {
      const sx = r() * W, sy = r() * Hh * (M.sky === 'roof' ? .7 : .4), tw = (Math.sin(time * 1.3 + i * 1.7) + 1) / 2;
      g.globalAlpha = .2 + tw * .6; px(sx, sy, 1, 1, i % 9 === 0 ? '#ffe9b0' : '#cfd6ff');
    }
    g.globalAlpha = 1;
    if (M.sky === 'roof') {
      // lua
      const mx = W * .78, my = Hh * .16;
      g.fillStyle = 'rgba(230,220,196,.08)'; g.beginPath(); g.arc(mx, my, 22, 0, 7); g.fill();
      g.fillStyle = '#e6dcc4'; g.beginPath(); g.arc(mx, my, 9, 0, 7); g.fill();
      g.fillStyle = '#121a3a'; g.beginPath(); g.arc(mx + 4, my - 2, 8, 0, 7); g.fill();
      // cidade lá embaixo
      skyline(W, Hh * .9, Hh, 2, '#0c1024', .35);
      skyline(W, Hh * .97, Hh, 5, '#080b1a', .5);
      // brilho da cidade
      const cg = g.createLinearGradient(0, Hh * .75, 0, Hh); cg.addColorStop(0, 'transparent'); cg.addColorStop(1, 'rgba(240,217,160,.08)');
      g.fillStyle = cg; g.fillRect(0, Hh * .75, W, Hh * .25);
    } else {
      skyline(W, Hh * .42, Hh * .42, 3, '#0f1529', .25);
      skyline(W, Hh * .5, Hh * .5, 7, '#0a0e1e', .35);
      const fog = g.createLinearGradient(0, Hh * .35, 0, Hh * .6); fog.addColorStop(0, 'transparent'); fog.addColorStop(1, 'rgba(120,130,170,.05)');
      g.fillStyle = fog; g.fillRect(0, Hh * .35, W, Hh * .25);
    }
  }
  function skyline(W, baseY, bottom, seed, color, litChance) {
    const r = rnd(seed); let x = -5;
    while (x < W) {
      const bw = 10 + r() * 22, bh = 18 + r() * 60;
      px(x, baseY - bh, bw, bottom - (baseY - bh), color);
      for (let wy = baseY - bh + 4; wy < baseY - 2; wy += 5) for (let wx = x + 2; wx < x + bw - 2; wx += 4)
        if (r() < litChance * .35) { g.globalAlpha = .55; px(wx, wy, 1, 2, C.warm); g.globalAlpha = 1; }
      if (r() < .2) px(x + bw / 2, baseY - bh - 6, 1, 6, color);
      x += bw + r() * 4;
    }
  }

  /* ---------- prédios ---------- */
  function building(x, y, sx, sy, h) {
    const depth = (h + 1) * HZ, t = TILE.B;
    const Nn = [sx, sy], E = [sx + TW / 2, sy + TH / 2], S = [sx, sy + TH], W = [sx - TW / 2, sy + TH / 2];
    poly([W, S, [S[0], S[1] + depth], [W[0], W[1] + depth]], t.left);
    poly([S, E, [E[0], E[1] + depth], [S[0], S[1] + depth]], t.right);
    poly([Nn, E, S, W], t.top);
    const r = rnd(x * 31 + y * 17 + 3);
    // janelas nas duas faces
    for (let row = 4; row < depth - 4; row += 6) {
      for (let k = 2; k < TW / 2 - 2; k += 4) {
        const lit = r() < .28;
        const cL = lit ? 'rgba(240,217,160,.55)' : '#0b0e17';
        const lx = W[0] + k, ly = W[1] + k / 2 + row;
        px(lx, ly, 2, 3, cL);
        const lit2 = r() < .22;
        const rx = S[0] + k, ry = S[1] - k / 2 + row;
        px(rx, ry, 2, 3, lit2 ? 'rgba(240,217,160,.45)' : '#0b0e17');
      }
    }
    // borda do topo (platibanda)
    g.strokeStyle = 'rgba(230,220,196,.08)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(W[0], W[1] + .5); g.lineTo(Nn[0], Nn[1] + .5); g.lineTo(E[0], E[1] + .5); g.stroke();
    // térreo com lojas (rua): portas de enrolar e toldos
    if (false) {
      const shop = (base, dir) => {
        const r2 = rnd(x * 5 + y * 3 + (dir > 0 ? 1 : 2));
        const bottom = depth - 2, topY = depth - 13;
        for (let k = 1; k < TW / 2 - 1; k++) {
          const fx = base[0] + k, fy = base[1] + dir * k / 2;
          for (let row = topY + 3; row < bottom; row += 2) px(fx, fy + row, 1, 1, '#2a2e3f');
        }
        const awn = ['#6a2a2a', '#2f4e79', '#4a4a3a'][Math.floor(r2() * 3)];
        for (let k = 0; k < TW / 2; k++) { const fx = base[0] + k, fy = base[1] + dir * k / 2; px(fx, fy + topY, 1, 3, k % 4 < 2 ? awn : shade(awn, -.3)); }
        if (r2() < .35) for (let k = 4; k < 10; k++) px(base[0] + k, base[1] + dir * k / 2 + topY + 4, 1, 4, 'rgba(240,217,160,.35)');
      };
      if (y === 0) shop(W, 1);
      if (x === 0) shop(S, -1);
    }
    (M.graffiti || []).filter(gf => gf.x === x && gf.y === y).forEach(gf => {
      const base = gf.face === 'left' ? W : S, dir = gf.face === 'left' ? 1 : -1;
      const cx0 = base[0] + 8, cy0 = base[1] + dir * 4 + depth - 22;
      if (gf.magic) {
        const pulse = .6 + Math.sin(performance.now() / 450) * .3;
        g.globalAlpha = pulse; g.strokeStyle = C.neon[0];
        g.beginPath(); g.ellipse(cx0, cy0, 5, 4, dir * .45, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(cx0 - 4, cy0 + 2 * dir); g.lineTo(cx0 + 4, cy0 - 2 * dir); g.moveTo(cx0, cy0 - 5); g.lineTo(cx0, cy0 + 5); g.stroke();
        g.globalAlpha = 1;
      } else {
        ['#6f6a5c', '#5a5f78', '#7a4a44'].forEach((c, i) => px(cx0 - 5 + i * 3, cy0 + dir * i, 3, 2, c));
      }
    });
    if (M.shops) {
      const faceL = y + 1 < N && T[y + 1][x] !== 'B', faceR = x + 1 < N && T[y][x + 1] !== 'B';
      const awn = ['#5a2a2a', '#2a4a3a', '#2d3a55', '#4a3e22'][(x + y) % 4];
      const shop = (ax, ay, dir) => {
        // dir = +1 para a face esquerda (desce para a direita), -1 para a direita (sobe para a direita)
        const open = r() < .45;
        for (let k = 2; k < TW / 2 - 2; k++) {
          const yy = ay + dir * k / 2;
          px(ax + k, yy + depth - 13, 1, 9, open ? 'rgba(240,217,160,.42)' : '#2a2e3d');
          if (!open && k % 2 === 0) px(ax + k, yy + depth - 12 + (k % 4), 1, 1, '#1a1d29');
          px(ax + k, yy + depth - 15, 1, 2, awn);
        }
        if (r() < .5) { const gx = ax + 4 + r() * 6; px(gx, ay + depth - 22, 4, 1, '#7a6f8f'); px(gx + 1, ay + depth - 21, 3, 1, '#6a5f7e'); }
      };
      if (faceL) shop(W[0], W[1], 1);
      if (faceR) shop(S[0], S[1], -1);
    }
    if ((M.door || []).some(([dx, dy]) => dx === x && dy === y)) {
      px(W[0] + 8, W[1] + 4 + depth - 14, 4, 9, 'rgba(240,217,160,.75)');
      const dg = g.createRadialGradient(W[0] + 10, W[1] + depth - 2, 0, W[0] + 10, W[1] + depth - 2, 16); dg.addColorStop(0, 'rgba(240,217,160,.25)'); dg.addColorStop(1, 'transparent');
      g.fillStyle = dg; g.fillRect(W[0] - 6, W[1] + depth - 18, 32, 32);
    }
    if ((M.fireEscape || []).some(([fx, fy]) => fx === x && fy === y)) {
      g.strokeStyle = '#3a3f55';
      for (let row = 6; row < depth - 4; row += 9) { g.beginPath(); g.moveTo(S[0] + 2, S[1] - 1 + row); g.lineTo(E[0] - 3, E[1] + row); g.stroke(); }
      g.beginPath(); g.moveTo(S[0] + 5, S[1] + 4); g.lineTo(S[0] + 5, S[1] + depth - 4); g.stroke();
    }
  }

  /* ---------- objetos ---------- */
  function drawProp(p, cx, cy, time) {
    switch (p.t) {
      case 'lamp': {
        const fl = .8 + Math.sin(time * 3 + cx) * .05;
        const lg = g.createRadialGradient(cx, cy, 0, cx, cy, 20); lg.addColorStop(0, `rgba(240,217,160,${.22 * fl})`); lg.addColorStop(1, 'transparent');
        g.fillStyle = lg; g.fillRect(cx - 20, cy - 12, 40, 26);
        px(cx, cy - 22, 1, 22, '#4a4f66'); px(cx - 1, cy - 23, 4, 2, '#4a4f66'); px(cx + 2, cy - 21, 2, 1, C.warm);
        break;
      }
      case 'car': {
        if (p.rot) { isoBox(cx, cy, .2, .42, 5, p.c, shade(p.c, -.3), shade(p.c, -.45)); isoBox(cx + 1, cy - 5, .17, .22, 4, '#141826', shade(p.c, -.2), shade(p.c, -.35)); px(cx - 10, cy + 2, 2, 1, 'rgba(240,217,160,.8)'); }
        else { isoBox(cx, cy, .42, .2, 5, p.c, shade(p.c, -.3), shade(p.c, -.45)); isoBox(cx - 1, cy - 5, .22, .17, 4, '#141826', shade(p.c, -.2), shade(p.c, -.35)); px(cx + 9, cy + 2, 2, 1, 'rgba(240,217,160,.8)'); }
        break;
      }
      case 'dumpster': isoBox(cx, cy, .3, .22, 7, '#2a3a31', '#1d2922', '#16201a'); px(cx - 6, cy - 7, 12, 1, '#3b4f43'); break;
      case 'bags': px(cx - 6, cy - 3, 4, 3, '#14161f'); px(cx - 2, cy - 4, 4, 4, '#1c1f2b'); px(cx + 2, cy - 2, 3, 2, '#14161f'); break;
      case 'crates': isoBox(cx - 3, cy + 1, .16, .16, 5, '#5a4a36', '#3e3325', '#33291d'); isoBox(cx + 4, cy - 1, .14, .14, 4, '#5a4a36', '#3e3325', '#33291d'); isoBox(cx - 1, cy - 5, .12, .12, 4, '#6a583f', '#46392a', '#3a2f22'); break;
      case 'flyers': ['#d8cdb2', '#c9bea3', '#d8cdb2'].forEach((c, i) => px(cx - 6 + i * 4, cy - 1 + (i % 2) * 2, 3, 2, c)); break;
      case 'puddle': {
        g.fillStyle = 'rgba(70,90,150,.35)'; g.beginPath(); g.ellipse(cx, cy, 7, 3, 0, 0, 7); g.fill();
        g.globalAlpha = .4 + Math.sin(time * 2 + cx) * .15; px(cx - 2, cy - 1, 3, 1, C.neon[1]); g.globalAlpha = 1;
        break;
      }
      case 'manhole': {
        g.fillStyle = '#121520'; g.beginPath(); g.ellipse(cx, cy, 5, 2.5, 0, 0, 7); g.fill();
        for (let i = 0; i < 8; i++) { const ph = (time * .3 + i * .125) % 1; g.globalAlpha = (1 - ph) * .35; px(cx + Math.sin(i * 3 + time) * 3, cy - ph * 26, 2, 2, '#c9cbd8'); }
        g.globalAlpha = 1; break;
      }
      case 'hydrant': px(cx - 1, cy - 6, 3, 6, '#8a2a24'); px(cx - 2, cy - 4, 5, 1, '#8a2a24'); px(cx - 1, cy - 7, 3, 1, '#a8352d'); break;
      case 'tree': {
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cx, cy, 9, 4, 0, 0, 7); g.fill();
        px(cx - 1, cy - 10, 3, 10, '#2e2620');
        const blobs = [[0, -18, 9], [-6, -14, 6], [6, -14, 6], [0, -24, 6]];
        blobs.forEach(([bx, by, br]) => { g.fillStyle = '#17291f'; g.beginPath(); g.arc(cx + bx, cy + by, br, 0, 7); g.fill(); });
        blobs.forEach(([bx, by, br]) => { g.fillStyle = '#21392b'; g.beginPath(); g.arc(cx + bx - 1, cy + by - 1, br * .6, 0, 7); g.fill(); });
        break;
      }
      case 'bush': { g.fillStyle = '#17291f'; g.beginPath(); g.arc(cx - 3, cy - 3, 4, 0, 7); g.arc(cx + 3, cy - 3, 4, 0, 7); g.fill(); g.fillStyle = '#21392b'; g.beginPath(); g.arc(cx - 1, cy - 5, 3, 0, 7); g.fill(); break; }
      case 'bench': isoBox(cx, cy - 2, .3, .07, 1, '#5a4a36', '#3e3325', '#33291d'); px(cx - 6, cy - 2, 1, 3, '#2a2a33'); px(cx + 5, cy - 1, 1, 3, '#2a2a33'); break;
      case 'fountain': {
        isoBox(cx, cy + 1, .4, .4, 3, '#2b4a7a', '#4a4c5c', '#3a3c4a');
        for (let i = 0; i < 12; i++) { const ph = (time * .9 + i / 12) % 1; const a = i * .52; g.globalAlpha = (1 - ph) * .7; px(cx + Math.cos(a) * ph * 7, cy - 3 - Math.sin(ph * 3.14) * 12, 1, 1, '#bcd2ff'); }
        g.globalAlpha = 1; px(cx, cy - 12, 1, 9, '#bcd2ff'); break;
      }
      case 'tower': {
        px(cx - 6, cy - 8, 1, 8, '#3a3f55'); px(cx + 5, cy - 8, 1, 8, '#3a3f55'); px(cx, cy - 6, 1, 6, '#3a3f55');
        isoBox(cx, cy - 8, .26, .26, 12, '#4a3a2c', '#3a2d22', '#2e241b');
        poly([[cx - 8, cy - 22], [cx, cy - 30], [cx + 8, cy - 22], [cx, cy - 18]], '#2a2d3a');
        break;
      }
      case 'ac': isoBox(cx, cy, .2, .2, 5, '#5c6175', '#44485a', '#373a49'); px(cx - 3, cy - 4, 6, 1, '#2a2d3a'); px(cx - 3, cy - 2, 6, 1, '#2a2d3a'); break;
      case 'skylight': isoBox(cx, cy, .35, .3, 2, 'rgba(110,150,220,.35)', '#3a3f55', '#2e3244'); break;
      case 'vent': isoBox(cx, cy, .1, .1, 7, '#5c6175', '#44485a', '#373a49'); px(cx - 2, cy - 9, 5, 1, '#6c7186'); break;
      case 'antenna': {
        px(cx, cy - 34, 1, 34, '#5c6175'); px(cx - 4, cy - 28, 9, 1, '#5c6175'); px(cx - 3, cy - 20, 7, 1, '#5c6175');
        if (Math.sin(time * 2.5) > 0) px(cx, cy - 36, 1, 2, '#ff4a3d');
        break;
      }
      case 'leak': {
        const pulse = .6 + Math.sin(time * 2.2) * .25;
        const lg = g.createRadialGradient(cx, cy, 0, cx, cy, 18); lg.addColorStop(0, `rgba(255,61,242,${.35 * pulse})`); lg.addColorStop(1, 'transparent');
        g.fillStyle = lg; g.fillRect(cx - 18, cy - 14, 36, 28);
        g.strokeStyle = C.neon[0]; g.globalAlpha = pulse; g.lineWidth = 1;
        g.beginPath(); g.ellipse(cx, cy, 8, 4, 0, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 3); g.lineTo(cx, cy + 3); g.stroke();
        g.globalAlpha = 1;
        for (let i = 0; i < 16; i++) {
          const ph = (time * (0.22 + (i % 5) * 0.05) + i * 0.137) % 1;
          g.globalAlpha = (1 - ph) * .9;
          px(cx + Math.sin(i * 2.3 + time * 1.7) * (3 + (i % 4) * 2), cy - ph * 36, 1, 1, C.neon[i % 2]);
        }
        g.globalAlpha = 1; break;
      }
      case 'pole': {
        px(cx, cy - 34, 2, 34, '#3e352c'); px(cx - 6, cy - 31, 14, 1, '#3e352c'); px(cx - 5, cy - 33, 1, 2, '#5c6175'); px(cx + 6, cy - 33, 1, 2, '#5c6175');
        isoBox(cx + 3, cy - 24, .08, .08, 5, '#4a4f66', '#3a3f55', '#2e3244');
        break;
      }
      case 'moto': isoBox(cx, cy, .25, .06, 3, '#2a2e3f', '#1d2030', '#171a27'); px(cx - 5, cy - 1, 3, 3, '#0b0d14'); px(cx + 3, cy + 2, 3, 3, '#0b0d14'); px(cx + 4, cy - 5, 1, 3, '#5c6175'); break;
      case 'cones': [[-4, 2], [3, -1], [7, 3]].forEach(([ox, oy]) => { px(cx + ox - 1, cy + oy - 5, 3, 5, '#b8562e'); px(cx + ox - 1, cy + oy - 3, 3, 1, C.paper); px(cx + ox - 2, cy + oy, 5, 1, '#5a2a18'); }); break;
      case 'kiosk': {
        isoBox(cx, cy, .3, .3, 10, '#2a3a31', '#1d2922', '#16201a');
        isoBox(cx, cy - 10, .36, .36, 2, '#1d2922', '#16201a', '#111912');
        for (let k = 0; k < 4; k++) px(cx + 1 + k * 3, cy - 6 - k * 1.5, 2, 3, ['#d8cdb2', '#c8322a', '#d8cdb2', '#6f95d6'][k]);
        break;
      }
      case 'busstop': {
        px(cx - 7, cy - 14, 1, 14, '#5c6175'); px(cx + 6, cy - 9, 1, 14, '#5c6175');
        poly([[cx - 9, cy - 15], [cx + 1, cy - 20], [cx + 9, cy - 10], [cx - 1, cy - 5]], 'rgba(110,150,220,.25)');
        isoBox(cx, cy - 1, .3, .06, 2, '#4a4f66', '#3a3f55', '#2e3244');
        px(cx - 4, cy - 12, 3, 4, 'rgba(240,217,160,.4)');
        break;
      }
      case 'duct': isoBox(cx, cy, .5, .13, 4, '#5c6175', '#44485a', '#373a49'); break;
      case 'dish': px(cx, cy - 6, 1, 6, '#5c6175'); g.fillStyle = '#8a8fa3'; g.beginPath(); g.ellipse(cx - 1, cy - 9, 5, 3, -.6, 0, 7); g.fill(); g.fillStyle = '#5c6175'; g.beginPath(); g.ellipse(cx - 1, cy - 9, 3, 1.5, -.6, 0, 7); g.fill(); break;
      case 'chimney': isoBox(cx, cy, .14, .14, 12, '#5a3a30', '#432b24', '#38241e'); for (let i = 0; i < 6; i++) { const ph = (time * .25 + i / 6) % 1; g.globalAlpha = (1 - ph) * .25; px(cx + Math.sin(i + time) * 3, cy - 14 - ph * 20, 3, 2, '#9aa0b8'); } g.globalAlpha = 1; break;
      case 'line': {
        px(cx - 12, cy - 14, 1, 14, '#5c6175'); px(cx + 12, cy - 2, 1, 14, '#5c6175');
        g.strokeStyle = '#5c6175'; g.beginPath(); g.moveTo(cx - 12, cy - 14); g.quadraticCurveTo(cx, cy - 4, cx + 12, cy - 2); g.stroke();
        [[-7, -9], [-1, -6], [5, -4]].forEach(([ox, oy], i) => { const sway = Math.round(Math.sin(time * 2 + i) * 1); poly([[cx + ox, cy + oy], [cx + ox + 5, cy + oy + 2], [cx + ox + 5 + sway, cy + oy + 9], [cx + ox + sway, cy + oy + 7]], i === 1 ? '#c9bea3' : '#e6dcc4'); });
        break;
      }
      case 'chalk': g.strokeStyle = 'rgba(230,220,196,.55)'; g.beginPath(); g.ellipse(cx, cy, 13, 6.5, 0, 0, 7); g.stroke(); for (let k = 0; k < 6; k++) { const a2 = k * 1.047; px(cx + Math.cos(a2) * 13, cy + Math.sin(a2) * 6.5, 1, 1, '#e6dcc4'); } break;
      case 'moto': isoBox(cx, cy - 1, .26, .06, 4, '#3a3f55', '#2a2e3d', '#22252f'); px(cx - 6, cy, 3, 3, '#0b0d14'); px(cx + 4, cy - 3, 3, 3, '#0b0d14'); px(cx + 4, cy - 7, 2, 2, '#5c6175'); break;
      case 'traffic': {
        px(cx, cy - 26, 1, 26, '#4a4f66'); px(cx - 2, cy - 30, 5, 9, '#1a1d29');
        const red = Math.floor(time / 3) % 2 === 0;
        px(cx - 1, cy - 29, 3, 2, red ? '#ff4a3d' : '#3a1a18'); px(cx - 1, cy - 25, 3, 2, red ? '#183a22' : '#3dff8a');
        break;
      }
      case 'shelter': {
        isoBox(cx, cy - 16, .42, .16, 2, '#3a3f55', '#2a2e3d', '#22252f');
        px(cx - 12, cy - 14, 1, 14, '#5c6175'); px(cx + 11, cy - 10, 1, 12, '#5c6175');
        g.fillStyle = 'rgba(140,170,220,.12)'; g.beginPath(); g.moveTo(cx - 12, cy - 14); g.lineTo(cx + 2, cy - 7); g.lineTo(cx + 2, cy + 5); g.lineTo(cx - 12, cy - 2); g.fill();
        px(cx - 9, cy - 9, 7, 4, 'rgba(240,217,160,.5)'); isoBox(cx - 2, cy - 1, .25, .05, 2, '#5a4a36', '#3e3325', '#33291d');
        break;
      }
      case 'kiosk': {
        isoBox(cx, cy, .34, .3, 13, '#2d3a55', '#232d42', '#1b2334');
        for (let k = 0; k < 10; k += 2) px(cx - 10 + k, cy - 9 + k / 2, 1, 8, '#3a4866');
        isoBox(cx, cy - 13, .4, .36, 2, '#5a2a2a', '#3e1d1d', '#331818');
        break;
      }
      case 'trash': isoBox(cx, cy, .1, .1, 6, '#3d4152', '#2d303d', '#252833'); px(cx - 2, cy - 7, 5, 1, '#5c6175'); break;
      case 'streettree': {
        g.strokeStyle = '#3a3f55'; g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx, cy - 3); g.lineTo(cx + 6, cy); g.lineTo(cx, cy + 3); g.closePath(); g.stroke();
        px(cx, cy - 12, 1, 12, '#2e2620');
        [[0, -18, 6], [-4, -14, 4], [4, -15, 4]].forEach(([bx, by, br]) => { g.fillStyle = '#17291f'; g.beginPath(); g.arc(cx + bx, cy + by, br, 0, 7); g.fill(); });
        g.fillStyle = '#21392b'; g.beginPath(); g.arc(cx - 1, cy - 19, 3, 0, 7); g.fill();
        break;
      }
      case 'dish': {
        px(cx, cy - 8, 1, 8, '#5c6175');
        g.fillStyle = '#8a8fa3'; g.beginPath(); g.ellipse(cx - 2, cy - 11, 5, 3.5, -.6, 0, 7); g.fill();
        g.fillStyle = '#5c6175'; g.beginPath(); g.ellipse(cx - 2, cy - 11, 3, 2, -.6, 0, 7); g.fill();
        break;
      }
      case 'solar': {
        px(cx - 6, cy - 2, 1, 3, '#5c6175'); px(cx + 6, cy - 5, 1, 4, '#5c6175');
        poly([[cx - 9, cy - 3], [cx + 3, cy - 9], [cx + 9, cy - 6], [cx - 3, cy]], '#1d2a4a');
        g.strokeStyle = 'rgba(140,170,220,.35)'; g.beginPath(); g.moveTo(cx - 6, cy - 4.5); g.lineTo(cx + 6, cy - 7.5); g.moveTo(cx - 3, cy - 6); g.lineTo(cx, cy - 1); g.stroke();
        break;
      }
      case 'chalk': {
        g.strokeStyle = 'rgba(230,220,196,.55)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(cx, cy, 13, 6.5, 0, 0.3, 5.6); g.stroke();
        g.beginPath(); g.moveTo(cx - 9, cy - 2); g.lineTo(cx + 9, cy + 2); g.moveTo(cx - 5, cy + 4); g.lineTo(cx + 4, cy - 4); g.stroke();
        break;
      }
      case 'pole': px(cx, cy - 18, 1, 18, '#5c6175'); px(cx - 2, cy - 18, 5, 1, '#5c6175'); break;
      case 'tape': {
        const pts = [[cx, cy - TH / 2], [cx + TW / 2, cy], [cx, cy + TH / 2], [cx - TW / 2, cy]];
        for (let i = 0; i < 4; i++) {
          const [a, b] = [pts[i], pts[(i + 1) % 4]];
          for (let k = 0; k < 8; k++) { const f = k / 8; px(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - 3, 2, 1, k % 2 ? C.paper : '#c8322a'); }
        }
        break;
      }
    }
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + r * f)); gg = Math.max(0, Math.min(255, gg + gg * f)); b = Math.max(0, Math.min(255, b + b * f));
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }

  function parapet(x, y, sx, sy) {
    const Nn = [sx, sy], E = [sx + TW / 2, sy + TH / 2], S = [sx, sy + TH], W = [sx - TW / 2, sy + TH / 2];
    const me = T[y][x];
    const edge = (nx, ny) => nx < 0 || ny < 0 || nx >= N || ny >= N || T[ny][nx] === 'v' || (T[ny][nx] !== me && T[ny][nx] !== 'h' && T[ny][nx] !== 'b' && T[ny][nx] !== 'B');
    const wall = (a, b, front) => {
      const hgt = 4;
      poly([a, b, [b[0], b[1] - hgt], [a[0], a[1] - hgt]], front ? '#3a3f55' : '#262a3b');
      g.strokeStyle = '#5a5f78'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1] - hgt); g.lineTo(b[0], b[1] - hgt); g.stroke();
    };
    if (edge(x, y - 1)) wall(Nn, E, false);
    if (edge(x - 1, y)) wall(W, Nn, false);
    if (edge(x + 1, y)) wall(E, S, true);
    if (edge(x, y + 1)) wall(S, W, true);
  }
  function railings(x, y, sx, sy) {
    if (!(M.props.some(p => p.t === 'rail'))) return;
    const S = [sx, sy + TH], E = [sx + TW / 2, sy + TH / 2], W = [sx - TW / 2, sy + TH / 2];
    g.strokeStyle = '#5c6175'; g.lineWidth = 1;
    if (y === N - 1) { g.beginPath(); g.moveTo(W[0], W[1] - 4); g.lineTo(S[0], S[1] - 4); g.stroke(); px(W[0], W[1] - 4, 1, 4, '#5c6175'); }
    if (x === N - 1) { g.beginPath(); g.moveTo(S[0], S[1] - 4); g.lineTo(E[0], E[1] - 4); g.stroke(); px(E[0] - 1, E[1] - 4, 1, 4, '#5c6175'); }
  }

  function drawSprite(target, cls, team, x0, y0) {
    const rows = SPR[cls], cols = { 1: C.outline, 2: C[team][0], 3: C[team][1], 4: C.skin, 5: C.neon[0] };
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < 14; c++) { const v = rows[r][c]; if (v !== '0') { target.fillStyle = cols[v]; target.fillRect(x0 + c, y0 + r, 1, 1); } }
  }

  function faceOf(u) {
    const others = units.filter(o => o.team !== u.team);
    if (!others.length) return u.team === 'ally' ? 1 : -1;
    const sx = (o) => (o.x - o.y);
    const avg = others.reduce((s, o) => s + sx(o), 0) / others.length;
    const d = avg - sx(u);
    return d === 0 ? (u.team === 'ally' ? 1 : -1) : d > 0 ? 1 : -1;
  }
  function animScene(now, time) {
    const k0 = Math.min(1, (now - rotAnim.t0) / rotAnim.dur);
    const k = k0 < .5 ? 4 * k0 * k0 * k0 : 1 - Math.pow(-2 * k0 + 2, 3) / 2;
    const phi = (rotAnim.from + (rotAnim.to - rotAnim.from) * k) * Math.PI / 180;
    const c = N / 2, cs = Math.cos(phi), sn = Math.sin(phi);
    const rp = (x, y) => { const u = x - c, v = y - c; return [c + u * cs - v * sn, c + u * sn + v * cs]; };
    const roof = M.sky === 'roof';
    const cells = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [cx, cy] = rp(x + .5, y + .5); cells.push({ x, y, d: cx + cy }); }
    cells.sort((a, b) => a.d - b.d);
    const unitsAt = {}; base.units.forEach(([id, cls, team, x, y]) => unitsAt[x + ',' + y] = { cls, team });
    for (const { x, y } of cells) {
      const t = base.T[y][x], h = base.H[y][x];
      if (t === 'v') continue;
      const tl = TILE[t] || TILE.B;
      const top = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b]) => { const [ra, rb] = rp(a, b); return iso(ra, rb, h); });
      const ct = [(top[0][0] + top[2][0]) / 2, (top[0][1] + top[2][1]) / 2];
      const depth = (h + 1) * HZ + (roof && t !== 'B' ? 56 : 0);
      if (t === 'B' && h >= 4) g.globalAlpha = .55;
      for (let i = 0; i < 4; i++) {
        const P1 = top[i], P2 = top[(i + 1) % 4], my = (P1[1] + P2[1]) / 2, mx = (P1[0] + P2[0]) / 2;
        if (my <= ct[1]) continue;
        poly([P1, P2, [P2[0], P2[1] + depth], [P1[0], P1[1] + depth]], mx < ct[0] ? tl.left : tl.right);
      }
      poly(top, tl.top);
      g.globalAlpha = 1;
      const u = unitsAt[x + ',' + y];
      if (u) {
        const [ux, uy] = [ct[0], ct[1]];
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(ux - 5, uy - 1, 10, 3);
        g.drawImage(SP.get(CLS[u.cls], 'idle', 0, u.team, u.team === 'ally' ? 1 : -1), ux - 8, uy - 21);
      }
    }
    if (k0 >= 1) { const d = rotAnim.d; rotAnim = null; R = (R + d + 4) % 4; load(key, true); }
  }
  /* ---------- render ---------- */
  let view = { dx: 0, dy: 0, s: 1, dpr: 1 };
  function render(now) {
    const time = (now - t0) / 1000, dpr = window.devicePixelRatio || 1;
    const CW = cvs.clientWidth * dpr, CH = cvs.clientHeight * dpr;
    if (cvs.width !== CW || cvs.height !== CH) { cvs.width = CW; cvs.height = CH; }
    const fit = Math.min(CW / MAPW, CH / (MAPH * 1.05));
    scale = fit >= 2 ? Math.floor(fit) : fit;
    const W = Math.ceil(CW / scale), Hh = Math.ceil(CH / scale);
    cam.z += (cam.zt - cam.z) * (cam.pinch ? 1 : .25);
    if (off.width !== W || off.height !== Hh) { off.width = W; off.height = Hh; }
    OX = Math.round(W / 2); OY = Math.round((Hh - MAPH) / 2) + 66 + (M.lift || 0);
    g.imageSmoothingEnabled = false;

    drawSky(W, Hh, time);
    if (rotAnim) animScene(now, time); else {

    const cells = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cells.push([x, y]);
    cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);

    // vão entre prédios: a rua lá embaixo
    for (const [x, y] of cells) {
      if (T[y][x] !== 'v') continue;
      const [sx, sy] = iso(x, y, -7);
      poly([[sx, sy], [sx + TW / 2, sy + TH / 2], [sx, sy + TH], [sx - TW / 2, sy + TH / 2]], '#0a0d18');
      if (y % 3 === 1) { const lg = g.createRadialGradient(sx, sy + 8, 0, sx, sy + 8, 10); lg.addColorStop(0, 'rgba(240,217,160,.35)'); lg.addColorStop(1, 'transparent'); g.fillStyle = lg; g.fillRect(sx - 10, sy - 2, 20, 20); }
      const carY = ((time * 0.5 + x * .1) % 1) * N;
      if (Math.abs(carY - y) < .5) px(sx - 1, sy + 8, 2, 1, 'rgba(255,90,80,.8)');
    }

    for (const [x, y] of cells) {
      const h = H[y][x], t = T[y][x], [sx, sy] = iso(x, y, h);
      if (t === 'B') {
        // prédio translúcido quando cobre uma unidade ou a célula escolhida
        const depthB = (h + 1) * HZ;
        const covers = (cx2, cy2, d2) => d2 < x + y && cx2 + 8 > sx - TW / 2 && cx2 - 8 < sx + TW / 2 && cy2 > sy && cy2 - 24 < sy + TH + depthB;
        const hid = units.some(u => { const [ux, uy] = iso(u.x, u.y, H[u.y][u.x]); return covers(ux, uy + TH / 2, u.x + u.y); })
          || (hover && (() => { const [hx, hy] = iso(hover.x, hover.y, H[hover.y][hover.x]); return covers(hx, hy + TH / 2, hover.x + hover.y); })());
        const walk = (nx, ny) => nx >= 0 && ny >= 0 && nx < N && ny < N && T[ny][nx] !== 'B';
        const cut = h >= 4 && (walk(x - 1, y) || walk(x, y - 1) || walk(x - 1, y - 1));
        const hv = cut ? 2 : h, [bx, by] = iso(x, y, hv);
        if (hid && !cut) g.globalAlpha = .28;
        building(x, y, bx, by, hv);
        if (cut) {
          g.strokeStyle = 'rgba(230,220,196,.18)'; g.lineWidth = 1;
          for (let k = -12; k <= 12; k += 4) { g.beginPath(); g.moveTo(bx + k - 4, by + 8 + k / 2 - 2); g.lineTo(bx + k + 4, by + 8 + k / 2 + 2); g.stroke(); }
        }
        g.globalAlpha = 1;
        continue;
      }
      if (t === 'v') continue;
      const roof = M.sky === 'roof';
      const tl = TILE[t], depth = t === 'b' ? 3 : (h + 1) * HZ + (roof ? 56 : 0);
      const Nn = [sx, sy], E = [sx + TW / 2, sy + TH / 2], S = [sx, sy + TH], Wv = [sx - TW / 2, sy + TH / 2];
      poly([Wv, S, [S[0], S[1] + depth], [Wv[0], Wv[1] + depth]], tl.left);
      poly([S, E, [E[0], E[1] + depth], [S[0], S[1] + depth]], tl.right);
      if (roof && t !== 'b') {
        // fachada do prédio descendo até a rua
        const r = rnd(x * 7 + y * 13);
        const openY = y === N - 1 || T[y + 1][x] === 'v', openX = x === N - 1 || T[y][x + 1] === 'v';
        for (let row = 12; row < depth - 2; row += 7) {
          if (openY) for (let k = 3; k < TW / 2 - 2; k += 5) px(Wv[0] + k, Wv[1] + k / 2 + row, 2, 3, r() < .3 ? 'rgba(240,217,160,.5)' : '#0b0e17');
          if (openX) for (let k = 3; k < TW / 2 - 2; k += 5) px(S[0] + k, S[1] - k / 2 + row, 2, 3, r() < .3 ? 'rgba(240,217,160,.4)' : '#0b0e17');
        }
        if (t === 'h') { for (let k = 5; k < 10; k++) for (let row = depth - 13; row < depth - 1; row++) if (row === depth - 13 || k === 5 || k === 9) px(Wv[0] + k, Wv[1] + k / 2 + row, 1, 1, '#1a1d2b'); else px(Wv[0] + k, Wv[1] + k / 2 + row, 1, 1, 'rgba(240,217,160,.55)'); }
      }
      poly([Nn, E, S, Wv], tl.top);
      // textura
      const rr = rnd(x * 13 + y * 7 + 1);
      if (t === 'z') {
        const road = (nx, ny) => nx >= 0 && ny >= 0 && nx < N && ny < N && ['a', 'z'].includes(T[ny][nx]);
        const alongX = road(x - 1, y) || road(x + 1, y);
        const A = alongX ? [8, 4] : [-8, 4], Bv = alongX ? [-8, 4] : [8, 4];
        g.strokeStyle = 'rgba(230,220,196,.5)'; g.lineWidth = 2;
        for (const k of [-.55, 0, .55]) { const c0 = [sx + Bv[0] * k, sy + 8 + Bv[1] * k]; g.beginPath(); g.moveTo(c0[0] - A[0] * .6, c0[1] - A[1] * .6); g.lineTo(c0[0] + A[0] * .6, c0[1] + A[1] * .6); g.stroke(); }
        g.lineWidth = 1;
      }
      else if (t === 'a') {
        const EP = { '+x': [E, S], '+y': [S, Wv], '-x': [Wv, Nn], '-y': [Nn, E] };
        (laneEdges[x + ',' + y] || []).forEach(({ dir, dash }) => { if (!dash) return; const [p0, p1] = EP[dir]; g.strokeStyle = 'rgba(217,180,74,.8)'; g.beginPath(); g.moveTo(p0[0] + (p1[0] - p0[0]) * .25, p0[1] + (p1[1] - p0[1]) * .25); g.lineTo(p0[0] + (p1[0] - p0[0]) * .75, p0[1] + (p1[1] - p0[1]) * .75); g.stroke(); });
        for (let k = 0; k < 2; k++) px(sx - 6 + rr() * 12, sy + 4 + rr() * 8, 1, 1, '#30364a');
        if (M.crosswalk && x === M.crosswalk.x && y >= M.crosswalk.y0 && y <= M.crosswalk.y1) for (let k = -6; k <= 6; k += 3) poly([[sx + k - 4, sy + 6 + k / 2], [sx + k - 2, sy + 5 + k / 2], [sx + k + 6, sy + 9 + k / 2], [sx + k + 4, sy + 10 + k / 2]], 'rgba(230,220,196,.4)');
      }
      else if (t === 'k') { for (let k = 0; k < 7; k++) px(sx - 9 + rr() * 18, sy + 3 + rr() * 10, 1, 1, rr() < .5 ? '#3f4252' : '#1d1f29'); }
      else if (t === 'b') { for (let k = -6; k <= 6; k += 4) { g.strokeStyle = '#3e3325'; g.beginPath(); g.moveTo(sx + k - 4, sy + 6 + k / 2); g.lineTo(sx + k + 4, sy + 10 + k / 2); g.stroke(); } }
      else if (t === 'r') { g.strokeStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(sx - TW / 2 + 2, sy + TH / 2); g.lineTo(sx, sy + TH - 1); g.stroke(); for (let k = 0; k < 4; k++) px(sx - 8 + rr() * 16, sy + 3 + rr() * 10, 1, 1, '#3a3f55'); }
      else if (t === 's' || t === 'q') { g.strokeStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(sx - 8, sy + 4); g.lineTo(sx + 8, sy + 12); g.moveTo(sx + 8, sy + 4); g.lineTo(sx - 8, sy + 12); g.stroke(); }
      else if (t === 'g') { for (let k = 0; k < 6; k++) px(sx - 9 + rr() * 18, sy + 3 + rr() * 10, 1, 1, rr() < .5 ? '#2a4236' : '#16241d'); }
      else if (t === 'w') { g.globalAlpha = .4 + Math.sin(time * 1.5 + x + y) * .2; px(sx - 4 + Math.sin(time + y) * 2, sy + 7, 5, 1, '#5d7fc4'); g.globalAlpha = 1; }
      else if (t === 'R' || t === 'p' || t === 'x') { for (let k = 0; k < 5; k++) px(sx - 8 + rr() * 16, sy + 3 + rr() * 10, 1, 1, rr() < .5 ? '#3d4152' : '#1a1d27'); }
      if (t === 's') {
        g.strokeStyle = 'rgba(230,220,196,.22)'; g.lineWidth = 1;
        const rd = (nx, ny) => nx >= 0 && ny >= 0 && nx < N && ny < N && ['a', 'z'].includes(T[ny][nx]);
        const line2 = (p, q) => { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
        if (rd(x, y + 1)) line2(Wv, S); if (rd(x, y - 1)) line2(Nn, E); if (rd(x + 1, y)) line2(E, S); if (rd(x - 1, y)) line2(Wv, Nn);
      }
      if (roof && ['r', 'k'].includes(t)) parapet(x, y, sx, sy);

      if (M.fence && t === 'f') {
        const walk = (nx, ny) => nx >= 0 && ny >= 0 && nx < N && ny < N && !['B', 'f'].includes(T[ny][nx]);
        const fence = (a, b2) => {
          g.strokeStyle = 'rgba(150,158,180,.35)'; g.lineWidth = 1;
          for (let k = 0; k <= 4; k++) { const fx = a[0] + (b2[0] - a[0]) * k / 4, fy = a[1] + (b2[1] - a[1]) * k / 4; px(fx, fy - 5, 1, 5, 'rgba(108,113,134,.8)'); }
          for (const off of [-5, -2]) { g.beginPath(); g.moveTo(a[0], a[1] + off); g.lineTo(b2[0], b2[1] + off); g.stroke(); }
        };
        if (walk(x - 1, y)) fence(Wv, Nn);
        if (walk(x, y - 1)) fence(Nn, E);
        if (walk(x + 1, y)) fence(E, S);
        if (walk(x, y + 1)) fence(S, Wv);
      }
      if ((M.threat || []).some(([tx, ty]) => tx === x && ty === y)) {
        poly([Nn, E, S, Wv], 'rgba(200,50,42,.30)');
        g.strokeStyle = 'rgba(217,71,61,.85)'; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(Nn[0], Nn[1] + 4); g.lineTo(S[0], S[1] - 4); g.stroke(); g.setLineDash([]);
      }
      if (inMove(x, y)) poly([Nn, E, S, Wv], C.move);
      if (inAtk(x, y)) poly([Nn, E, S, Wv], C.atk);
      if (x === selected.x && y === selected.y) poly([Nn, E, S, Wv], 'rgba(230,220,196,.14)');
      if (hover && hover.x === x && hover.y === y) { g.strokeStyle = C.paper; g.globalAlpha = .7; g.beginPath(); g.moveTo(Nn[0], Nn[1]); g.lineTo(E[0], E[1]); g.lineTo(S[0], S[1]); g.lineTo(Wv[0], Wv[1]); g.closePath(); g.stroke(); g.globalAlpha = 1; }

      const cx = sx, cy = sy + TH / 2;
      const ps = propAt[x + ',' + y] || [];
      const FLOOR = ['puddle', 'manhole', 'flyers', 'chalk', 'leak', 'tape'];
      ps.filter(p => FLOOR.includes(p.t)).sort((a, b) => FLOOR.indexOf(a.t) - FLOOR.indexOf(b.t)).forEach(p => drawProp(p, cx, cy, time));
      ps.filter(p => !FLOOR.includes(p.t)).forEach(p => drawProp(p, cx, cy, time));

      const u = units.find(u => u.x === x && u.y === y);
      if (u) {
        const col = SP.TEAM[u.team][0];
        g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 12, cy); g.lineTo(cx, cy + 6); g.lineTo(cx - 12, cy); g.closePath(); g.stroke();
        if (u.team === 'enemy') { g.fillStyle = col; [[cx, cy - 7], [cx + 13, cy], [cx, cy + 6], [cx - 13, cy]].forEach(([qx, qy]) => g.fillRect(qx - 1, qy - 1, 3, 3)); }
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(cx - 5, cy - 1, 10, 3);
        const fr = Math.floor(time / .6) % 2;
        g.drawImage(SP.get(CLS[u.cls], 'idle', fr, u.team, faceOf(u)), cx - 8, cy - 21);
        if (u === selected) { const ay = cy - 31 + Math.round(Math.sin(time * 4) * 1.5); px(cx - 1, ay, 3, 2, '#6f95d6'); px(cx, ay + 2, 1, 1, '#6f95d6'); }
      }
    }


    const top = (x, y, lift) => { const [ax, ay] = iso(x, y, H[y][x]); return [ax, ay + TH / 2 - lift]; };
    (M.wires || []).forEach(([x1, y1, x2, y2]) => {
      const a = top(x1, y1, 23), b2 = top(x2, y2, 23);
      g.strokeStyle = 'rgba(10,12,20,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]);
      g.quadraticCurveTo((a[0] + b2[0]) / 2, Math.max(a[1], b2[1]) + 10, b2[0], b2[1]); g.stroke();
    });
    (M.lines || []).forEach(([x1, y1, x2, y2]) => {
      const a = top(x1, y1, 18), b2 = top(x2, y2, 18);
      g.strokeStyle = 'rgba(200,200,210,.5)'; g.beginPath(); g.moveTo(a[0], a[1]);
      const mx = (a[0] + b2[0]) / 2, my = Math.max(a[1], b2[1]) + 5; g.quadraticCurveTo(mx, my, b2[0], b2[1]); g.stroke();
      for (let i = 1; i < 5; i++) {
        const f = i / 5, qx = (1 - f) * (1 - f) * a[0] + 2 * (1 - f) * f * mx + f * f * b2[0], qy = (1 - f) * (1 - f) * a[1] + 2 * (1 - f) * f * my + f * f * b2[1];
        const sway = Math.round(Math.sin(time * 1.4 + i) * 1);
        px(qx - 2 + sway, qy, 5, 6 + (i % 2) * 2, i % 2 ? '#d8cdb2' : '#9fa6bd');
      }
    });

    }
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, CW, CH);
    const S = scale * cam.z, dw = W * S, dh = Hh * S;
    const maxX = Math.max(0, (dw - CW) / 2) + CW * .25, maxY = Math.max(0, (dh - CH) / 2) + CH * .25;
    cam.px = Math.max(-maxX, Math.min(maxX, cam.px)); cam.py = Math.max(-maxY, Math.min(maxY, cam.py));
    const ox = (CW - dw) / 2 + cam.px, oy = (CH - dh) / 2 + cam.py;
    ctx.drawImage(off, Math.round(ox), Math.round(oy), Math.round(dw), Math.round(dh));
    view = { s: S, dpr, ox, oy, base: scale, W, Hh, CW, CH };
    document.getElementById('c-zl').textContent = (Math.round(cam.zt * 10) / 10) + 'x';
    requestAnimationFrame(render);
  }

  function pick(clientX, clientY) {
    if (rotAnim) return null;
    const r = cvs.getBoundingClientRect();
    const lx = ((clientX - r.left) * view.dpr - view.ox) / view.s, ly = ((clientY - r.top) * view.dpr - view.oy) / view.s;
    let found = null;
    for (let y = N - 1; y >= 0 && !found; y--) for (let x = N - 1; x >= 0 && !found; x--) {
      const [sx, sy] = iso(x, y, H[y][x]);
      if (Math.abs(lx - sx) / (TW / 2) + Math.abs(ly - (sy + TH / 2)) / (TH / 2) <= 1) found = { x, y };
    }
    return found;
  }
  function showCell(found) {
    hover = found;
    const el = document.getElementById('cell');
    if (!found) { el.innerHTML = 'Célula <b>—</b>'; return; }
    const ps = (propAt[found.x + ',' + found.y] || []).map(p => ({ lamp: 'poste', car: 'carro (cobertura)', dumpster: 'caçamba (cobertura)', crates: 'caixas (cobertura)', tree: 'árvore (cobertura)', bench: 'banco', fountain: 'chafariz', tower: "caixa d'água", ac: 'ar-condicionado (cobertura)', skylight: 'claraboia', vent: 'exaustor', antenna: 'antena', leak: 'vazamento esotérico', tape: 'isolamento', puddle: 'poça', manhole: 'bueiro', flyers: 'avisos oficiais', hydrant: 'hidrante', bags: 'sacos de lixo', bush: 'arbusto', pole: 'poste de fiação', moto: 'moto (cobertura)', cones: 'cones', kiosk: 'banca de jornal (cobertura)', busstop: 'ponto de ônibus', duct: 'duto', dish: 'antena parabólica', chimney: 'chaminé (cobertura)', line: 'varal', chalk: 'círculo de giz' }[p.t])).filter(Boolean);
    el.innerHTML = `Célula <b>${'ABCDEFGHIJ'[found.x]}${found.y + 1}</b> · ${TILE[T[found.y][found.x]].name} · altura <b>${H[found.y][found.x]}</b>` + (ps.length ? `<br>${ps.join(', ')}` : '');
    }
  // zoom em torno de um ponto da tela, em pixels do dispositivo
  function zoomAt(newZ, px0, py0) {
    newZ = Math.max(1, Math.min(4, newZ));
    const u = (px0 - view.ox) / view.s, v = (py0 - view.oy) / view.s;
    const S2 = view.base * newZ, dw = view.W * S2, dh = view.Hh * S2;
    cam.px = px0 - u * S2 - (view.CW - dw) / 2; cam.py = py0 - v * S2 - (view.CH - dh) / 2;
    cam.z = cam.zt = newZ;
  }
  const pointers = new Map(); let gesture = null;
  cvs.addEventListener('pointerdown', (e) => {
    cvs.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      gesture = { d: Math.hypot(p.x - q.x, p.y - q.y), z: cam.zt }; cam.pinch = true;
    }
  });
  cvs.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') showCell(pick(e.clientX, e.clientY)); return; }
    const dx = (e.clientX - p.x) * view.dpr, dy = (e.clientY - p.y) * view.dpr;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) { if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) { cvs.classList.add('dragging'); cam.px += dx; cam.py += dy; } }
    else if (pointers.size === 2 && gesture) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), r = cvs.getBoundingClientRect();
      zoomAt(gesture.z * d / gesture.d, ((a.x + b.x) / 2 - r.left) * view.dpr, ((a.y + b.y) / 2 - r.top) * view.dpr);
    }
  });
  function endPointer(e) {
    const p = pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if (p && pointers.size === 0 && !gesture && Math.hypot(p.x - p.sx, p.y - p.sy) <= 6) showCell(pick(e.clientX, e.clientY));
    if (pointers.size < 2 && gesture) { gesture = null; cam.pinch = false; const r = cvs.getBoundingClientRect(); zoomAt(Math.round(cam.zt), view.CW / 2, view.CH / 2); }
    if (pointers.size === 0) cvs.classList.remove('dragging');
  }
  cvs.addEventListener('pointerup', endPointer); cvs.addEventListener('pointercancel', endPointer);
  cvs.addEventListener('wheel', (e) => { e.preventDefault(); const r = cvs.getBoundingClientRect(); zoomAt(Math.round(cam.zt) + (e.deltaY < 0 ? 1 : -1), (e.clientX - r.left) * view.dpr, (e.clientY - r.top) * view.dpr); }, { passive: false });
  function rotate(d) {
    if (rotAnim) return;
    rotAnim = { from: R * 90, to: (R + d) * 90, t0: performance.now(), dur: 450, d };
  }
  function center() { cam.px = 0; cam.py = 0; }
  document.getElementById('c-rl').addEventListener('click', () => rotate(-1));
  document.getElementById('c-rr').addEventListener('click', () => rotate(1));
  document.getElementById('c-zi').addEventListener('click', () => zoomAt(Math.round(cam.zt) + 1, view.CW / 2, view.CH / 2));
  document.getElementById('c-zo').addEventListener('click', () => zoomAt(Math.round(cam.zt) - 1, view.CW / 2, view.CH / 2));
  document.getElementById('c-ce').addEventListener('click', center);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(), step = 40 * (view.dpr || 1);
    if (k === 'q') rotate(-1); else if (k === 'e') rotate(1);
    else if (k === '+' || k === '=') zoomAt(Math.round(cam.zt) + 1, view.CW / 2, view.CH / 2);
    else if (k === '-') zoomAt(Math.round(cam.zt) - 1, view.CW / 2, view.CH / 2);
    else if (k === 'c') center();
    else if (k === 'arrowleft' || k === 'a') cam.px += step; else if (k === 'arrowright' || k === 'd') cam.px -= step;
    else if (k === 'arrowup' || k === 'w') cam.py += step; else if (k === 'arrowdown' || k === 's') cam.py -= step;
  });

  function portrait(canvas, cls, team) { canvas.width = 16; canvas.height = 24; const c = canvas.getContext('2d'); c.clearRect(0, 0, 16, 24); c.drawImage(SP.get(CLS[cls], 'idle', 0, team, team === 'ally' ? 1 : -1), 0, 0); }
  function renderHud() {
    portrait(document.getElementById('u-portrait'), 'S', 'ally');
    const turn = document.getElementById('turn'); turn.querySelectorAll('.portrait').forEach(p => p.remove());
    ['aS', 'eS', 'aW', 'eW', 'aP', 'eP'].forEach((id, i) => {
      const u = units.find(u => u.id === id), d = document.createElement('div');
      d.className = `portrait ${u.team}` + (i === 0 ? ' current' : '');
      const cv = document.createElement('canvas'); d.appendChild(cv); turn.appendChild(d); portrait(cv, u.cls, u.team);
    });
  }

  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { R = 0; rotAnim = null; load(b.dataset.m); }));
  load('street');
  requestAnimationFrame(render);
})();
