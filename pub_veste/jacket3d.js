// Veste 3D v3 — maillage issu de la simulation de tissu (build_jacket.js -> jacket_sim.js). three.js r149.
// Expose : buildJacket(logoImg) -> THREE.Group ; JACKET_ANCHORS (points pour les légendes)
(function () {
  THREE.ColorManagement.legacyMode = false;
  const V = a => new THREE.Vector3(a[0], a[1], a[2]);

  function fabricMaps() {
    // carte de relief « toile ripstop » + rugosité légèrement variable
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), d = x.createImageData(N, N);
    let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N * N; i++) {
      const px = i % N, py = (i / N) | 0;
      const weave = (Math.sin(px * 1.9) * Math.sin(py * 1.9)) * 10;
      const rip = ((px % 24) < 2 || (py % 24) < 2) ? 30 : 0;
      const v = 128 + weave + rip + (rnd() - .5) * 18;
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.anisotropy = 8; return t;
  }
  const tube = (pts, r, mat, closed = false, seg = 160) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V), closed), seg, r, 8, closed), mat);

  window.JACKET_ANCHORS = {};
  window.buildJacket = function (logoImg) {
    const D = window.JACKET_SIM, G = new THREE.Group(), bump = fabricMaps();
    const fabric = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: .78, metalness: 0, bumpMap: bump, bumpScale: .0009,
      sheen: .5, sheenColor: new THREE.Color('#5f6e63'), sheenRoughness: .7, envMapIntensity: .5, side: THREE.FrontSide });
    const lining = new THREE.MeshStandardMaterial({ color: new THREE.Color('#263a2e'), roughness: .9, side: THREE.BackSide, bumpMap: bump, bumpScale: .0006 });
    const dark = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#1d2420'), roughness: .85, bumpMap: bump, bumpScale: .0008 });
    const zipM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#131715'), roughness: .35, metalness: .4 });
    const pullM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b4512a'), roughness: .45 });

    for (const m of D.meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
      g.setIndex(m.idx); g.computeVertexNormals();
      G.add(new THREE.Mesh(g, fabric));
      const inner = new THREE.Mesh(g, lining); G.add(inner); // envers (doublure) visible dans les ouvertures
    }
    const d = D.details;
    G.add(tube(d.zip, .0034, zipM, false, 200));
    d.pockets.forEach(p => G.add(tube(p, .0024, zipM, false, 40)));
    G.add(tube(d.hem, .0055, dark, true, 240));
    d.cuffs.forEach(r => G.add(tube(r, .0065, dark, true, 60)));
    // col montant
    const colGeo = new THREE.CylinderGeometry(.103, .11, .06, 72, 1, true);
    const collar = new THREE.Mesh(colGeo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#34493b'), roughness: .8, bumpMap: bump, bumpScale: .0008 }));
    collar.position.set(0, .312, .004); G.add(collar);
    const cIn = new THREE.Mesh(colGeo, lining); cIn.position.copy(collar.position); cIn.scale.setScalar(.97); G.add(cIn);
    const top = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2; top.push([Math.sin(a) * .104, .342, Math.cos(a) * .099 + .004]); }
    G.add(tube(top, .004, dark, true, 100));
    G.add(tube([[0, .29, .108], [0, .342, .104]], .0034, zipM, false, 8));
    // tirettes
    d.pulls.forEach((q, k) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(k ? .009 : .013, k ? .02 : .028, .004), pullM);
      const p = V(q.p), n = V(q.n); m.position.copy(p).addScaledVector(n, .006); m.lookAt(p.clone().addScaledVector(n, 2)); G.add(m);
    });
    // logos
    const tex = new THREE.Texture(logoImg); tex.needsUpdate = true; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const logoM = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .55, color: new THREE.Color('#e9e0cc'), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    [[d.logo, .044], [d.logoBack, .055]].forEach(([q, s]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * logoImg.height / logoImg.width), logoM);
      const p = V(q.p), n = V(q.n); m.position.copy(p).addScaledVector(n, .0025); m.lookAt(p.clone().add(n)); G.add(m);
    });
    for (const k in d.anchors) JACKET_ANCHORS[k] = V(d.anchors[k]).add(new THREE.Vector3(0, .05, 0));

    JACKET_ANCHORS.col = new THREE.Vector3(0, .335 + .05, .105);
    G.position.y = .05;
    const W = new THREE.Group(); W.add(G); return W;
  };
})();
