/* =============================================
   HELLO LANDING — main.js
   ============================================= */
'use strict';

gsap.registerPlugin(ScrollTrigger, CustomEase);

CustomEase.create('expo',  'M0,0 C0.16,1 0.3,1 1,1');
CustomEase.create('heavy', 'M0,0 C0.12,0 0,1 1,1');

/* =============================================
   1. WEBGL BACKGROUND
   ============================================= */
(function initBg() {
  const canvas = document.getElementById('bgCanvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  function resize() {
    const pr = window.innerWidth < 768 ? 0.6 : 1;
    canvas.width  = Math.floor(window.innerWidth * pr);
    canvas.height = Math.floor(window.innerHeight * pr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  const vs = `attribute vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0.,1.); }`;

  const fs = `
    precision mediump float;
    uniform float u_time;
    uniform vec2  u_res;
    uniform vec2  u_mouse;
    uniform float u_scroll;

    void main(){
      vec2 uv = gl_FragCoord.xy / u_res;
      uv.y = 1.0 - uv.y;

      float t = u_time * 0.16;
      vec2 o1 = vec2(0.5 + 0.26*sin(t*0.6),      0.5 + 0.2*cos(t*0.45));
      vec2 o2 = vec2(0.5 + 0.3*cos(t*0.38+1.1),  0.5 + 0.26*sin(t*0.5+2.0));
      vec2 o3 = u_mouse;

      float d1 = 1.0 - smoothstep(0.0, 0.52, length(uv - o1));
      float d2 = 1.0 - smoothstep(0.0, 0.4,  length(uv - o2));
      float d3 = 1.0 - smoothstep(0.0, 0.2,  length(uv - o3));

      float field = clamp(d1*0.16 + d2*0.12 + d3*0.24, 0.0, 1.0);

      /* grid */
      float gx = abs(sin(uv.x * 44.0));
      float gy = abs(sin(uv.y * 44.0));
      float grid = smoothstep(0.95, 1.0, max(gx, gy)) * 0.028;

      /* scroll tint — brightens slightly as user scrolls */
      float brightness = field * 0.13 + grid + u_scroll * 0.04;
      gl_FragColor = vec4(vec3(brightness), 1.0);
    }
  `;

  function mkShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

  const aPos  = gl.getAttribLocation(prog,  'a_pos');
  const uTime = gl.getUniformLocation(prog,  'u_time');
  const uRes  = gl.getUniformLocation(prog,  'u_res');
  const uMou  = gl.getUniformLocation(prog,  'u_mouse');
  const uScr  = gl.getUniformLocation(prog,  'u_scroll');

  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  let mx = 0.5, my = 0.5, sx = 0.5, sy = 0.5;
  let scrollVal = 0;

  window.addEventListener('mousemove', e => {
    mx = e.clientX / window.innerWidth;
    my = e.clientY / window.innerHeight;
  });

  ScrollTrigger.addEventListener('refresh', () => {});
  window.addEventListener('scroll', () => {
    scrollVal = Math.min(window.scrollY / (document.body.scrollHeight - window.innerHeight), 1);
  });

  let t0 = null;
  (function render(ts) {
    if (!t0) t0 = ts;
    const t = (ts - t0) * 0.001;
    sx += (mx - sx) * 0.04;
    sy += (my - sy) * 0.04;
    gl.uniform1f(uTime, t);
    gl.uniform2f(uRes,  canvas.width, canvas.height);
    gl.uniform2f(uMou,  sx, 1 - sy);
    gl.uniform1f(uScr,  scrollVal);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }());
}());


/* =============================================
   2. HERO 3D GLOBE (Three.js)
   ============================================= */
(function initHeroModel() {
  if (typeof THREE === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('heroModelCanvas');
  const wrap = document.getElementById('heroModel');
  if (!canvas || !wrap) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5.6);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.2 : 1.8));

  const globeGroup = new THREE.Group();
  globeGroup.position.x = 0.15;
  scene.add(globeGroup);

  const globeGeometry = new THREE.SphereGeometry(1.38, 48, 48);
  const globeWireMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8d8d8,
    wireframe: true,
    transparent: true,
    opacity: 0.12
  });
  const globeMesh = new THREE.Mesh(globeGeometry, globeWireMaterial);
  globeGroup.add(globeMesh);

  fetch('/static/landing/js/countries.geojson')
    .then(r => r.json())
    .then(data => {
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
      const radius = 1.384; 
      const allSegmentPoints = [];
      data.features.forEach(feature => {
        const geom = feature.geometry;
        if (!geom) return;
        if (geom.type === 'Polygon') {
          geom.coordinates.forEach(ring => addRing(ring));
        } else if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach(poly => poly.forEach(ring => addRing(ring)));
        }
      });
      function addRing(ring) {
        const points = [];
        ring.forEach(coord => {
          const lon = coord[0];
          const lat = coord[1];
          const phi = (90 - lat) * (Math.PI / 180);
          const theta = (lon + 180) * (Math.PI / 180);
          const x = -(radius * Math.sin(phi) * Math.cos(theta));
          const z = (radius * Math.sin(phi) * Math.sin(theta));
          const y = (radius * Math.cos(phi));
          points.push(new THREE.Vector3(x, y, z));
        });
        for (let i = 0; i < points.length - 1; i++) {
          allSegmentPoints.push(points[i], points[i + 1]);
        }
      }
      const geom = new THREE.BufferGeometry().setFromPoints(allSegmentPoints);
      globeGroup.add(new THREE.LineSegments(geom, lineMat));
    }).catch(err => console.error('Map load error:', err));

  const glowGeometry = new THREE.SphereGeometry(1.42, 32, 32);
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.05,
    roughness: 0.8,
    metalness: 0.1
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.x = 0.15;
  scene.add(glow);

  const ringGeometry = new THREE.TorusGeometry(1.8, 0.012, 16, 120);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x777777,
    transparent: true,
    opacity: 0.28
  });
  const ringA = new THREE.Mesh(ringGeometry, ringMaterial);
  ringA.rotation.x = Math.PI * 0.44;
  ringA.rotation.y = Math.PI * 0.15;
  scene.add(ringA);

  const ringB = new THREE.Mesh(ringGeometry, ringMaterial.clone());
  ringB.material.opacity = 0.16;
  ringB.rotation.x = -Math.PI * 0.38;
  ringB.rotation.y = -Math.PI * 0.26;
  scene.add(ringB);

  const lightA = new THREE.DirectionalLight(0xffffff, 1.2);
  lightA.position.set(2.5, 2, 3);
  scene.add(lightA);

  const lightB = new THREE.DirectionalLight(0x8c8c8c, 0.45);
  lightB.position.set(-2, -1, 1.5);
  scene.add(lightB);

  const ambient = new THREE.AmbientLight(0x505050, 0.5);
  scene.add(ambient);

  const mouse = { x: 0, y: 0 };
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  window.addEventListener('mousemove', e => {
    if (!isTouch) {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }
  });

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(120, rect.width);
    const h = Math.max(120, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let rafId = null;
  function render(time) {
    const t = time * 0.001;
    const currentMouseY = isTouch ? Math.sin(t * 1.5) * 0.4 : mouse.y;
    const currentMouseX = isTouch ? Math.cos(t * 1.2) * 0.4 : mouse.x;

    globeGroup.rotation.y = t * 0.22 + currentMouseX * 0.18;
    globeGroup.rotation.x = currentMouseY * 0.08;
    globeGroup.rotation.z = Math.sin(t * 0.3) * 0.08;
    glow.rotation.y = globeGroup.rotation.y;
    glow.rotation.x = globeGroup.rotation.x;
    glow.rotation.z = globeGroup.rotation.z;
    ringA.rotation.z = t * 0.16;
    ringB.rotation.z = -t * 0.12;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(render);
  }
  rafId = requestAnimationFrame(render);

  window.addEventListener('beforeunload', () => {
    if (rafId) cancelAnimationFrame(rafId);
    globeGeometry.dispose();
    glowGeometry.dispose();
    ringGeometry.dispose();
    globeWireMaterial.dispose();
    glowMaterial.dispose();
    ringMaterial.dispose();
    ringB.material.dispose();
    renderer.dispose();
  });
}());


