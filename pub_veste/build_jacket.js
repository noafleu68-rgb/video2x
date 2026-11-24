// Construit une veste réaliste par simulation de tissu (PBD) posée sur un mannequin invisible.
// Sortie : jacket_sim.js (window.JACKET_SIM). Usage : node build_jacket.js
const THREE = require('three');
const fs = require('fs');
const TAU = Math.PI * 2;

// ---------- couleurs (linéaires) ----------
const lin = h => { const c = new THREE.Color(); c.setStyle(h); return c; }; // setStyle -> linéaire (ColorManagement)
THREE.ColorManagement.legacyMode = false;
const COL = { body: lin('#34493b'), sand: lin('#c7b693'), dark: lin('#1f2622'), seam: lin('#253a2d'), zip: lin('#161a18'), lining: lin('#1a201c') };

// ---------- profil ----------
const K = [[-0.46, .250, .150], [-0.42, .252, .151], [-0.30, .246, .147], [-0.15, .240, .143], [0.0, .244, .146],
  [0.10, .252, .151], [0.17, .254, .148], [0.215, .240, .136], [0.248, .200, .120], [0.27, .150, .104], [0.285, .108, .093], [0.30, .100, .090]];
const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
function ab(y) {
  y = Math.max(K[1][0], Math.min(K[K.length - 2][0], y));
  let i = 1; while (i < K.length - 2 && y > K[i + 1][0]) i++;
  const t = (y - K[i][0]) / (K[i + 1][0] - K[i][0]);
  return [cr(K[i - 1][1], K[i][1], K[i + 1][1], K[i + 2][1], t), cr(K[i - 1][2], K[i][2], K[i + 1][2], K[i + 2][2], t)];
}
const P = 2.4;
const sup = th => { const s = Math.sin(th), c = Math.cos(th); return [Math.sign(s) * Math.pow(Math.abs(s), 2 / P), Math.sign(c) * Math.pow(Math.abs(c), 2 / P)]; };
const Y0 = -0.42, Y1 = 0.288;
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- particules / contraintes ----------
const X = [], PX = [], Wt = [], CON = []; // positions, anciennes positions, masse inverse
function addP(x, y, z, pinned) { X.push(x, y, z); PX.push(x, y, z); Wt.push(pinned ? 0 : 1); return Wt.length - 1; }
function dist(a, b) { const dx = X[a * 3] - X[b * 3], dy = X[a * 3 + 1] - X[b * 3 + 1], dz = X[a * 3 + 2] - X[b * 3 + 2]; return Math.hypot(dx, dy, dz); }
function con(a, b, k, scale = 1) { CON.push(a, b, dist(a, b) * scale, k); }
// grille (rows x cols), fermée en colonnes si wrap
function gridCons(id, rows, cols, wrap, opt) {
  const at = (j, i) => id[j * cols + ((i + cols) % cols)];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const iw = i + 1 < cols || wrap;
    if (iw) con(at(j, i), at(j, i + 1), 1, opt.hs ? opt.hs(j, i) : 1);                 // trame
    if (j + 1 < rows) con(at(j, i), at(j + 1, i), 1, opt.vs ? opt.vs(j, i) : 1);       // chaîne
    if (j + 1 < rows && iw) { con(at(j, i), at(j + 1, i + 1), .7, opt.vs ? opt.vs(j, i) : 1); con(at(j, i + 1), at(j + 1, i), .7, opt.vs ? opt.vs(j, i) : 1); }
    if (i + 2 < cols || wrap) con(at(j, i), at(j, i + 2), opt.bend, opt.hs ? opt.hs(j, i) : 1);   // flexion
    if (j + 2 < rows) con(at(j, i), at(j + 2, i), opt.bend, opt.vs ? opt.vs(j, i) : 1);
  }
}

