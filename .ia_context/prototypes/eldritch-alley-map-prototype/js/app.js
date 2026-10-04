/* Isometric renderer and HUD for the map prototype. Reads window.EA_DATA from data.js. */
(function () {
  const { C, TILE, MAPS, SPR } = window.EA_DATA;


  const cvs = document.getElementById('map'), ctx = cvs.getContext('2d');
  const off = document.createElement('canvas'), g = off.getContext('2d');
  const TW = 32, TH = 16, HZ = 8, N = 10;
  const MAPW = 340, MAPH = 250;
  let M, key, H, T, units, selected, propAt, blocked, hover = null, OX = 0, OY = 0, scale = 1, t0 = performance.now();

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

  function load(k) {
    key = k; M = MAPS[k];
    H = []; T = [];
    for (let y = 0; y < N; y++) {
      H.push([]); T.push([]);
      for (let x = 0; x < N; x++) {
        const t = M.tiles[y][x]; T[y].push(t);
        let h = 0;
        if (M.hmap) h = M.hmap[y][x];
        else if (M.h) h = M.h(x, y, t);
        else if (t === 'B') h = M.heights.B[(x * 3 + y * 7) % M.heights.B.length];
        else if (M.heights[t] !== undefined) h = M.heights[t];
        H[y].push(h);
      }
    }
    (M.hill || []).forEach(([x, y, d]) => H[y][x] += d);
    propAt = {}; M.props.forEach(p => { if (p.x !== undefined) (propAt[p.x + ',' + p.y] = propAt[p.x + ',' + p.y] || []).push(p); });
    const BLOCKING = ['car', 'dumpster', 'tree', 'fountain', 'tower', 'crates', 'ac', 'kiosk', 'chimney', 'moto'];
    blocked = (x, y) => ['B', 'w', 'v', 'h', 'f'].includes(T[y][x]) || (propAt[x + ',' + y] || []).some(p => BLOCKING.includes(p.t));
    units = M.units.map(([id, cls, team, x, y]) => ({ id, cls, team, x, y }));
    selected = units[0];
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
    if (key === 'street') {
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
        isoBox(cx, cy, .42, .2, 5, p.c, shade(p.c, -.3), shade(p.c, -.45));
        isoBox(cx - 1, cy - 5, .22, .17, 4, '#141826', shade(p.c, -.2), shade(p.c, -.35));
        px(cx + 9, cy + 2, 2, 1, 'rgba(240,217,160,.8)');
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

  /* ---------- render ---------- */
  let view = { dx: 0, dy: 0, s: 1, dpr: 1 };
  function render(now) {
    const time = (now - t0) / 1000, dpr = window.devicePixelRatio || 1;
    const CW = cvs.clientWidth * dpr, CH = cvs.clientHeight * dpr;
    if (cvs.width !== CW || cvs.height !== CH) { cvs.width = CW; cvs.height = CH; }
    const fit = Math.min(CW / MAPW, CH / (MAPH * 1.05));
    scale = fit >= 2 ? Math.floor(fit) : fit;
    const W = Math.ceil(CW / scale), Hh = Math.ceil(CH / scale);
    if (off.width !== W || off.height !== Hh) { off.width = W; off.height = Hh; }
    OX = Math.round(W / 2); OY = Math.round((Hh - MAPH) / 2) + 66 + (M.lift || 0);
    g.imageSmoothingEnabled = false;

    drawSky(W, Hh, time);

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
      if (t === 'B') { building(x, y, sx, sy, h); continue; }
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
      if (t === 'z') { for (let k = -8; k <= 8; k += 4) poly([[sx + k - 1, sy + 8 + k / 2 - 4], [sx + k + 1, sy + 8 + k / 2 - 3], [sx + k + 1, sy + 8 + k / 2 + 3], [sx + k - 1, sy + 8 + k / 2 + 2]], 'rgba(230,220,196,.45)'); }
      else if (t === 'a') {
        if (M.center !== undefined) {
          const Sx = sx, Sy = sy + TH, Wx = sx - TW / 2, Wy = sy + TH / 2, Ex = sx + TW / 2, Ey = sy + TH / 2;
          if (y === M.center && x % 2 === 0) { g.strokeStyle = 'rgba(217,180,74,.75)'; g.beginPath(); g.moveTo(Wx + 4, Wy + 2); g.lineTo(Sx - 4, Sy - 2); g.stroke(); }
          if (y === M.center) { g.strokeStyle = 'rgba(230,220,196,.35)'; g.beginPath(); g.moveTo(sx + 2, sy + 2); g.lineTo(Ex - 2, Ey); g.stroke(); }
          if (y === M.center + 1) { g.strokeStyle = 'rgba(230,220,196,.35)'; g.beginPath(); g.moveTo(Wx + 2, Wy); g.lineTo(Sx - 2, Sy - 2); g.stroke(); }
        }
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
        if (y < N - 1 && T[y + 1][x] === 'a') { g.beginPath(); g.moveTo(Wv[0], Wv[1]); g.lineTo(S[0], S[1]); g.stroke(); }
        if (y > 0 && T[y - 1][x] === 'a') { g.beginPath(); g.moveTo(Nn[0], Nn[1]); g.lineTo(E[0], E[1]); g.stroke(); }
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
        const bob = u === selected ? Math.round(Math.sin(time * 4)) : 0;
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(cx - 5, cy - 1, 10, 3);
        drawSprite(g, u.cls, u.team, cx - 7, cy - 15 + bob);
        if (u === selected) { const ay = sy - 14 + Math.round(Math.sin(time * 4) * 1.5); px(cx - 1, ay, 3, 2, '#6f95d6'); px(cx, ay + 2, 1, 1, '#6f95d6'); }
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

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, Math.round(W * scale), Math.round(Hh * scale));
    view = { s: scale, dpr };
    requestAnimationFrame(render);
  }

  cvs.addEventListener('mousemove', (e) => {
    const lx = e.offsetX * view.dpr / view.s, ly = e.offsetY * view.dpr / view.s;
    let found = null;
    for (let y = N - 1; y >= 0 && !found; y--) for (let x = N - 1; x >= 0 && !found; x--) {
      const [sx, sy] = iso(x, y, H[y][x]);
      if (Math.abs(lx - sx) / (TW / 2) + Math.abs(ly - (sy + TH / 2)) / (TH / 2) <= 1) found = { x, y };
    }
    hover = found;
    const el = document.getElementById('cell');
    if (!found) { el.innerHTML = 'Célula <b>—</b>'; return; }
    const ps = (propAt[found.x + ',' + found.y] || []).map(p => ({ lamp: 'poste', car: 'carro (cobertura)', dumpster: 'caçamba (cobertura)', crates: 'caixas (cobertura)', tree: 'árvore (cobertura)', bench: 'banco', fountain: 'chafariz', tower: "caixa d'água", ac: 'ar-condicionado (cobertura)', skylight: 'claraboia', vent: 'exaustor', antenna: 'antena', leak: 'vazamento esotérico', tape: 'isolamento', puddle: 'poça', manhole: 'bueiro', flyers: 'avisos oficiais', hydrant: 'hidrante', bags: 'sacos de lixo', bush: 'arbusto', pole: 'poste de fiação', moto: 'moto (cobertura)', cones: 'cones', kiosk: 'banca de jornal (cobertura)', busstop: 'ponto de ônibus', duct: 'duto', dish: 'antena parabólica', chimney: 'chaminé (cobertura)', line: 'varal', chalk: 'círculo de giz' }[p.t])).filter(Boolean);
    el.innerHTML = `Célula <b>${'ABCDEFGHIJ'[found.x]}${found.y + 1}</b> · ${TILE[T[found.y][found.x]].name} · altura <b>${H[found.y][found.x]}</b>` + (ps.length ? `<br>${ps.join(', ')}` : '');
  });

  function portrait(canvas, cls, team) { canvas.width = 14; canvas.height = 17; const c = canvas.getContext('2d'); c.clearRect(0, 0, 14, 17); drawSprite(c, cls, team, 0, 1); }
  function renderHud() {
    portrait(document.getElementById('u-portrait'), 'S', 'ally');
    const turn = document.getElementById('turn'); turn.querySelectorAll('.portrait').forEach(p => p.remove());
    ['aS', 'eS', 'aW', 'eW', 'aP', 'eP'].forEach((id, i) => {
      const u = units.find(u => u.id === id), d = document.createElement('div');
      d.className = `portrait ${u.team}` + (i === 0 ? ' current' : '');
      const cv = document.createElement('canvas'); d.appendChild(cv); turn.appendChild(d); portrait(cv, u.cls, u.team);
    });
  }

  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => load(b.dataset.m)));
  load('street');
  requestAnimationFrame(render);
})();
