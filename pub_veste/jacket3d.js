// Veste 3D v2 — modèle propre, coloris outdoor (vert forêt / sable / ocre). three.js r149.
// Expose : buildJacket(logoImg) -> THREE.Group (hauteur ≈ 1, centrée) ; JACKET_ANCHORS (points pour les légendes)
(function () {
  THREE.ColorManagement.legacyMode = false;
  const TAU = Math.PI * 2, P = 2.4;
  const COL = {
    body: new THREE.Color('#2f4a3a'), sand: new THREE.Color('#c9b791'), dark: new THREE.Color('#1d2420'),
    ochre: new THREE.Color('#c98b2b'), rust: new THREE.Color('#b4512a'),
  };

  // profil du torse : clés (y, demi-largeur, demi-profondeur), interpolation Catmull-Rom (pas de cassure)
  const K = [[-0.46, .250, .150], [-0.42, .252, .151], [-0.30, .246, .147], [-0.15, .240, .143], [0.0, .244, .146],
    [0.10, .252, .151], [0.17, .254, .148], [0.215, .240, .136], [0.248, .200, .120], [0.27, .150, .104], [0.285, .108, .093], [0.30, .100, .090]];
  function cr(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
  function ab(y) {
    let i = 1; while (i < K.length - 2 && y > K[i + 1][0]) i++;
    const t = Math.min(1, Math.max(0, (y - K[i][0]) / (K[i + 1][0] - K[i][0])));
    return [cr(K[i - 1][1], K[i][1], K[i + 1][1], K[i + 2][1], t), cr(K[i - 1][2], K[i][2], K[i + 1][2], K[i + 2][2], t)];
  }
  function sup(th) { const s = Math.sin(th), c = Math.cos(th); return [Math.sign(s) * Math.pow(Math.abs(s), 2 / P), Math.sign(c) * Math.pow(Math.abs(c), 2 / P)]; }
  const Y0 = -0.42, Y1 = 0.285;
  function torsoPt(y, th, out) {
    const [a, b] = ab(y), [sx, sz] = sup(th);
    const d = 1 + .010 * Math.sin(th * 2 + y * 3) * Math.cos(th) + .012 * Math.exp(-Math.pow((y - Y0 - .012) / .022, 2));
    return out.set(sx * a * d, y, sz * b * d);
  }
  const yokeY = th => 0.155 + 0.02 * Math.cos(th);

  function torsoGeo() {
    const ny = 140, nt = 180, pos = [], uv = [], col = [], idx = [], v = new THREE.Vector3();
    for (let j = 0; j <= ny; j++) {
      const y = Y0 + (Y1 - Y0) * j / ny;
      for (let i = 0; i <= nt; i++) {
        const th = TAU * i / nt; torsoPt(y, th, v); pos.push(v.x, v.y, v.z); uv.push(i / nt * 4, j / ny * 4);
        const c = y > yokeY(th) ? COL.sand : (y < Y0 + .03 ? COL.dark : COL.body);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nt; i++) { const a = j * (nt + 1) + i, b = a + nt + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function sleeveGeo(curve, radFn, colFn, segs = 110, radial = 48) {
    const frames = curve.computeFrenetFrames(segs, false), pos = [], uv = [], col = [], idx = [], p = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs; curve.getPointAt(t, p); const N = frames.normals[i], B = frames.binormals[i];
      for (let k = 0; k <= radial; k++) {
        const a = TAU * k / radial, r = radFn(t) * (1 + .015 * Math.sin(t * 18 + a) * Math.exp(-Math.pow((t - .55) / .2, 2)));
        const cx = Math.cos(a) * r, sy = Math.sin(a) * r;
        pos.push(p.x + N.x * cx + B.x * sy, p.y + N.y * cx + B.y * sy, p.z + N.z * cx + B.z * sy); uv.push(k / radial * 2, t * 5);
        const c = colFn(t); col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) { const a = i * (radial + 1) + k, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const tube = (pts, r, mat, segs = 120, closed = false) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), segs, r, 10, closed), mat);

  function fabricBump() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), d = x.createImageData(256, 256);
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 256 * 256; i++) { const px = i & 255, py = i >> 8; const v = 128 + (rnd() - .5) * 26 + (((px & 15) === 0 || (py & 15) === 0) ? 22 : 0); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); return t;
  }

  window.JACKET_ANCHORS = {};
  window.buildJacket = function (logoImg) {
    const G = new THREE.Group(), bump = fabricBump();
    const fabric = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: .72, metalness: 0, bumpMap: bump, bumpScale: .0012,
      sheen: .12, sheenColor: new THREE.Color('#e8dcc0'), sheenRoughness: .6, envMapIntensity: .55 });
    const plain = (hex, r = .7) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: r, metalness: 0, bumpMap: bump, bumpScale: .001, envMapIntensity: .55 });
    const green = plain('#2f4a3a'), dark = plain('#1d2420', .8);
    const inner = new THREE.MeshStandardMaterial({ color: new THREE.Color('#151a17'), roughness: .95, side: THREE.BackSide });
    const innerD = new THREE.MeshStandardMaterial({ color: new THREE.Color('#121614'), roughness: .95, side: THREE.DoubleSide });
    const zipM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#151917'), roughness: .4, metalness: .3 });
    const pullM = new THREE.MeshStandardMaterial({ color: COL.rust, roughness: .45, metalness: .1 });
    const seamM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22362b'), roughness: .8 });
    const seamS = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b9a985'), roughness: .8 });

    const torso = new THREE.Mesh(torsoGeo(), fabric); G.add(torso);
    const tIn = new THREE.Mesh(torso.geometry, inner); tIn.scale.set(.98, 1, .98); G.add(tIn);
    const hemCap = []; for (let i = 0; i <= 160; i++) hemCap.push(torsoPt(Y0 + .001, TAU * i / 160, new THREE.Vector3()));
    G.add(tube(hemCap, .006, dark, 200, true));
    const yk = []; for (let i = 0; i <= 160; i++) { const th = TAU * i / 160; yk.push(torsoPt(yokeY(th), th, new THREE.Vector3()).multiplyScalar(1.003)); }
    G.add(tube(yk, .0022, seamM, 240, true));
    const zp = []; for (let y = Y0 + .004; y <= Y1 + .045; y += .008) { const yy = Math.min(y, Y1); const p = torsoPt(yy, 0, new THREE.Vector3()); if (y > Y1) p.y = y; p.z += .002; zp.push(p); }
    G.add(tube(zp, .0042, zipM, 160));
    const pull = new THREE.Mesh(new THREE.BoxGeometry(.016, .034, .006), pullM); pull.position.copy(torsoPt(0.22, 0, new THREE.Vector3())).add(new THREE.Vector3(0, -.012, .008)); G.add(pull);
    const pz = []; for (let y = -0.12; y <= 0.05; y += .01) pz.push(torsoPt(y, .36 + (y - .04) * .25, new THREE.Vector3()).multiplyScalar(1.005));
    G.add(tube(pz, .0028, zipM, 60));
    const pp = new THREE.Mesh(new THREE.BoxGeometry(.01, .022, .005), pullM); pp.position.copy(pz[pz.length - 2]).multiplyScalar(1.01); pp.lookAt(pp.position.clone().multiplyScalar(2)); G.add(pp);
    for (const sg of [-1, 1]) {
      const hp = []; for (let k = 0; k <= 12; k++) hp.push(torsoPt(-0.31 + k * .016, sg * (1.0 - k * .03), new THREE.Vector3()).multiplyScalar(1.005));
      G.add(tube(hp, .0026, zipM, 40));
    }
    const rb = []; for (let i = 0; i <= 40; i++) { const th = Math.PI - .5 + i / 40; rb.push(torsoPt(-0.2, th, new THREE.Vector3()).multiplyScalar(1.004)); }
    G.add(tube(rb, .003, seamS, 60));

    const sleeves = [];
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * .17, .175, 0), new THREE.Vector3(s * .245, .145, 0), new THREE.Vector3(s * .29, .05, .012),
        new THREE.Vector3(s * .318, -.11, .03), new THREE.Vector3(s * .336, -.27, .05), new THREE.Vector3(s * .344, -.355, .058)]);
      const rad = t => .073 - t * .019;
      const colF = t => t < .2 ? COL.sand : (t > .965 ? COL.dark : COL.body);
      G.add(new THREE.Mesh(sleeveGeo(c, rad, colF), fabric));
      const p16 = c.getPointAt(.2), t16 = c.getTangentAt(.2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad(.2) * 1.005, .0022, 10, 56), seamM); ring.position.copy(p16); ring.lookAt(p16.clone().add(t16)); G.add(ring);
      const end = c.getPointAt(1), tan = c.getTangentAt(1);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(rad(1) * .98, .008, 12, 48), dark); cuff.position.copy(end); cuff.lookAt(end.clone().add(tan)); G.add(cuff);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(rad(1) * .95, 40), innerD); hole.position.copy(end).addScaledVector(tan, -.004); hole.lookAt(end.clone().add(tan)); G.add(hole);
      const tab = new THREE.Mesh(new THREE.BoxGeometry(.018, .03, .006), dark); tab.position.copy(c.getPointAt(.95)).add(new THREE.Vector3(0, 0, rad(.95) + .002)); G.add(tab);
      sleeves.push(c);
    }

    const colGeo = new THREE.CylinderGeometry(1, 1.07, 1, 72, 1, true);
    const collar = new THREE.Mesh(colGeo, green); collar.scale.set(.104, .062, .096); collar.position.set(0, .315, 0); G.add(collar);
    const collarIn = new THREE.Mesh(colGeo, inner); collarIn.scale.copy(collar.scale).multiplyScalar(.96); collarIn.position.copy(collar.position); G.add(collarIn);
    const colTop = []; for (let i = 0; i <= 80; i++) { const a = TAU * i / 80; colTop.push(new THREE.Vector3(Math.sin(a) * .104, .346, Math.cos(a) * .096)); }
    G.add(tube(colTop, .0045, green, 100, true));

    const cut = 1.0, thMax = Math.PI * .74;
    const hoodGeo = new THREE.SphereGeometry(1, 72, 54, Math.PI / 2 + cut, TAU - 2 * cut, 0, thMax);
    const hoodG = new THREE.Group(); hoodG.position.set(0, .352, -.06); hoodG.rotation.x = -.42;
    const HS = new THREE.Vector3(.128, .14, .15);
    const hood = new THREE.Mesh(hoodGeo, green); hood.scale.copy(HS); hoodG.add(hood);
    const hoodIn = new THREE.Mesh(hoodGeo, inner); hoodIn.scale.copy(HS).multiplyScalar(.965); hoodG.add(hoodIn);
    const hp = (ph, th) => new THREE.Vector3(-Math.cos(ph) * Math.sin(th) * HS.x, Math.cos(th) * HS.y, Math.sin(ph) * Math.sin(th) * HS.z);
    const rimA = [], rimB = [];
    for (let i = 0; i <= 60; i++) { const th = thMax * i / 60; rimA.push(hp(Math.PI / 2 + cut, th)); rimB.push(hp(Math.PI / 2 - cut, th)); }
    hoodG.add(tube(rimB.slice().reverse().concat(rimA.slice(1)), .0075, green, 180));
    const cord = rimA[rimA.length - 1];
    for (const sg of [-1, 1]) { const tg = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .022, 12), pullM); tg.position.set(sg * Math.abs(cord.x) * 1.02, cord.y - .02, cord.z + .01); hoodG.add(tg); }
    G.add(hoodG);

    const tex = new THREE.Texture(logoImg); tex.needsUpdate = true; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const logoM = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .5, color: new THREE.Color('#efe6d2'), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    function decal(y, th, size, name) {
      const p = torsoPt(y, th, new THREE.Vector3()), p2 = torsoPt(y, th + .01, new THREE.Vector3()), p3 = torsoPt(y + .01, th, new THREE.Vector3());
      const n = new THREE.Vector3().subVectors(p2, p).cross(new THREE.Vector3().subVectors(p3, p)).normalize(); if (n.dot(new THREE.Vector3(p.x, 0, p.z)) < 0) n.negate();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * logoImg.height / logoImg.width), logoM); m.position.copy(p).addScaledVector(n, .002); m.lookAt(p.clone().add(n)); G.add(m);
      if (name) JACKET_ANCHORS[name] = m.position.clone();
    }
    decal(0.10, .50, .046, 'logo');
    decal(0.06, Math.PI, .055);

    JACKET_ANCHORS.capuche = new THREE.Vector3(0, .5, .02);
    JACKET_ANCHORS.zip = torsoPt(-0.05, 0, new THREE.Vector3());
    JACKET_ANCHORS.poignet = sleeves[1].getPointAt(.97).clone();
    JACKET_ANCHORS.epaule = torsoPt(.19, -.9, new THREE.Vector3());
    JACKET_ANCHORS.poche = torsoPt(-0.24, -.85, new THREE.Vector3());
    for (const k in JACKET_ANCHORS) JACKET_ANCHORS[k].y -= 0.03;

    G.position.y = -0.03;
    const W = new THREE.Group(); W.add(G); return W;
  };
})();