// ---------- mannequin (collisions) ----------
const SH = s => new THREE.Vector3(s * .2, .165, 0), EL = s => new THREE.Vector3(s * .375, -.045, .03), WR = s => new THREE.Vector3(s * .46, -.285, .06);
const caps = [];
for (const s of [-1, 1]) { caps.push([SH(s), EL(s), .052, .046]); caps.push([EL(s), WR(s), .046, .04]); }
function collide(i, inflate, noArms) {
  let x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2];
  const m = .007 + inflate;
  // torse
  if (y > -0.62 && y < 0.275) {
    let [a, b] = ab(Math.min(y, .27)); a = a * .93 + m; b = b * .92 + m;
    if (y < -0.30) { a = a; b = b; }
    const r = Math.hypot(x / a, z / b);
    if (r < 1 && r > 1e-6) { x /= r; z /= r; }
  }
  // cou
  if (y > .25 && y < .42) { const a = .08 + m, b = .074 + m, r = Math.hypot(x / a, z / b); if (r < 1 && r > 1e-6) { x /= r; z /= r; } }
  // épaules (dessus) : empêche de traverser le haut du torse
  if (y > .2 && y < .3) { const [a, b] = ab(.2); if (Math.hypot(x / (a * .93), z / (b * .92)) < 1) { const yTop = .2 + (.275 - .2) * (1 - Math.min(1, Math.hypot(x / (a * .93), z / (b * .92)))) * 0; } }
  // bras
  const p = new THREE.Vector3(x, y, z);
  if (!noArms) for (const [A, B, ra, rb] of caps) {
    const ab_ = B.clone().sub(A), t = Math.max(0, Math.min(1, p.clone().sub(A).dot(ab_) / ab_.lengthSq()));
    const q = A.clone().addScaledVector(ab_, t), d = p.distanceTo(q), rr = ra + (rb - ra) * t + m;
    if (d < rr && d > 1e-6) { const off = p.clone().sub(q).multiplyScalar(rr / d); p.copy(q).add(off); }
  }
  X[i * 3] = p.x; X[i * 3 + 1] = p.y; X[i * 3 + 2] = p.z;
}

// ---------- torse ----------
const TR = 118, TC = 168, torso = [];
for (let j = 0; j < TR; j++) {
  const y = Y0 + (Y1 - Y0) * j / (TR - 1);
  for (let i = 0; i < TC; i++) {
    const th = TAU * i / TC, [a, b] = ab(y), [sx, sz] = sup(th), n = 1 + (rnd() - .5) * .012;
    torso.push(addP(sx * a * 1.02 * n, y, sz * b * 1.03 * n, j === TR - 1));
  }
}
gridCons(torso, TR, TC, true, {
  bend: .22,
  hs: (j) => { const y = Y0 + (Y1 - Y0) * j / (TR - 1); return y < -0.36 ? 1 - (-.36 - y) / .06 * .09 : 1; },  // cordon de serrage à l'ourlet
  vs: () => 1.0,
});
// ---------- manches ----------
const SR = 120, SCOLS = 44, sleeves = [], sleeveCurves = [];
for (const s of [-1, 1]) {
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(s * .17, .178, 0), SH(s).add(new THREE.Vector3(s * .05, -.03, 0)), EL(s), WR(s).add(new THREE.Vector3(0, -.012, .002))]);
  sleeveCurves.push(c);
  const fr = c.computeFrenetFrames(SR - 1, false), ids = [];
  for (let j = 0; j < SR; j++) {
    const t = j / (SR - 1), p = c.getPointAt(t), N = fr.normals[j], B = fr.binormals[j];
    const r = j === SR - 1 ? .049 : .074 - t * .014;
    for (let i = 0; i < SCOLS; i++) {
      const a = TAU * i / SCOLS, rr = r * (1 + (rnd() - .5) * .03);
      ids.push(addP(p.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * rr, p.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * rr, p.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * rr, j === 0 || j === SR - 1));
    }
  }
  // longueur au repos +11 % : le tissu en trop se fronce (coude, poignet)
  gridCons(ids, SR, SCOLS, true, { bend: .4, vs: (j) => { const t = j / (SR - 1); return 1.025 + .07 * Math.exp(-Math.pow((t - .86) / .1, 2)) + .035 * Math.exp(-Math.pow((t - .5) / .09, 2)); } });
  sleeves.push(ids);
}
// ---------- capuche baissée (posée sur le dos) ----------
const HR = 46, HC = 70, hood = [], cut = 1.0, thMax = Math.PI * .74;
const HS = new THREE.Vector3(.12, .125, .13), hPivot = new THREE.Vector3(0, .3, -.085);
const hRot = new THREE.Matrix4().makeRotationX(2.05);
for (let j = 0; j < HR; j++) {
  const th = thMax * j / (HR - 1);
  for (let i = 0; i < HC; i++) {
    const ph = Math.PI / 2 + cut + (TAU - 2 * cut) * i / (HC - 1);
    const v = new THREE.Vector3(-Math.cos(ph) * Math.sin(th) * HS.x, Math.cos(th) * HS.y, Math.sin(ph) * Math.sin(th) * HS.z);
    v.add(new THREE.Vector3(0, .07, .02)).applyMatrix4(hRot).add(hPivot);
    hood.push(addP(v.x, v.y, v.z, j === HR - 1));
  }
}
gridCons(hood, HR, HC, false, { bend: .3 });

