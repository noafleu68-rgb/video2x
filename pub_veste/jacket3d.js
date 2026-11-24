// Veste 3D modélisée à la main (three.js r149) — hauteur ≈ 1 unité, centrée sur l'origine.
// Expose : buildJacket(logoImg) -> THREE.Group ; setupLights(scene, renderer)
(function () {
  THREE.ColorManagement.legacyMode = false;
  const TAU = Math.PI * 2;
  const P = 2.6; // exposant de la super-ellipse (section du torse un peu « carrée »)

  // ---------- profil du torse ----------
  // half-width a(y), half-depth b(y) ; y de -0.42 (bas) à 0.285 (encolure)
  const prof = [
    [-0.42, 0.252, 0.150], [-0.36, 0.247, 0.146], [-0.2, 0.238, 0.140], [-0.05, 0.240, 0.142],
    [0.08, 0.252, 0.152], [0.16, 0.256, 0.150], [0.205, 0.245, 0.138], [0.235, 0.215, 0.124],
    [0.258, 0.170, 0.110], [0.274, 0.125, 0.098], [0.285, 0.105, 0.092],
  ];
  function ab(y) {
    if (y <= prof[0][0]) return [prof[0][1], prof[0][2]];
    for (let i = 0; i < prof.length - 1; i++) {
      const p0 = prof[i], p1 = prof[i + 1];
      if (y <= p1[0]) {
        let k = (y - p0[0]) / (p1[0] - p0[0]); k = k * k * (3 - 2 * k);
        return [p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k];
      }
    }
    const l = prof[prof.length - 1]; return [l[1], l[2]];
  }
  // point sur la surface du torse à l'angle th (0 = devant, +z)
  function sup(th) { // super-ellipse
    const s = Math.sin(th), c = Math.cos(th);
    return [Math.sign(s) * Math.pow(Math.abs(s), 2 / P), Math.sign(c) * Math.pow(Math.abs(c), 2 / P)];
  }
  function torsoPt(y, th, out) {
    const [a, b] = ab(y), [sx, sz] = sup(th);
    // plis verticaux légers + plis horizontaux à la taille
    const fold = 0.0035 * Math.sin(th * 9 + y * 6) + 0.003 * Math.sin(th * 23 - y * 11)
      + 0.004 * Math.exp(-Math.pow((y + 0.12) / 0.06, 2)) * Math.sin(th * 14 + 1.3)
      + 0.006 * Math.exp(-Math.pow((y + 0.40) / 0.03, 2));       // bourrelet de l'ourlet
    const r = 1 + fold * 1.3;
    out.set(sx * a * r, y, sz * b * r);
    return out;
  }
  function torsoGeo() {
    const ny = 120, nt = 160, pos = [], uv = [], idx = [], v = new THREE.Vector3();
    for (let j = 0; j <= ny; j++) {
      const y = -0.42 + (0.285 + 0.42) * j / ny;
      for (let i = 0; i <= nt; i++) {
        const th = TAU * i / nt;
        torsoPt(y, th, v); pos.push(v.x, v.y, v.z); uv.push(i / nt * 3, j / ny * 3);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nt; i++) {
      const a = j * (nt + 1) + i, b = a + nt + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  // ---------- tube à rayon variable le long d'une courbe ----------
  function varTube(curve, radFn, segs = 90, radial = 40, wrinkle = 0) {
    const frames = curve.computeFrenetFrames(segs, false), pos = [], uv = [], idx = [];
    const p = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs; curve.getPointAt(t, p);
      const N = frames.normals[i], B = frames.binormals[i];
      for (let k = 0; k <= radial; k++) {
        const a = TAU * k / radial;
        let r = radFn(t, a);
        if (wrinkle) r *= 1 + wrinkle * (Math.sin(t * 48 + Math.sin(a * 3) * 1.5) * Math.exp(-Math.pow((t - .55) / .18, 2)) + .4 * Math.sin(a * 7 + t * 20));
        const cx = Math.cos(a) * r, sy = Math.sin(a) * r;
        pos.push(p.x + N.x * cx + B.x * sy, p.y + N.y * cx + B.y * sy, p.z + N.z * cx + B.z * sy);
        uv.push(k / radial * 2, t * 4);
      }
    }
    for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const line = (pts, r, mat, segs = 80) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 8, false), mat);

  // ---------- textures procédurales ----------
  function fabricBump() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d'), d = x.createImageData(512, 512);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 512 * 512; i++) {
      const px = i % 512, py = (i / 512) | 0;
      const rip = ((px % 16 < 1) || (py % 16 < 1)) ? 40 : 0;     // ripstop
      const v = 128 + (rnd() - .5) * 50 + rip;
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t;
  }

  window.buildJacket = function (logoImg) {
    const G = new THREE.Group();
    const bump = fabricBump();
    const fabric = new THREE.MeshPhysicalMaterial({
      color: 0x0e0f11, roughness: .58, metalness: 0, bumpMap: bump, bumpScale: .0018,
      envMapIntensity: .28, sheen: .25, sheenColor: new THREE.Color(0x2a3240), sheenRoughness: .5, clearcoat: .06, clearcoatRoughness: .6,
    });
    const fabric2 = fabric.clone(); fabric2.color = new THREE.Color(0x0a0b0c); // bandes / poignets
    const inner = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: .9, side: THREE.BackSide });
    const innerD = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: .95, side: THREE.DoubleSide });
    const zipM = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: .35, metalness: .6 });
    const pullM = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: .3, metalness: .9 });
    const seamM = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: .7 });

    // torse
    const torso = new THREE.Mesh(torsoGeo(), fabric); G.add(torso);
    const tIn = new THREE.Mesh(torso.geometry, inner); tIn.scale.set(.985, 1, .985); G.add(tIn);
    // ourlet
    const hem = []; for (let i = 0; i <= 120; i++) hem.push(torsoPt(-0.415, TAU * i / 120, new THREE.Vector3()).multiplyScalar(1.004));
    G.add(line(hem, .007, fabric2, 200));
    // zip central + coutures
    const zp = []; for (let y = -0.41; y <= 0.283; y += 0.01) zp.push(torsoPt(y, 0, new THREE.Vector3()).add(new THREE.Vector3(0, 0, .002)));
    G.add(line(zp, .0045, zipM, 140));
    const pull = new THREE.Mesh(new THREE.BoxGeometry(.014, .03, .006), pullM);
    pull.position.copy(torsoPt(0.235, 0, new THREE.Vector3())).add(new THREE.Vector3(0, -.01, .009)); G.add(pull);
    // poche poitrine (zip vertical) + poches mains (zips obliques)
    const pz = []; for (let y = -0.06; y <= 0.15; y += 0.01) { const th = 0.38 + (y - .05) * .2; pz.push(torsoPt(y, th, new THREE.Vector3()).multiplyScalar(1.006)); }
    G.add(line(pz, .003, zipM));
    for (const sgn of [-1, 1]) {
      const hp = []; for (let k = 0; k <= 10; k++) { const y = -0.30 + k * .018; hp.push(torsoPt(y, sgn * (0.95 - k * .028), new THREE.Vector3()).multiplyScalar(1.006)); }
      G.add(line(hp, .003, zipM));
    }
    // couture d'empiècement (épaules)
    const yoke = []; for (let i = 0; i <= 80; i++) { const th = -1.45 + 2.9 * i / 80; yoke.push(torsoPt(0.165 + .018 * Math.cos(th), th, new THREE.Vector3()).multiplyScalar(1.004)); }
    G.add(line(yoke, .0018, seamM, 120));
    const yokeB = yoke.map(v => new THREE.Vector3(v.x, v.y, -v.z)); G.add(line(yokeB, .0018, seamM, 120));

    // manches
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * .17, .17, -.005), new THREE.Vector3(s * .24, .14, 0), new THREE.Vector3(s * .29, .05, .01),
        new THREE.Vector3(s * .325, -.11, .03), new THREE.Vector3(s * .345, -.27, .05), new THREE.Vector3(s * .355, -.35, .06)]);
      const rad = (t) => .074 - t * .018 - (t > .9 ? (t - .9) * .05 : 0);
      const sl = new THREE.Mesh(varTube(c, rad, 100, 44, .012), fabric); G.add(sl);
      const end = c.getPointAt(1), tan = c.getTangentAt(1);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(.054, .009, 12, 40), fabric2);
      cuff.position.copy(end); cuff.lookAt(end.clone().add(tan)); G.add(cuff);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(.05, 32), innerD);
      hole.position.copy(end).addScaledVector(tan, -.004); hole.lookAt(end.clone().add(tan)); G.add(hole);
    }

    // col montant
    const col = new THREE.Group();
    const colGeo = new THREE.CylinderGeometry(1, 1.06, 1, 64, 1, true);
    const collar = new THREE.Mesh(colGeo, fabric); collar.scale.set(.102, .065, .094); collar.rotation.y = 0; collar.position.set(0, .31, .0);
    collar.rotation.y = Math.PI / 2 * 0; col.add(collar);
    const collarIn = new THREE.Mesh(colGeo, inner); collarIn.scale.copy(collar.scale).multiplyScalar(.97); collarIn.position.copy(collar.position); col.add(collarIn);
    G.add(col);

    // capuche (coque ouverte vers l'avant)
    const cut = .95;
    const hoodGeo = new THREE.SphereGeometry(1, 64, 48, Math.PI / 2 + cut, TAU - 2 * cut, 0, Math.PI * .8);
    // SphereGeometry : x = -cos(phi) sin(theta), z = sin(phi) sin(theta) -> l'ouverture (phi≈π/2) fait face à +z
    { const pa = hoodGeo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i);
        // pointe vers l'arrière-haut, élargie en bas, aplatie sur les côtés
        const back = Math.max(0, -v.z), up = Math.max(0, v.y);
        v.z -= back * up * .18; v.y += back * up * .06;
        if (v.y < 0) { v.x *= 1 + (-v.y) * .6; v.z *= 1 + (-v.y) * .2; }
        pa.setXYZ(i, v.x, v.y, v.z); }
      hoodGeo.computeVertexNormals(); }
    const hood = new THREE.Mesh(hoodGeo, fabric); hood.scale.set(.122, .132, .14); hood.position.set(0, .35, -.05); G.add(hood);
    const hoodIn = new THREE.Mesh(hoodGeo, inner); hoodIn.scale.copy(hood.scale).multiplyScalar(.97); hoodIn.position.copy(hood.position); G.add(hoodIn);
    // bord de capuche
    const rim = [];
    for (let i = 0; i <= 60; i++) {
      const th = Math.PI * .8 * i / 60, phis = [Math.PI / 2 + cut, Math.PI / 2 - cut + TAU];
      const ph = phis[0];
      rim.push(new THREE.Vector3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)));
    }
    const rim2 = rim.map(v => new THREE.Vector3(-v.x, v.y, v.z)).reverse();
    const warp = v => { const back = Math.max(0, -v.z), up = Math.max(0, v.y); v.z -= back * up * .18; v.y += back * up * .06; if (v.y < 0) { v.x *= 1 + (-v.y) * .6; v.z *= 1 + (-v.y) * .2; } return v; };
    const rimPts = rim2.concat(rim.slice(1)).map(v => warp(v).multiply(hood.scale).add(hood.position));
    G.add(line(rimPts, .008, fabric2, 160));
    // cordon de serrage
    for (const s of [-1, 1]) {
      const toggle = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .02, 12), pullM);
      toggle.position.set(s * .07, .255, .1); G.add(toggle);
    }

    // logos (pictogramme A)
    const tex = new THREE.Texture(logoImg); tex.needsUpdate = true; tex.encoding = THREE.sRGBEncoding;
    const logoM = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .35, metalness: .2, color: 0xdfe3e8, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4 });
    function decal(y, th, size) {
      const p = torsoPt(y, th, new THREE.Vector3()), p2 = torsoPt(y, th + .01, new THREE.Vector3()), p3 = torsoPt(y + .01, th, new THREE.Vector3());
      const n = new THREE.Vector3().subVectors(p2, p).cross(new THREE.Vector3().subVectors(p3, p)).normalize();
      if (n.dot(new THREE.Vector3(p.x, 0, p.z)) < 0) n.negate();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * logoImg.height / logoImg.width), logoM);
      m.position.copy(p).addScaledVector(n, .003); m.lookAt(p.clone().add(n)); G.add(m);
    }
    decal(0.125, 0.52, .045);           // poitrine (côté cœur)
    decal(0.17, Math.PI, .04);          // haut du dos
    { const th = .62, u = new THREE.Vector3(0, Math.cos(th), -Math.sin(th)), u2 = new THREE.Vector3(0, Math.cos(th + .02), -Math.sin(th + .02));
      const p = warp(u.clone()).multiply(hood.scale).add(hood.position), p2 = warp(u2.clone()).multiply(hood.scale).add(hood.position);
      const tang = p2.clone().sub(p).normalize(), n = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), tang).normalize();
      if (n.z > 0) n.negate();
      const hl = new THREE.Mesh(new THREE.PlaneGeometry(.03, .03 * logoImg.height / logoImg.width), logoM);
      hl.position.copy(p).addScaledVector(n, .004); hl.lookAt(p.clone().add(n)); G.add(hl); } // capuche

    G.position.y = -0.03;
    const W = new THREE.Group(); W.add(G); return W;
  };

  window.setupLights = function (S, R) {
    // environnement « ciel » pour les reflets
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h=vP.y; vec3 top=vec3(.75,.82,.95), hor=vec3(.95,.93,.9), gr=vec3(.18,.22,.16); vec3 c=h>0.?mix(hor,top,pow(h,.6)):mix(hor,gr,pow(-h,.5)); gl_FragColor=vec4(c*1.1,1.); }',
    }));
    envScene.add(sky);
    const pm = new THREE.PMREMGenerator(R); S.environment = pm.fromScene(envScene, .02).texture;
    S.add(new THREE.AmbientLight(0xffffff, .15));
    const key = new THREE.DirectionalLight(0xf4f6fa, 1.4); key.position.set(-2.5, 3, 3); S.add(key);
    const rim = new THREE.DirectionalLight(0xdce9ff, 2.2); rim.position.set(3, 1.5, -2.5); S.add(rim);
    const rim2 = new THREE.DirectionalLight(0xdce9ff, 1.5); rim2.position.set(-3, 1, -2); S.add(rim2);
    const fill = new THREE.DirectionalLight(0xffffff, .35); fill.position.set(2, -1, 3); S.add(fill);
  };
})();