/* =============================================
   3. CUSTOM CURSOR
   ============================================= */
(function initCursor() {
  /* Skip entirely on touch/stylus devices — no mouse means no custom cursor */
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

  const dot  = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');

  let dx = window.innerWidth / 2, dy = window.innerHeight / 2;
  let rx = dx, ry = dy;

  document.addEventListener('mousemove', e => { dx = e.clientX; dy = e.clientY; });

  (function loop() {
    dot.style.left = dx + 'px';
    dot.style.top  = dy + 'px';
    rx += (dx - rx) * 0.11;
    ry += (dy - ry) * 0.11;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(loop);
  }());

  document.querySelectorAll('a, button, [data-hover]').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });

  document.addEventListener('mousedown', () => document.body.classList.add('cursor-click'));
  document.addEventListener('mouseup',   () => document.body.classList.remove('cursor-click'));
}());


/* =============================================
   4. LOADER
   ============================================= */
(function initLoader() {
  const loader    = document.getElementById('loader');
  const bar       = document.getElementById('loaderBar');
  const counter   = document.getElementById('loaderCounter');
  const scene     = document.getElementById('scene');
  const scrollHint = document.getElementById('scrollHint');

  let count = 0;
  const countTo = 100;
  const countDur = 1500;
  const step = countDur / countTo;
  const timer = setInterval(() => {
    count++;
    counter.textContent = count;
    if (count >= countTo) clearInterval(timer);
  }, step);

  const tl = gsap.timeline({ onComplete: revealScene });

  tl.to(bar, { width: '100%', duration: 1.6, ease: 'power2.inOut' })
    .to(loader, { yPercent: -100, duration: 1, ease: 'expo', delay: 0.1 });

  function revealScene() {
    gsap.set(scene, { opacity: 1 });

    const txt    = document.getElementById('helloText');
    const tagEls = document.querySelectorAll('.tag-word, .tag-sep');
    const len    = txt.getComputedTextLength ? txt.getComputedTextLength() : 2200;

    gsap.set(txt, {
      strokeDasharray:  len,
      strokeDashoffset: len,
      fillOpacity: 0,
      strokeOpacity: 1,
    });

    const il = gsap.timeline({ onComplete: startIdle });

    il.to(txt, { strokeDashoffset: 0, duration: 1.9, ease: 'power3.inOut' })
      .to(txt, { fillOpacity: 1, strokeOpacity: 0, duration: 0.85, ease: 'power2.out' }, '-=0.35')
      .fromTo('#helloWrap',
        { scale: 0.88, filter: 'blur(14px)' },
        { scale: 1,    filter: 'blur(0px)',  duration: 1.3, ease: 'heavy' }, '<')
      .to(tagEls, { opacity: 1, y: 0, stagger: 0.07, duration: 0.7, ease: 'expo' }, '-=0.5')
      .to(scrollHint, { opacity: 1, duration: 0.7, ease: 'power2.out' }, '-=0.3');
  }

  function startIdle() {
    /* breathing float */
    gsap.to('#helloWrap', {
      y: -14, duration: 4.5,
      ease: 'sine.inOut', yoyo: true, repeat: -1
    });

    /* hide scroll hint when hero leaves viewport */
    ScrollTrigger.create({
      trigger: '#hero',
      start: 'bottom 60%',
      onEnter:      () => gsap.to('#scrollHint', { opacity: 0, duration: 0.4 }),
      onLeaveBack:  () => gsap.to('#scrollHint', { opacity: 1, duration: 0.4 }),
    });

    /* hero skew on scroll */
    gsap.to('#helloWrap', {
      skewX: -10,
      scaleY: 0.82,
      ease: 'none',
      scrollTrigger: {
        trigger: '#hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1.4,
      }
    });

    /* hero word blurs out */
    gsap.to('#helloText', {
      filter: 'blur(6px)',
      opacity: 0.3,
      ease: 'none',
      scrollTrigger: {
        trigger: '#hero',
        start: '40% top',
        end: 'bottom top',
        scrub: 1,
      }
    });

    initHorizontalScroll();
    initOutro();
  }
}());