// ---------- ancrages anti-étirement (LRA) ----------
const LRA = []; // [particule, ancre, distance max]
for (let j = 0; j < TR - 1; j++) for (let i = 0; i < TC; i++) { const p = torso[j * TC + i], q = torso[(TR - 1) * TC + i]; LRA.push(p, q, dist(p, q) * 1.015); }
for (const ids of sleeves) for (let j = 1; j < SR - 1; j++) for (let i = 0; i < SCOLS; i++) {
  const p = ids[j * SCOLS + i], a0 = ids[i], a1 = ids[(SR - 1) * SCOLS + i];
  LRA.push(p, a0, dist(p, a0) * 1.04); LRA.push(p, a1, dist(p, a1) * 1.06);
}
for (let j = 0; j < HR - 1; j++) for (let i = 0; i < HC; i++) { const p = hood[j * HC + i], q = hood[(HR - 1) * HC + i]; LRA.push(p, q, dist(p, q) * 1.02); }
function solveLRA() {
  for (let k = 0; k < LRA.length; k += 3) {
    const p = LRA[k], q = LRA[k + 1], md = LRA[k + 2]; if (!Wt[p]) continue;
    const dx = X[p * 3] - X[q * 3], dy = X[p * 3 + 1] - X[q * 3 + 1], dz = X[p * 3 + 2] - X[q * 3 + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > md) { const f = md / d; X[p * 3] = X[q * 3] + dx * f; X[p * 3 + 1] = X[q * 3 + 1] + dy * f; X[p * 3 + 2] = X[q * 3 + 2] + dz * f; }
  }
}
// ---------- simulation ----------
const N = Wt.length, NC = CON.length / 4;
console.log('particules', N, 'contraintes', NC);
const g = -2.2, dt = 1 / 60, STEPS = 260, IT = 10;
const isHood = new Uint8Array(N); hood.forEach(i => isHood[i] = 1); const isTorso = new Uint8Array(N); torso.forEach(i => isTorso[i] = 1);
for (let st = 0; st < STEPS; st++) {
  const damp = st < 200 ? .96 : .9;
  for (let i = 0; i < N; i++) {
    if (!Wt[i]) continue;
    for (let k = 0; k < 3; k++) { const o = i * 3 + k, v = (X[o] - PX[o]) * damp; PX[o] = X[o]; X[o] += v + (k === 1 ? g * dt * dt : 0); }
  }
  for (let it = 0; it < IT; it++) {
    for (let c = 0; c < NC; c++) {
      const a = CON[c * 4], b = CON[c * 4 + 1], rest = CON[c * 4 + 2], k = CON[c * 4 + 3];
      const wa = Wt[a], wb = Wt[b], w = wa + wb; if (!w) continue;
      const ax = a * 3, bx = b * 3, dx = X[bx] - X[ax], dy = X[bx + 1] - X[ax + 1], dz = X[bx + 2] - X[ax + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      // tissu : résiste fort à l'étirement, peu à la compression (=> plis)
      let diff = (d - rest) / d; if (diff < 0) diff *= .35;
      const s = diff * k / w;
      X[ax] += dx * s * wa; X[ax + 1] += dy * s * wa; X[ax + 2] += dz * s * wa;
      X[bx] -= dx * s * wb; X[bx + 1] -= dy * s * wb; X[bx + 2] -= dz * s * wb;
    }
    solveLRA();
    for (let i = 0; i < N; i++) if (Wt[i]) collide(i, isHood[i] ? .03 : 0, isTorso[i]);
  }
  if (st % 50 === 0) console.log('pas', st);
}

// ---------- lissage (supprime les micro-plis d'un seul point) ----------
function smoothGrid(ids, rows, cols, wrap, passes, f) {
  for (let p = 0; p < passes; p++) { const o = Float64Array.from(X);
    for (let j = 1; j < rows - 1; j++) for (let i = 0; i < cols; i++) {
      if (!wrap && (i === 0 || i === cols - 1)) continue; const id = ids[j * cols + i]; if (!Wt[id]) continue;
      const nb = [ids[(j - 1) * cols + i], ids[(j + 1) * cols + i], ids[j * cols + (i + 1) % cols], ids[j * cols + (i - 1 + cols) % cols]];
      for (let k = 0; k < 3; k++) { let m = 0; for (const n of nb) m += o[n * 3 + k]; X[id * 3 + k] = o[id * 3 + k] * (1 - f) + m / 4 * f; } } }
}
smoothGrid(torso, TR, TC, true, 3, .5); sleeves.forEach(ids => smoothGrid(ids, SR, SCOLS, true, 2, .5)); smoothGrid(hood, HR, HC, false, 2, .5);
// ---------- export ----------
function meshFromGrid(ids, rows, cols, wrap, colorFn, flip) {
  const C = wrap ? cols + 1 : cols, pos = [], col = [], uv = [], idx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < C; i++) {
    const id = ids[j * cols + (i % cols)];
    pos.push(X[id * 3], X[id * 3 + 1], X[id * 3 + 2]);
    const c = colorFn(j, i % cols); col.push(c.r, c.g, c.b); uv.push(i / (C - 1) * 4, j / (rows - 1) * 4);
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < C - 1; i++) {
    const a = j * C + i, b = a + C;
    if (flip) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return { pos, col, uv, idx, rows, C };
}
const yOf = j => Y0 + (Y1 - Y0) * j / (TR - 1);
const yokeY = th => 0.155 + 0.02 * Math.cos(th);
function near(a, b, tol) { return Math.abs(a - b) < tol; }
function angDist(a, b) { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; }
// zips de poches en coordonnées (y, th)
const pocketLines = [
  { f: y => .36 + (y - .04) * .25, y0: -0.12, y1: 0.05 },                   // poitrine
  { f: y => 1.0 - (y + .31) / .016 * .03, y0: -0.31, y1: -0.118 },           // main droite
  { f: y => -(1.0 - (y + .31) / .016 * .03), y0: -0.31, y1: -0.118 },        // main gauche
];
const torsoMesh = meshFromGrid(torso, TR, TC, true, (j, i) => {
  const y = yOf(j), th = TAU * i / TC, thS = th > Math.PI ? th - TAU : th;
  if (angDist(th, 0) < TAU / TC * .9 && y < Y1) return COL.zip;
  const yk = yokeY(th);
  if (Math.abs(y - yk) < .0035) return COL.seam;
  if (y > yk) return COL.sand;
  if (y < Y0 + .028) return COL.dark;
  if (Math.abs(y + .2) < .003 && angDist(th, Math.PI) < .5) return lin('#b9a985'); // bande réfléchissante
  return COL.body;
}, false);
const sleeveMeshes = sleeves.map(ids => meshFromGrid(ids, SR, SCOLS, true, (j) => { const t = j / (SR - 1); return t < .2 ? (t > .195 ? COL.seam : COL.sand) : (t > .955 ? COL.dark : COL.body); }, false));
// capuche : couture centrale
const hoodMesh = meshFromGrid(hood, HR, HC, false, (j, i) => Math.abs(i - (HC - 1) / 2) < .6 ? COL.seam : COL.body, true);

// normales + occlusion ambiante approximative (grille d'occupation)
const all = [torsoMesh, ...sleeveMeshes, hoodMesh];
const cell = .006, occ = new Map(), key = (x, y, z) => ((Math.floor(x / cell) + 512) * 1024 + (Math.floor(y / cell) + 512)) * 1024 + (Math.floor(z / cell) + 512);
for (const m of all) for (let i = 0; i < m.pos.length; i += 3) occ.set(key(m.pos[i], m.pos[i + 1], m.pos[i + 2]), 1);
const dirs = []; for (let k = 0; k < 26; k++) { const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); if (v.length() > 1 || v.length() < .1) { k--; continue; } dirs.push(v.normalize()); }
for (const m of all) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3)); geo.setIndex(m.idx); geo.computeVertexNormals();
  const nr = geo.attributes.normal.array;
  for (let v = 0; v < m.pos.length / 3; v++) {
    const n = new THREE.Vector3(nr[v * 3], nr[v * 3 + 1], nr[v * 3 + 2]); let hit = 0, tot = 0;
    for (const d0 of dirs) {
      const d = d0.dot(n) < 0 ? d0.clone().negate() : d0; tot++;
      for (const s of [.014, .024, .038, .06]) { if (occ.has(key(m.pos[v * 3] + d.x * s, m.pos[v * 3 + 1] + d.y * s, m.pos[v * 3 + 2] + d.z * s))) { hit += 1.2 - s * 6; break; } }
    }
    m.ao = m.ao || new Float32Array(m.pos.length / 3); m.ao[v] = 1 - hit / tot;
  }
  // flou de l'occlusion sur la grille (supprime le bruit)
  for (let pass = 0; pass < 5; pass++) { const o = Float32Array.from(m.ao);
    for (let j = 0; j < m.rows; j++) for (let i = 0; i < m.C; i++) { let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj, ii = i + di; if (jj < 0 || jj >= m.rows || ii < 0 || ii >= m.C) continue; s += o[jj * m.C + ii]; n++; }
      m.ao[j * m.C + i] = s / n; } }
  for (let v = 0; v < m.ao.length; v++) { const ao = Math.max(.45, Math.min(1, .25 + m.ao[v] * .95)); for (let k = 0; k < 3; k++) m.col[v * 3 + k] *= ao; }
  delete m.ao;
}

