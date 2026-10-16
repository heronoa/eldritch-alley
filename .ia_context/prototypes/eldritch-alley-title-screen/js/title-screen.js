(function () {
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


  CLASSES.sniper.ammo = true;
  ['initiate', 'adept', 'wizard', 'priest'].forEach(k => CLASSES[k].mana = true);
  const cache = new Map();
  function sprite(key, anim, frame, face, t, mode) {
    const id = [key, anim, frame, face, mode, key === 'vendor' ? Math.floor(t / 700) % 6 === 0 : key === 'sniper' ? Math.floor(t / 900) % 4 === 0 : 0].join('|');
    if (cache.has(id)) return cache.get(id);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    MODE = mode || 'ranged';
    if (anim === 'meditate') {
      CLASSES[key].draw(g, 'idle', 0, 'ally', t);
      g.fillStyle = SKIN[0]; g.fillRect(6, 6, 1, 1); g.fillRect(9, 6, 1, 1); g.fillStyle = SKIN[1]; g.fillRect(6, 7, 1, 1); g.fillRect(9, 7, 1, 1);
      g.fillStyle = SKIN[0]; g.fillRect(7, 13, 2, 2); if (frame === 1) { g.fillStyle = '#3de9ff'; g.fillRect(7, 12, 2, 1); }
    } else CLASSES[key].draw(g, anim, frame, 'ally', t);
    // braçadeira neutra na tela inicial
    g.fillStyle = '#5c6175'; g.fillRect(3, 12 + (anim === 'idle' && frame === 1 ? 1 : 0), 2, 2);
    outline(g, OUT);
    let out = c;
    if (face === -1) { const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d'); mg.translate(W, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0); out = m; }
    cache.set(id, out); return out;
  }

  /* ---------- cidade ---------- */
  const N = 16, TW = 32, TH = 16, HZ = 8;
  const T = [], Hm = [];
  for (let y = 0; y < N; y++) { T.push([]); Hm.push([]); for (let x = 0; x < N; x++) {
    let t = 'B';
    if (y === 6 || y === 7 || x === 8 || x === 9) t = 'a';
    else if (y === 5 || y === 8 || x === 7 || x === 10) t = 's';
    else if (x >= 1 && x <= 5 && y >= 10 && y <= 14) t = 'g';
    if (t === 'a' && ((x === 7 || x === 10) && (y === 6 || y === 7))) t = 'z';
    if (t === 'a' && ((y === 5 || y === 8) && (x === 8 || x === 9))) t = 'z';
    T[y].push(t);
    let h = 0;
    if (t === 'B') {
      const r = (x * 73 + y * 151) % 17;
      const far = x + y < 12, front = x + y > 21;
      h = front ? 1 + (r % 2) : far ? 4 + (r % 5) : 2 + (r % 4);
    }
    Hm[y].push(h);
  } }
  // praça: borda de prédios baixos
  for (let y = 9; y < N; y++) for (let x = 0; x < 7; x++) if (T[y][x] === 'B') Hm[y][x] = Math.min(Hm[y][x], 2);
  const PROPS = [
    { t: 'lamp', x: 7, y: 4 }, { t: 'lamp', x: 10, y: 4 }, { t: 'lamp', x: 6, y: 8 }, { t: 'lamp', x: 11, y: 8 }, { t: 'lamp', x: 7, y: 11 }, { t: 'lamp', x: 10, y: 12 }, { t: 'lamp', x: 3, y: 5 }, { t: 'lamp', x: 13, y: 5 },
    { t: 'car', x: 3, y: 6, c: '#4a2830' }, { t: 'car', x: 12, y: 7, c: '#2d3a55' }, { t: 'car', x: 8, y: 2, c: '#3d4152', v: true }, { t: 'car', x: 9, y: 12, c: '#4a3e22', v: true },
    { t: 'tree', x: 2, y: 11 }, { t: 'tree', x: 5, y: 13 }, { t: 'tree', x: 1, y: 14 }, { t: 'tree', x: 4, y: 10 },
    { t: 'leak', x: 3, y: 12 }, { t: 'leak', x: 12, y: 3 }
  ];
  const propAt = {}; PROPS.forEach(p => (propAt[p.x + ',' + p.y] = propAt[p.x + ',' + p.y] || []).push(p));

  /* ---------- personagens ---------- */
  const RING = [[7, 5], [7, 8], [10, 8], [10, 5]];
  const PATHS = {
    sniper: { pts: RING, off: 0, act: 'reload', every: 2 },
    wizard: { pts: [[7, 8], [7, 11], [3, 11], [3, 9], [7, 9]], off: 1.5, act: 'meditate', every: 1, near: [3, 11] },
    priest: { pts: [[10, 5], [10, 8], [13, 8], [13, 5]], off: 0.6, act: 'meditate', every: 2 },
    initiate: { pts: [[7, 5], [3, 5], [3, 4], [7, 4]], off: 2.2, act: 'meditate', every: 2 },
    adept: { pts: RING, off: 2.4, act: 'meditate', every: 3 },
    vendor: { pts: [[10, 8], [10, 12], [11, 12], [11, 8]], off: 1, act: 'throw', every: 2 },
    combatant: { pts: [[7, 8], [10, 8], [10, 5], [7, 5]], off: 3.1, act: 'idle', every: 3 }
  };
  const walkers = Object.entries(PATHS).map(([key, p]) => ({ key, ...p, seg: Math.floor(p.off) % p.pts.length, f: p.off % 1, x: 0, y: 0, face: 1, state: 'walk', timer: 0, laps: 0, effect: null }));
  const SPEED = 0.9; // células por segundo

  const cvs = document.getElementById('city'), ctx = cvs.getContext('2d');
  const off = document.createElement('canvas'), g = off.getContext('2d');
  let OX = 0, OY = 0, scale = 3, last = performance.now();
  const iso = (x, y, h) => [OX + (x - y) * TW / 2, OY + (x + y) * TH / 2 - h * HZ];
  const P = (pts, c) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = c; g.fill(); };
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  function rnd(seed) { let s = (seed * 2654435761) % 4294967296; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  function isoBox(cx, cy, a, b, h, top, left, right) {
    const Q = (u, v, z) => [cx + (u - v) * TW / 2, cy + (u + v) * TH / 2 - z];
    P([Q(-a, b, 0), Q(a, b, 0), Q(a, b, h), Q(-a, b, h)], left); P([Q(a, -b, 0), Q(a, b, 0), Q(a, b, h), Q(a, -b, h)], right); P([Q(-a, -b, h), Q(a, -b, h), Q(a, b, h), Q(-a, b, h)], top);
  }
  const TILE = { a: ['#23283a', '#171b28', '#11141f'], z: ['#23283a', '#171b28', '#11141f'], s: ['#343b51', '#22283a', '#1a1f2e'], g: ['#1f3029', '#16221d', '#111a16'], B: ['#1a1e2c', '#141826', '#0f121c'] };

  function step(dt) {
    walkers.forEach(w => {
      if (w.state === 'walk') {
        const a = w.pts[w.seg], b = w.pts[(w.seg + 1) % w.pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        w.f += SPEED * dt / len;
        if (w.f >= 1) {
          w.f = 0; w.seg = (w.seg + 1) % w.pts.length;
          if (w.seg === 0) w.laps++;
          if (w.seg === 0 && w.laps % w.every === 0 && w.act !== 'idle') { w.state = 'act'; w.timer = 0; }
          else if (w.seg % 2 === 1 && w.act === 'idle' && Math.random() < .5) { w.state = 'act'; w.timer = 0; }
        }
        const A = w.pts[w.seg], B2 = w.pts[(w.seg + 1) % w.pts.length];
        w.x = A[0] + (B2[0] - A[0]) * w.f; w.y = A[1] + (B2[1] - A[1]) * w.f;
        const sdx = (B2[0] - A[0]) - (B2[1] - A[1]); if (sdx !== 0) w.face = sdx > 0 ? 1 : -1;
      } else {
        w.timer += dt; if (w.timer > 2.4) w.state = 'walk';
      }
    });
  }

  function drawEffectsUnder(w, cx, cy, time) {
    if (w.state !== 'act' || w.act !== 'meditate') return;
    const k = Math.min(1, w.timer / .3, (2.4 - w.timer) / .3);
    if (k <= 0) return;
    if (w.key === 'wizard' || w.key === 'initiate') {
      g.globalAlpha = .9 * k; g.strokeStyle = '#ff3df2'; g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy, 12, 6, 0, 0, 7); g.stroke();
      g.strokeStyle = '#3de9ff'; g.beginPath(); g.ellipse(cx, cy, 8, 4, 0, 0, 7); g.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + time / .6; px(cx + Math.cos(a) * 10, cy + Math.sin(a) * 5, 1, 1, i % 2 ? '#ff3df2' : '#ffd0f8'); }
      g.globalAlpha = 1;
    } else {
      const gr = g.createLinearGradient(0, 0, 0, cy); gr.addColorStop(0, 'rgba(61,233,255,0)'); gr.addColorStop(1, `rgba(61,233,255,${.32 * k})`);
      g.fillStyle = gr; g.fillRect(cx - 7, 0, 14, cy);
      g.globalAlpha = .45 * k; g.fillStyle = '#bff6ff'; g.beginPath(); g.ellipse(cx, cy, 10, 5, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    }
  }
  function drawEffectsOver(w, cx, cy, time) {
    if (w.state !== 'act') return;
    const k = Math.min(1, w.timer / .3, (2.4 - w.timer) / .3);
    if (w.act === 'meditate' && (w.key === 'wizard' || w.key === 'initiate')) for (let i = 0; i < 10; i++) { const ph = (w.timer / .9 + i * .1) % 1; g.globalAlpha = (1 - ph) * k; px(cx - 8 + (i * 7) % 16, cy - 4 - ph * 24, 1, 1, i % 2 ? '#3de9ff' : '#ff3df2'); g.globalAlpha = 1; }
    if (w.act === 'meditate' && (w.key === 'adept' || w.key === 'priest')) for (let i = 0; i < 4; i++) { const ph = (w.timer / .7 + i * .25) % 1; g.globalAlpha = (1 - ph) * k; px(cx - 5 + i * 3, cy - 30 + ph * 26, 1, 2, '#e8fdff'); g.globalAlpha = 1; }
    if (w.act === 'reload' && w.timer > .3 && w.timer < .8) px(cx - 1, cy - 8 + (w.timer - .3) * 14, 2, 2, '#3a3f55');
    if (w.act === 'throw' && w.timer > .5 && w.timer < 1.1) { const p = (w.timer - .5) / .6; px(cx + w.face * p * 40, cy - 12 - Math.sin(p * Math.PI) * 22 + p * 10, 2, 2, '#3f8a5a'); }
    if (w.act === 'throw' && w.timer >= 1.1 && w.timer < 1.4) { const p = (w.timer - 1.1) / .3; for (let i = 0; i < 6; i++) px(cx + w.face * 40 + Math.cos(i) * p * 8, cy - 2 + Math.sin(i * 1.7) * p * 5, 1, 1, i % 2 ? '#3f8a5a' : '#d8e8d0'); }
  }

  function render(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; const time = now / 1000;
    step(dt);
    const dpr = window.devicePixelRatio || 1, CW = cvs.clientWidth * dpr, CH = cvs.clientHeight * dpr;
    if (cvs.width !== CW || cvs.height !== CH) { cvs.width = CW; cvs.height = CH; }
    scale = Math.max(2, Math.round(Math.min(CW / 520, CH / 300)));
    const Wd = Math.ceil(CW / scale), Hd = Math.ceil(CH / scale);
    if (off.width !== Wd || off.height !== Hd) { off.width = Wd; off.height = Hd; }
    OX = Math.round(Wd / 2 - 32); OY = Math.round(Hd * .7 - 15 * TH / 2 - 8);
    g.imageSmoothingEnabled = false;

    // céu e horizonte
    const sky = g.createLinearGradient(0, 0, 0, Hd); sky.addColorStop(0, '#0d1428'); sky.addColorStop(1, '#05070f'); g.fillStyle = sky; g.fillRect(0, 0, Wd, Hd);
    const rs = rnd(5); for (let i = 0; i < 70; i++) { g.globalAlpha = .2 + ((Math.sin(time * 1.3 + i) + 1) / 2) * .5; px(rs() * Wd, rs() * Hd * .35, 1, 1, '#cfd6ff'); } g.globalAlpha = 1;
    const sk = rnd(9); let sx0 = -4; while (sx0 < Wd) { const bw = 8 + sk() * 18, bh = 20 + sk() * 50; px(sx0, Hd * .32 - bh, bw, bh + Hd, '#0a0e1e'); for (let wy = Hd * .32 - bh + 3; wy < Hd * .32; wy += 5) for (let wx = sx0 + 2; wx < sx0 + bw - 2; wx += 4) if (sk() < .12) { g.globalAlpha = .5; px(wx, wy, 1, 2, '#f0d9a0'); g.globalAlpha = 1; } sx0 += bw + 2; }

    // células, objetos e personagens em ordem de profundidade
    const items = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) items.push({ d: x + y, o: 0, x, y });
    walkers.forEach(w => items.push({ d: Math.round(w.x) + Math.round(w.y) + .5, o: 1, w }));
    items.sort((a, b) => a.d - b.d || a.o - b.o);
    for (const it of items) {
      if (it.o === 0) {
        const { x, y } = it, t = T[y][x], h = Hm[y][x], [sx, sy] = iso(x, y, h), col = TILE[t] || TILE.a, depth = (h + 1) * HZ;
        const Nn = [sx, sy], E = [sx + 16, sy + 8], S = [sx, sy + 16], Wv = [sx - 16, sy + 8];
        P([Wv, S, [S[0], S[1] + depth], [Wv[0], Wv[1] + depth]], col[1]); P([S, E, [E[0], E[1] + depth], [S[0], S[1] + depth]], col[2]); P([Nn, E, S, Wv], col[0]);
        const rr = rnd(x * 31 + y * 17 + 3);
        if (t === 'B') {
          for (let row = 4; row < depth - 4; row += 6) for (let k = 2; k < 14; k += 4) {
            px(Wv[0] + k, Wv[1] + k / 2 + row, 2, 3, rr() < .26 ? 'rgba(240,217,160,.55)' : '#0b0e17');
            px(S[0] + k, S[1] - k / 2 + row, 2, 3, rr() < .2 ? 'rgba(240,217,160,.45)' : '#0b0e17');
          }
        } else if (t === 'z') { for (let k = -8; k <= 8; k += 4) px(sx + k - 1, sy + 7 + k / 2 * (x === 8 || x === 9 ? -1 : 1), 2, 2, 'rgba(230,220,196,.35)'); }
        else if (t === 'a') { if (y === 6 && x % 2 === 0) px(sx - 8, sy + 11, 6, 1, 'rgba(217,180,74,.55)'); if (x === 8 && y % 2 === 0) px(sx + 3, sy + 11, 6, 1, 'rgba(217,180,74,.55)'); }
        else if (t === 'g') { for (let k = 0; k < 5; k++) px(sx - 9 + rr() * 18, sy + 3 + rr() * 10, 1, 1, rr() < .5 ? '#2a4236' : '#16241d'); }
        const cx = sx, cy = sy + 8;
        (propAt[x + ',' + y] || []).forEach(p => {
          if (p.t === 'lamp') { const lg = g.createRadialGradient(cx, cy, 0, cx, cy, 20); lg.addColorStop(0, 'rgba(240,217,160,.22)'); lg.addColorStop(1, 'transparent'); g.fillStyle = lg; g.fillRect(cx - 20, cy - 12, 40, 26); px(cx, cy - 22, 1, 22, '#4a4f66'); px(cx - 1, cy - 23, 4, 2, '#4a4f66'); px(cx + 2, cy - 21, 2, 1, '#f0d9a0'); }
          if (p.t === 'car') { if (p.v) { isoBox(cx, cy, .2, .42, 5, p.c, '#1d2030', '#161824'); isoBox(cx, cy - 5, .17, .22, 4, '#141826', '#1d2030', '#161824'); } else { isoBox(cx, cy, .42, .2, 5, p.c, '#1d2030', '#161824'); isoBox(cx - 1, cy - 5, .22, .17, 4, '#141826', '#1d2030', '#161824'); } }
          if (p.t === 'tree') { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cx, cy, 9, 4, 0, 0, 7); g.fill(); px(cx - 1, cy - 10, 3, 10, '#2e2620'); [[0, -18, 9], [-6, -14, 6], [6, -14, 6], [0, -24, 6]].forEach(([bx, by, br]) => { g.fillStyle = '#17291f'; g.beginPath(); g.arc(cx + bx, cy + by, br, 0, 7); g.fill(); g.fillStyle = '#21392b'; g.beginPath(); g.arc(cx + bx - 1, cy + by - 1, br * .6, 0, 7); g.fill(); }); }
          if (p.t === 'leak') {
            const pulse = .6 + Math.sin(time * 2.2) * .25; const lg = g.createRadialGradient(cx, cy, 0, cx, cy, 18); lg.addColorStop(0, `rgba(255,61,242,${.35 * pulse})`); lg.addColorStop(1, 'transparent'); g.fillStyle = lg; g.fillRect(cx - 18, cy - 14, 36, 28);
            for (let i = 0; i < 14; i++) { const ph = (time * (0.22 + (i % 5) * 0.05) + i * 0.137) % 1; g.globalAlpha = (1 - ph) * .9; px(cx + Math.sin(i * 2.3 + time * 1.7) * (3 + (i % 4) * 2), cy - ph * 34, 1, 1, i % 2 ? '#ff3df2' : '#3de9ff'); } g.globalAlpha = 1;
          }
        });
      } else {
        const w = it.w, [cx, cy] = iso(w.x, w.y, 0); const fy = cy + 8;
        drawEffectsUnder(w, cx, fy, time);
        let anim = 'walk', frame = Math.floor(time / .26) % 2, mode = 'ranged';
        if (w.state === 'act') {
          const half = w.timer < 1.2 ? 0 : 1;
          if (w.act === 'meditate') { anim = 'meditate'; frame = Math.floor(w.timer / .22) % 2; }
          else if (w.act === 'reload') { anim = w.timer < .3 || w.timer > 2 ? 'idle' : 'reload'; frame = w.timer < 1.1 ? 0 : 1; }
          else if (w.act === 'throw') { anim = w.timer < .2 || w.timer > 1.4 ? 'idle' : 'action'; frame = w.timer < .5 ? 0 : 1; }
          else { anim = 'idle'; frame = Math.floor(w.timer / .6) % 2; }
        }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(cx - 5, fy - 1, 10, 3);
        g.drawImage(sprite(w.key, anim, frame, w.face, now, mode), cx - 8, fy - 22);
        drawEffectsOver(w, cx, fy, time);
      }
    }
    ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, Wd * scale, Hd * scale);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  /* ---------- botão ---------- */
  const cta = document.getElementById('cta'), granted = document.getElementById('granted');
  function start() { granted.classList.add('on'); setTimeout(() => granted.classList.remove('on'), 1600); }
  cta.addEventListener('click', start);
  window.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
})();
