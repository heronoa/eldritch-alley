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
  const usesResource = (k) => CLASSES[k].ammo || CLASSES[k].mana;
  const OUTLINE_TEAM = OUTLINE;

  function sprite(key, anim, frame, team, face, t, opts = {}) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    MODE = opts.mode || 'ranged';
    if (anim === 'meditate') {
      CLASSES[key].draw(g, 'idle', 0, team, t);
      g.fillStyle = SKIN[0]; g.fillRect(6, 6, 1, 1); g.fillRect(9, 6, 1, 1);
      g.fillStyle = SKIN[1]; g.fillRect(6, 7, 1, 1); g.fillRect(9, 7, 1, 1);
      g.fillStyle = SKIN[0]; g.fillRect(7, 13, 2, 2);
      if (frame === 1) { g.fillStyle = '#3de9ff'; g.fillRect(7, 12, 2, 1); }
    } else {
    CLASSES[key].draw(g, anim, frame, team, t);
    }
    outline(g, opts.plainOutline ? OUT : OUTLINE_TEAM[team]);
    if (opts.silhouette) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    if (face === -1) { const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d'); mg.translate(W, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0); return m; }
    return c;
  }
  // traduz a animação escolhida para (anim do desenho, modo)
  function resolve(key, a) {
    if (a === 'melee') return ['action', 'melee'];
    if (a === 'ranged') return ['action', 'ranged'];
    if (a === 'reload') return CLASSES[key].ammo ? ['reload', 'ranged'] : CLASSES[key].mana ? ['meditate', 'ranged'] : ['idle', 'ranged'];
    return [a, 'ranged'];
  }
  function blit(canvas, src, scale, x = 0, y = 0) { const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, x, y, W * scale, H * scale); }

  const DESC = {
    combatant: '<b>Forma:</b> jaqueta curta e um cano de ferro no ombro. <b>Detalhe:</b> o zíper claro. <b>Néon:</b> nenhum. <b>Leva a:</b> Sniper e Street Vendor.',
    initiate: '<b>Forma:</b> moletom com o capuz levantado. <b>Detalhe:</b> o rosto meio escondido. <b>Néon:</b> a faísca no ataque de longe. <b>Leva a:</b> Wizard.',
    adept: '<b>Forma:</b> xale sobre a cabeça e os ombros, casaco até os pés. <b>Detalhe:</b> as contas douradas. <b>Néon:</b> as mãos em ciano no ataque de longe. <b>Leva a:</b> Priest.',
    sniper: '<b>Forma:</b> casaco longo, gorro e o fuzil atravessado. <b>Detalhe:</b> o brilho na luneta. <b>Néon:</b> nenhum. <b>Única classe da v1 com munição.</b>',
    wizard: '<b>Forma:</b> gola alta em duas pontas e casaco aberto em V. <b>Detalhe:</b> o forro bordô. <b>Néon:</b> a mão erguida, só na magia.',
    priest: '<b>Forma:</b> casaco longo com as duas faixas da estola. <b>Detalhe:</b> o colarinho branco. <b>Néon:</b> as mãos em ciano, só na magia.',
    vendor: '<b>Forma:</b> mochila maior que a cabeça e boné virado. <b>Detalhe:</b> o amuleto que pisca. <b>Néon:</b> uma piscada fraca, que pode nem ser magia.'
  };
  const ORDER = ['combatant', 'initiate', 'adept', 'sniper', 'wizard', 'priest', 'vendor'];
  const cs = { anim: 'idle', team: 'ally', face: 1 };
  const cards = {};
  ORDER.forEach(key => {
    const cls = CLASSES[key];
    const card = document.createElement('article'); card.className = 'panel card';
    const frames = usesResource(key) ? 10 : 8;
    card.innerHTML = `<h4>${cls.name}</h4><p class="lean">${cls.lean}</p>
      <div class="big"><canvas class="c-big" width="${W * 8}" height="${H * 8}"></canvas><span class="note"></span></div>
      <div class="row">
        <div class="mini"><canvas class="c-sil" width="${W * 3}" height="${H * 3}"></canvas>silhueta</div>
        <div class="mini"><canvas class="c-2x" width="${W * 2}" height="${H * 2}"></canvas>2x</div>
        <div class="mini"><canvas class="c-1x" width="${W}" height="${H}"></canvas>1x</div>
      </div>
      <div class="row"><div class="mini"><canvas class="c-strip" width="${W * 2 * frames + 5 * (frames - 1)}" height="${H * 2}"></canvas>parado · andando · perto · longe${cls.ammo ? ' · recarga' : cls.mana ? ' · meditação' : ''}</div></div>
      <p class="desc">${DESC[key]}</p>`;
    document.getElementById(cls.group === 'base' ? 'grid-base' : 'grid-adv').appendChild(card);
    cards[key] = { big: card.querySelector('.c-big'), sil: card.querySelector('.c-sil'), x2: card.querySelector('.c-2x'), x1: card.querySelector('.c-1x'), strip: card.querySelector('.c-strip'), note: card.querySelector('.note') };
  });

  function bind(id, obj, key, parse, after) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
      obj[key] = parse ? parse(b.dataset.v) : b.dataset.v;
      document.querySelectorAll(`#${id} button`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      if (after) after();
    }));
  }
  bind('g-anim', cs, 'anim'); bind('g-team', cs, 'team'); bind('g-face', cs, 'face', Number);

  /* ---------- ataque e recarga ---------- */
  const ATTACKS = {
    combatant: { melee: ['Golpe com o cano', 'Um golpe curto e seco com o cano de ferro.', 'swing', '#8a8fa3'], ranged: ['Tijolo', 'Arremessa o que tiver à mão: um tijolo em arco.', 'arc', '#8a4a32'] },
    initiate: { melee: ['Golpe com o caderno', 'Bate com o caderno; a magia, ainda sem controle, escapa numa faísca no impacto.', 'swing', '#d8cdb2', '#ff3df2'], ranged: ['Faísca', 'Uma faísca pequena de néon, o cantrip ainda tímido.', 'spark', '#ff3df2'] },
    adept: { melee: ['Golpe com o rosário', 'O rosário vira um chicote curto e acende em ciano ao acertar.', 'swing', '#d9b44a', '#3de9ff'], ranged: ['Feixe de luz', 'Um feixe fraco e trêmulo de luz ciano.', 'beam', '#3de9ff'] },
    sniper: { melee: ['Tiro de pistola', 'Colado no alvo, saca a pistola e atira. Gasta munição como qualquer outro tiro.', 'pistol', '#f0d9a0'], ranged: ['Tiro de fuzil', 'Um disparo com rastro de luz quente até o alvo.', 'tracer', '#f0d9a0'] },
    wizard: { melee: ['Rajada de vento', 'Uma rajada curta de ar arcano empurra o casaco e acerta o alvo.', 'gust', '#bfe9f2'], ranged: ['Mísseis arcanos', 'O cantrip: três projéteis de néon em curva.', 'missiles', '#ff3df2'] },
    priest: { melee: ['Golpe com o livro', 'O livro de orações acende em ciano ao acertar.', 'swing', '#2a2030', '#3de9ff'], ranged: ['Raio do céu', 'Uma coluna de luz ciano cai sobre o alvo.', 'sky', '#3de9ff'] },
    vendor: { melee: ['Guarda-chuva', 'Fechado, o guarda-chuva vira porrete.', 'swing', '#3a3f55'], ranged: ['Garrafa', 'Arremessa uma garrafa em arco, que estilhaça no alvo.', 'bottle', '#3f8a5a'] }
  };
  const RELOAD = { sniper: ['Troca de pente', 'Baixa o fuzil, solta o pente vazio, encaixa o novo e puxa o ferrolho. A munição volta a 3 de 3.'] };
  ['initiate', 'wizard'].forEach(k => RELOAD[k] = ['Meditação arcana', 'Fecha os olhos e une as mãos; um círculo mágico gira no chão e partículas de néon sobem enquanto a mana volta a 3 de 3.']);
  ['adept', 'priest'].forEach(k => RELOAD[k] = ['Meditação de fé', 'Fecha os olhos e une as mãos; um feixe de luz ciano desce sobre o personagem enquanto a mana volta a 3 de 3.']);

  const ss = { cls: 'sniper', act: 'ranged', bg: 'white', speed: 1 };
  const sc = document.getElementById('s-class');
  ORDER.forEach(k => { const b = document.createElement('button'); b.dataset.v = k; b.textContent = CLASSES[k].name; if (k === ss.cls) b.setAttribute('aria-pressed', 'true'); sc.appendChild(b); });
  let start = performance.now();
  const restart = () => { start = performance.now(); info(); };
  bind('s-class', ss, 'cls', null, restart); bind('s-act', ss, 'act', null, restart); bind('s-bg', ss, 'bg', null, restart); bind('s-speed', ss, 'speed', Number, restart);
  function info() {
    const a = ATTACKS[ss.cls], r = RELOAD[ss.cls];
    document.getElementById('i-m-t').textContent = a.melee[0]; document.getElementById('i-m').textContent = a.melee[1];
    document.getElementById('i-r-t').textContent = a.ranged[0]; document.getElementById('i-r').textContent = a.ranged[1];
    document.getElementById('i-l-t').textContent = r ? r[0] : 'Não recarrega';
    document.getElementById('i-l').textContent = r ? r[1] : 'Esta classe não usa munição nem mana.';
  }

  const SW = 200, SH = 122, SC = 5;
  const stage = document.getElementById('stage'); stage.width = SW * SC; stage.height = SH * SC;
  const off = document.createElement('canvas'); off.width = SW; off.height = SH; const g = off.getContext('2d');
  function P(pts, c) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => g.lineTo(p[0], p[1])); g.closePath(); g.fillStyle = c; g.fill(); }
  function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  const cellFeet = (x) => [60 + (x - 1) * 16 + 16, 30 + (x + 1) * 8 + 8];
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t;
  function floor() {
    const white = ss.bg === 'white';
    for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) {
      const sx = 60 + (x - y) * 16 + 16, sy = 30 + (x + y) * 8;
      P([[sx, sy], [sx + 16, sy + 8], [sx, sy + 16], [sx - 16, sy + 8]], white ? ((x + y) % 2 ? '#e9e9ee' : '#f2f2f6') : ((x + y) % 2 ? '#30364a' : '#343b51'));
      if (y === 2) P([[sx - 16, sy + 8], [sx, sy + 16], [sx, sy + 22], [sx - 16, sy + 14]], white ? '#cfd0d8' : '#22283a');
      if (x === 6) P([[sx, sy + 16], [sx + 16, sy + 8], [sx + 16, sy + 14], [sx, sy + 22]], white ? '#bdbec8' : '#1a1f2e');
    }
  }
  function ammoPips(x, y, n, col = '#f0d9a0') { for (let i = 0; i < 3; i++) { px(x - 5 + i * 4, y, 3, 2, '#06070c'); if (i < n) px(x - 5 + i * 4, y, 3, 2, col); else px(x - 5 + i * 4 + 1, y, 1, 1, '#3a3f55'); } }

  function drawStage(now) {
    const t = ((now - start) * ss.speed) % 2000;
    g.clearRect(0, 0, SW, SH);
    if (ss.bg === 'white') px(0, 0, SW, SH, '#ffffff');
    else { const gr = g.createLinearGradient(0, 0, 0, SH); gr.addColorStop(0, '#121a2e'); gr.addColorStop(1, '#070a14'); g.fillStyle = gr; g.fillRect(0, 0, SW, SH); }
    floor();
    const [ax, ay] = cellFeet(0);

    if (ss.act === 'reload') {
      const [bx, by] = cellFeet(5);
      const tgt = sprite('combatant', 'idle', Math.floor(t / 600) % 2, 'enemy', -1, now);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(bx - 5, by - 1, 10, 3); g.drawImage(tgt, bx - 8, by - 22);
      const can = usesResource(ss.cls), med = !!CLASSES[ss.cls].mana;
      const r1 = can && t >= 300 && t < 760, r2 = can && t >= 760 && t < 1180;
      const anim = r1 || r2 ? (med ? 'meditate' : 'reload') : 'idle';
      const frame = med && (r1 || r2) ? Math.floor(t / 220) % 2 : r2 ? 1 : r1 ? 0 : Math.floor(t / 600) % 2;
      const arcane = ss.cls === 'initiate' || ss.cls === 'wizard', faith = ss.cls === 'adept' || ss.cls === 'priest';
      const mk = med && (r1 || r2) ? Math.min(1, (t - 300) / 200, (1180 - t) / 160) : 0;
      if (mk > 0 && arcane) {
        // círculo mágico no chão, girando
        g.globalAlpha = .9 * mk; g.strokeStyle = '#ff3df2'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(ax, ay, 12, 6, 0, 0, 7); g.stroke();
        g.strokeStyle = '#3de9ff'; g.beginPath(); g.ellipse(ax, ay, 8, 4, 0, 0, 7); g.stroke();
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t / 600; px(ax + Math.cos(a) * 10 - 0.5, ay + Math.sin(a) * 5 - 0.5, 1, 1, i % 2 ? '#ff3df2' : '#ffd0f8'); }
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 - t / 400; g.beginPath(); g.moveTo(ax + Math.cos(a) * 8, ay + Math.sin(a) * 4); g.lineTo(ax + Math.cos(a + 2.1) * 8, ay + Math.sin(a + 2.1) * 4); g.stroke(); }
        g.globalAlpha = 1;
      }
      if (mk > 0 && faith) {
        // feixe de luz descendo sobre o personagem (atrás)
        const gr = g.createLinearGradient(0, 0, 0, ay);
        gr.addColorStop(0, 'rgba(61,233,255,0)'); gr.addColorStop(1, `rgba(61,233,255,${.35 * mk})`);
        g.fillStyle = gr; g.fillRect(ax - 7, 0, 14, ay);
        g.globalAlpha = .5 * mk; g.fillStyle = '#bff6ff'; g.beginPath(); g.ellipse(ax, ay, 10, 5, 0, 0, 7); g.fill(); g.globalAlpha = 1;
      }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(ax - 5, ay - 1, 10, 3);
      g.drawImage(sprite(ss.cls, anim, frame, 'ally', 1, now), ax - 8, ay - 22);
      if (mk > 0 && faith) {
        // brilho do feixe na frente do personagem
        g.globalAlpha = .18 * mk; px(ax - 7, ay - 26, 14, 26, '#bff6ff'); g.globalAlpha = 1;
        for (let i = 0; i < 4; i++) { const ph = ((t - 300) / 700 + i * .25) % 1; g.globalAlpha = (1 - ph) * mk; px(ax - 5 + i * 3, ay - 30 + ph * 26, 1, 2, '#e8fdff'); g.globalAlpha = 1; }
      }
      if (can) {
        const n = t < 760 ? 0 : t < 1180 ? Math.min(3, 1 + Math.floor((t - 760) / 140)) : 3;
        ammoPips(ax, ay - 28, n, med ? '#3de9ff' : '#f0d9a0');
        if (med && (r1 || r2) && (ss.cls === 'initiate' || ss.cls === 'wizard')) for (let i = 0; i < 10; i++) { const ph = ((t - 300) / 900 + i * .1) % 1; g.globalAlpha = 1 - ph; px(ax - 8 + (i * 7) % 16, ay - 4 - ph * 24, 1, 1, i % 2 ? '#3de9ff' : '#ff3df2'); g.globalAlpha = 1; }
        if (!med && r1) { const k = ease((t - 380) / 320); if (k > 0 && k < 1) px(ax - 1, ay - 8 + k * 7, 2, 2, '#3a3f55'); }
        if (!med && t >= 1180 && t < 1260) { px(ax + 4, ay - 11, 1, 1, '#fff3c4'); px(ax + 6, ay - 12, 1, 1, '#fff3c4'); }
      } else {
        g.fillStyle = ss.bg === 'white' ? '#6a6f80' : '#9b937f'; g.font = '6px monospace'; g.fillText('não usa munição nem mana', ax - 30, ay - 28);
      }
    } else {
      const atk = ATTACKS[ss.cls][ss.act], kind = atk[2], col = atk[3];
      const melee = ss.act === 'melee';
      const [bx, by] = cellFeet(melee ? 1 : 5);
      const wind = t >= 250 && t < 520, strike = t >= 520 && t < 760;
      const travel = melee ? 0 : (kind === 'missiles' ? 520 : kind === 'arc' || kind === 'bottle' ? 480 : kind === 'sky' ? 300 : 140);
      const hitAt = 600 + travel, hit = t >= hitAt && t < hitAt + 260;
      const shake = hit ? (Math.floor(t / 40) % 2 ? 1 : -1) : 0;
      const tgt = sprite('combatant', 'idle', Math.floor(t / 600) % 2, 'enemy', -1, now);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(bx - 5, by - 1, 10, 3); g.drawImage(tgt, bx - 8 + shake, by - 22);
      if (hit && Math.floor(t / 60) % 2 === 0) {
        const f = document.createElement('canvas'); f.width = W; f.height = H; const fg = f.getContext('2d');
        fg.drawImage(tgt, 0, 0); fg.globalCompositeOperation = 'source-atop'; fg.fillStyle = 'rgba(255,255,255,.85)'; fg.fillRect(0, 0, W, H);
        g.drawImage(f, bx - 8 + shake, by - 22);
      }
      const anim = wind || strike ? 'action' : 'idle', frame = strike ? 1 : wind ? 0 : Math.floor(t / 600) % 2, lunge = melee && strike ? 3 : 0;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(ax - 5 + lunge, ay - 1, 10, 3);
      g.drawImage(sprite(ss.cls, anim, frame, 'ally', 1, now, { mode: ss.act }), ax - 8 + lunge, ay - 22);
      const hx = ax + 6, hy = ay - 12, cx = bx, cy = by - 12, p = ease((t - 600) / Math.max(travel, 1));
      if (melee) {
        if (strike) {
          if (kind === 'gust') { for (let i = 0; i < 6; i++) { const k = ease((t - 520 - i * 25) / 200); if (k > 0 && k < 1) { g.globalAlpha = 1 - k; px(hx + k * 16, hy - 6 + i * 2, 4, 1, col); } } g.globalAlpha = 1; }
          else if (kind === 'pistol') { px(hx + 4, hy - 1, 2, 2, '#fff3c4'); px(hx + 6, hy, 8, 1, col); }
          else {
            const r = 7; for (let a = -1.2; a <= 0.6; a += 0.3) px(cx - 4 + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 1, col);
            if (atk[4] && t >= 600) for (let i = 0; i < 6; i++) { const k = ease((t - 600) / 160); px(cx - 2 + Math.cos(i * 1.1) * k * 6, cy + Math.sin(i * 1.1) * k * 5, 1, 1, atk[4]); }
          }
        }
      } else if (t >= 600 && t < hitAt) {
        if (kind === 'tracer') { g.globalAlpha = 1 - p * .5; g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + 6, hy - 1); g.lineTo(hx + 6 + (cx - hx - 6) * p, hy - 1 + (cy - hy) * p); g.stroke(); g.globalAlpha = 1; px(hx + 8, hy - 2, 2, 2, '#fff3c4'); }
        if (kind === 'spark') { const sx = hx + (cx - hx) * p, sy = hy + (cy - hy) * p; px(sx, sy, 1, 1, col); g.globalAlpha = .5; px(sx - 2, sy, 1, 1, col); px(sx - 4, sy, 1, 1, '#3de9ff'); g.globalAlpha = 1; }
        if (kind === 'beam') { g.globalAlpha = .45 + Math.sin(t / 30) * .25; g.strokeStyle = col; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + (cx - hx) * p, hy + (cy - hy) * p); g.stroke(); g.globalAlpha = 1; }
        if (kind === 'missiles') [-14, 0, 14].forEach((o, i) => { const q = ease((t - 600 - i * 70) / (travel - 140)); if (q <= 0 || q >= 1) return; const mx = (hx + cx) / 2, my = Math.min(hy, cy) + o - 10; const x = (1 - q) * (1 - q) * hx + 2 * (1 - q) * q * mx + q * q * cx, y = (1 - q) * (1 - q) * hy + 2 * (1 - q) * q * my + q * q * cy; px(x, y, 2, 2, col); g.globalAlpha = .4; px(x - 2, y, 1, 1, col); g.globalAlpha = 1; });
        if (kind === 'arc' || kind === 'bottle') { const x = hx + (cx - hx) * p, y = hy + (cy - hy) * p - Math.sin(p * Math.PI) * 26; px(x, y, 2, 2, col); if (kind === 'bottle') px(x, y - 1, 1, 1, '#d8e8d0'); }
        if (kind === 'sky') { g.globalAlpha = .25 + p * .6; px(cx - 1, 0, 3, cy + 10, col); g.globalAlpha = 1; }
      }
      if (hit) {
        const k = ease((t - hitAt) / 260);
        if (kind === 'sky') { g.globalAlpha = 1 - k; px(cx - 2, 0, 5, cy + 10, '#bff6ff'); g.strokeStyle = col; g.beginPath(); g.ellipse(cx, by, 6 + k * 6, 3 + k * 3, 0, 0, 7); g.stroke(); g.globalAlpha = 1; }
        if (kind === 'bottle') for (let i = 0; i < 6; i++) px(cx + Math.cos(i) * k * 8, cy + Math.sin(i * 1.7) * k * 6, 1, 1, i % 2 ? col : '#d8e8d0');
        if (['spark', 'missiles', 'beam', 'gust'].includes(kind)) for (let i = 0; i < 5; i++) { g.globalAlpha = 1 - k; px(cx + Math.cos(i * 1.3) * k * 7, cy + Math.sin(i * 1.3) * k * 7, 1, 1, col); g.globalAlpha = 1; }
        if (['tracer', 'pistol', 'arc', 'swing'].includes(kind)) for (let i = 0; i < 4; i++) { g.globalAlpha = 1 - k; px(cx + Math.cos(i * 1.6) * k * 5, cy + Math.sin(i * 1.6) * k * 5, 1, 1, ss.bg === 'white' ? '#3a3f55' : '#e6dcc4'); g.globalAlpha = 1; }
      }
      if (usesResource(ss.cls)) ammoPips(ax, ay - 28, t >= 520 ? 2 : 3, CLASSES[ss.cls].mana ? '#3de9ff' : '#f0d9a0');
    }
    const c = stage.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, stage.width, stage.height); c.drawImage(off, 0, 0, SW * SC, SH * SC);
  }

  /* ---------- cena ---------- */
  const scene = document.getElementById('scene');
  const NW = 260, NH = 150, NS = 3; scene.width = NW * NS; scene.height = NH * NS;
  const nc = document.createElement('canvas'); nc.width = NW; nc.height = NH; const ng = nc.getContext('2d');
  const ms = { marks: true };
  bind('g-marks', ms, 'marks', v => v === '1');
  const HEIGHTS = [[0, 0, 1, 1, 1], [0, 0, 1, 2, 1], [0, 0, 0, 1, 1], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
  const SCENE_TEAM = { sniper: 'ally', combatant: 'ally', vendor: 'ally', wizard: 'ally', initiate: 'enemy', adept: 'enemy', priest: 'enemy' };
  const HP = { sniper: 10, combatant: 7, vendor: 9, wizard: 6, initiate: 10, adept: 8, priest: 5 };
  const PLACE = { '2,0': 'initiate', '4,0': 'priest', '4,2': 'adept', '0,2': 'sniper', '0,4': 'combatant', '2,4': 'wizard', '4,4': 'vendor' };
  function tile(x, y, h, top, left, right) {
    const sx = 130 + (x - y) * 16, sy = 34 + (x + y) * 8 - h * 8, d = (h + 1) * 8;
    const Q = (pts, c) => { ng.beginPath(); ng.moveTo(...pts[0]); pts.slice(1).forEach(p => ng.lineTo(...p)); ng.closePath(); ng.fillStyle = c; ng.fill(); };
    Q([[sx - 16, sy + 8], [sx, sy + 16], [sx, sy + 16 + d], [sx - 16, sy + 8 + d]], left);
    Q([[sx, sy + 16], [sx + 16, sy + 8], [sx + 16, sy + 8 + d], [sx, sy + 16 + d]], right);
    Q([[sx, sy], [sx + 16, sy + 8], [sx, sy + 16], [sx - 16, sy + 8]], top);
    return [sx, sy + 8];
  }
  function drawScene(now, f) {
    ng.clearRect(0, 0, NW, NH);
    const g2 = ng.createLinearGradient(0, 0, 0, NH); g2.addColorStop(0, '#121a2e'); g2.addColorStop(1, '#070a14'); ng.fillStyle = g2; ng.fillRect(0, 0, NW, NH);
    const cells = []; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) cells.push([x, y]);
    cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    cells.forEach(([x, y]) => {
      const [cx, cy] = tile(x, y, HEIGHTS[y][x], (x + y) % 2 ? '#30364a' : '#343b51', '#22283a', '#1a1f2e');
      const key = PLACE[x + ',' + y]; if (!key) return;
      const team = SCENE_TEAM[key];
      ng.fillStyle = 'rgba(0,0,0,.4)'; ng.fillRect(cx - 5, cy - 1, 10, 3);
      if (ms.marks) {
        const col = TEAM[team][0]; ng.strokeStyle = col; ng.lineWidth = 1; ng.beginPath();
        ng.moveTo(cx, cy - 6); ng.lineTo(cx + 12, cy); ng.lineTo(cx, cy + 6); ng.lineTo(cx - 12, cy); ng.closePath(); ng.stroke();
        if (team === 'enemy') { ng.fillStyle = col; [[cx, cy - 7], [cx + 13, cy], [cx, cy + 6], [cx - 13, cy]].forEach(([qx, qy]) => ng.fillRect(qx - 1, qy - 1, 3, 3)); }
      }
      ng.drawImage(sprite(key, 'idle', f, team, team === 'ally' ? 1 : -1, now, { plainOutline: !ms.marks }), cx - 8, cy - 22);
      if (ms.marks) { ng.fillStyle = '#06070c'; ng.fillRect(cx - 6, cy - 26, 12, 3); ng.fillStyle = TEAM[team][0]; ng.fillRect(cx - 5, cy - 25, HP[key], 1); }
    });
    const mg = scene.getContext('2d'); mg.imageSmoothingEnabled = false; mg.clearRect(0, 0, scene.width, scene.height); mg.drawImage(nc, 0, 0, NW * NS, NH * NS);
  }

  /* ---------- loop ---------- */
  function loop(now) {
    const speed = cs.anim === 'walk' ? 260 : cs.anim === 'idle' ? 600 : 420;
    const f = Math.floor(now / speed) % 2;
    Object.entries(cards).forEach(([key, c]) => {
      [c.big, c.sil, c.x2, c.x1, c.strip].forEach(cv => cv.getContext('2d').clearRect(0, 0, cv.width, cv.height));
      const [a, m] = resolve(key, cs.anim);
      const spr = sprite(key, a, f, cs.team, cs.face, now, { mode: m });
      blit(c.big, spr, 8); blit(c.x2, spr, 2); blit(c.x1, spr, 1);
      blit(c.sil, sprite(key, 'idle', 0, cs.team, cs.face, now, { silhouette: true }), 3);
      c.note.textContent = cs.anim === 'reload' && !usesResource(key) ? 'não usa munição nem mana' : '';
      let x = 0;
      const seq = [['idle', 'ranged'], ['walk', 'ranged'], ['action', 'melee'], ['action', 'ranged']];
      if (CLASSES[key].ammo) seq.push(['reload', 'ranged']); else if (CLASSES[key].mana) seq.push(['meditate', 'ranged']);
      seq.forEach(([an, mo]) => [0, 1].forEach(fr => { blit(c.strip, sprite(key, an, fr, cs.team, cs.face, now, { mode: mo }), 2, x, 0); x += W * 2 + 5; }));
    });
    drawStage(now);
    drawScene(now, Math.floor(now / 600) % 2);
    requestAnimationFrame(loop);
  }
  info(); requestAnimationFrame(loop);
})();