// détails : trajets (points déformés) pour zips/coutures en relief, tirettes, logos
const P3 = id => [X[id * 3], X[id * 3 + 1], X[id * 3 + 2]];
const tAt = (j, i) => torso[j * TC + ((i % TC) + TC) % TC];
function normalAt(j, i) {
  const p = new THREE.Vector3(...P3(tAt(j, i))), a = new THREE.Vector3(...P3(tAt(j, i + 1))), b = new THREE.Vector3(...P3(tAt(Math.min(TR - 1, j + 1), i)));
  const n = a.sub(p).cross(b.sub(p)).normalize(); if (n.dot(new THREE.Vector3(p.x, 0, p.z)) < 0) n.negate(); return n.toArray();
}
const jOf = y => Math.round((y - Y0) / (Y1 - Y0) * (TR - 1)), iOf = th => Math.round(((th % TAU) + TAU) % TAU / TAU * TC);
const zipPath = []; for (let j = 0; j < TR; j += 2) zipPath.push(P3(tAt(j, 0)));
const hemRing = []; for (let i = 0; i <= TC; i += 2) hemRing.push(P3(tAt(0, i)));
const cuffRings = sleeves.map(ids => { const r = []; for (let i = 0; i <= SCOLS; i++) r.push(P3(ids[(SR - 1) * SCOLS + (i % SCOLS)])); return r; });
function surfAt(y, th) {
  const fj = (y - Y0) / (Y1 - Y0) * (TR - 1), fi = (((th % TAU) + TAU) % TAU) / TAU * TC;
  const j0 = Math.max(0, Math.min(TR - 2, Math.floor(fj))), i0 = Math.floor(fi), tj = fj - j0, ti = fi - i0;
  const q = (j, i) => new THREE.Vector3(...P3(tAt(j, i)));
  const p = q(j0, i0).multiplyScalar((1 - tj) * (1 - ti)).add(q(j0, i0 + 1).multiplyScalar((1 - tj) * ti)).add(q(j0 + 1, i0).multiplyScalar(tj * (1 - ti))).add(q(j0 + 1, i0 + 1).multiplyScalar(tj * ti));
  const n = new THREE.Vector3(...normalAt(Math.round(fj), Math.round(fi)));
  return p.addScaledVector(n, .0025).toArray();
}
const pocketPaths = pocketLines.map(L => { const r = []; for (let k = 0; k <= 24; k++) { const y = L.y0 + (L.y1 - L.y0) * k / 24; r.push(surfAt(y, L.f(y))); } return r; });
const zipSmooth = []; for (let k = 0; k <= 120; k++) { const y = Y0 + .004 + (Y1 - Y0 - .006) * k / 120; zipSmooth.push(surfAt(y, 0)); }
const det = {
  zip: zipSmooth, pockets: pocketPaths, hem: hemRing, cuffs: cuffRings,
  pulls: [[jOf(.22), 0], [jOf(.045), iOf(.36 + .005 * .25)], [jOf(-.125), iOf(1.0 - (.185 / .016) * .03)], [jOf(-.125), iOf(-(1.0 - (.185 / .016) * .03))]].map(([j, i]) => ({ p: P3(tAt(j, i)), n: normalAt(j, i) })),
  logo: { p: P3(tAt(jOf(.105), iOf(.52))), n: normalAt(jOf(.105), iOf(.52)) },
  logoBack: { p: P3(tAt(jOf(-.02), iOf(Math.PI))), n: normalAt(jOf(-.02), iOf(Math.PI)) },
  anchors: {
    capuche: P3(hood[Math.round(HR * .3) * HC + Math.round(HC / 2)]), zip: P3(tAt(jOf(-.05), 0)),
    poignet: P3(sleeves[1][(SR - 3) * SCOLS + 10]), poche: P3(tAt(jOf(-.22), iOf(-.85))),
  },
};
const round = a => a.map(v => Math.round(v * 1e5) / 1e5);
const out = { meshes: [{ name: 'torse', ...torsoMesh }, { name: 'manche', ...sleeveMeshes[0] }, { name: 'manche', ...sleeveMeshes[1] }, { name: 'capuche', ...hoodMesh, lining: true }], details: det };
for (const m of out.meshes) { delete m.rows; delete m.C; m.pos = round(m.pos); m.col = round(m.col); m.uv = round(m.uv); }
fs.writeFileSync(__dirname + '/jacket_sim.js', 'window.JACKET_SIM=' + JSON.stringify(out) + ';');
console.log('ok', (fs.statSync(__dirname + '/jacket_sim.js').size / 1e6).toFixed(1), 'Mo');