/* =============================================
   5. MOUSE PARALLAX (hero)
   ============================================= */
(function initParallax() {
  const wrap = document.getElementById('helloWrap');
  let mx = 0, my = 0;

  window.addEventListener('mousemove', e => {
    mx = (e.clientX / window.innerWidth  - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  (function tick() {
    gsap.to(wrap, {
      rotationY: mx * 7,
      rotationX: -my * 3.5,
      transformPerspective: 1000,
      duration: 1.4,
      ease: 'power2.out',
      overwrite: 'auto',
    });
    requestAnimationFrame(tick);
  }());
}());


/* =============================================
   6. HORIZONTAL SCROLL
   ============================================= */
function initHorizontalScroll() {
  const outer  = document.getElementById('hscrollOuter');
  const track  = document.getElementById('hscrollTrack');
  const fill   = document.getElementById('hsFill');
  const curEl  = document.getElementById('hsCur');
  const arrow  = document.getElementById('hsArrow');
  const panels = gsap.utils.toArray('.hpanel');

  const getWidth = () => track.scrollWidth - window.innerWidth;

  /* Show scroll-right arrow when entering section */
  gsap.fromTo(arrow,
    { opacity: 0, x: 10 },
    {
      opacity: 1, x: 0, duration: 0.7, ease: 'expo',
      scrollTrigger: { trigger: outer, start: 'top 80%', toggleActions: 'play none none reverse' }
    }
  );

  /* Fade arrow out once the user starts scrolling horizontally */
  ScrollTrigger.create({
    trigger: outer,
    start: 'top top',
    onEnter: () => gsap.to(arrow, { opacity: 0, x: -10, duration: 0.5, ease: 'expo' }),
  });

  /* Main horizontal tween — this is what containerAnimation references */
  const hTween = gsap.to(track, {
    x: () => -getWidth(),
    ease: 'none',
    scrollTrigger: {
      trigger: outer,
      pin: true,
      start: 'top top',
      end: () => '+=' + getWidth(),
      scrub: 1.1,
      invalidateOnRefresh: true,
      onUpdate: self => {
        /* progress bar */
        fill.style.width = (self.progress * 100) + '%';
        /* counter */
        const idx = Math.min(Math.floor(self.progress * panels.length), panels.length - 1);
        curEl.textContent = String(idx + 1).padStart(2, '0');
        /* invert cursor colour on panel 2 */
        if (idx === 1) document.body.classList.add('panel-inv');
        else           document.body.classList.remove('panel-inv');
      }
    }
  });

  /* Per-panel character animations using containerAnimation */
  panels.forEach((panel, i) => {
    const chars = panel.querySelectorAll('.hw-char');
    const sub   = panel.querySelector('.hpanel-sub');

    /* Characters fly in */
    gsap.from(chars, {
      y: 120,
      opacity: 0,
      rotateX: 80,
      transformOrigin: '50% 100%',
      stagger: { each: 0.06, from: 'start' },
      duration: 0.9,
      ease: 'expo',
      scrollTrigger: {
        trigger: panel,
        containerAnimation: hTween,
        start: 'left 78%',
        toggleActions: 'play none none reverse',
      }
    });

    /* Sub-label slides up */
    gsap.to(sub, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'expo',
      scrollTrigger: {
        trigger: panel,
        containerAnimation: hTween,
        start: 'left 55%',
        toggleActions: 'play none none reverse',
      }
    });

    /* Decorative ring / dots parallax (panel 1 and 3) */
    const deco = panel.querySelector('.hpanel-deco');
    if (deco && (i === 0 || i === 2)) {
      gsap.fromTo(deco,
        { x: 60 },
        {
          x: -60,
          ease: 'none',
          scrollTrigger: {
            trigger: panel,
            containerAnimation: hTween,
            start: 'left right',
            end:   'right left',
            scrub: true,
          }
        }
      );
    }
  });
}


/* =============================================
   7. OUTRO
   ============================================= */
function initOutro() {
  const masks    = document.querySelectorAll('.outro-mask');
  const revTexts = document.querySelectorAll('.outro-reveal-text');

  /* Title lines slide up */
  gsap.to(masks, {
    y: '0%',
    stagger: 0.12,
    duration: 1.1,
    ease: 'expo',
    scrollTrigger: {
      trigger: '#outro',
      start: 'top 70%',
      toggleActions: 'play none none reverse',
    }
  });

  /* Eyebrow + meta */
  gsap.to(revTexts, {
    y: '0%',
    stagger: 0.18,
    duration: 0.8,
    ease: 'expo',
    scrollTrigger: {
      trigger: '#outro',
      start: 'top 65%',
      toggleActions: 'play none none reverse',
    }
  });

  /* Back-to-top button */
  gsap.from('#backTop', {
    opacity: 0, y: 20, duration: 0.8, ease: 'expo',
    scrollTrigger: {
      trigger: '#backTop',
      start: 'top 92%',
      toggleActions: 'play none none reverse',
    }
  });
}
