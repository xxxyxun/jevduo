'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const NS = 'http://www.w3.org/2000/svg';
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches;

  const opening = $('opening');
  const stage = $('assembly-stage');
  const heroMount = $('hero-model-mount');
  const board = $('architecture-board');
  const header = $('site-header');
  const bar = document.querySelector('.header-progress');
  const track = document.querySelector('.arch-track');
  const wireLayer = $('arch-wires');
  const labelLayer = $('arch-labels');
  const pulseLayer = $('arch-pulses');
  const gates = { gui: $('arch-jev'), cli: $('arch-cli') };

  /* ═══ 一 · 三维装配：单个 viewer 在开场与成果之间迁移 ═══ */
  let viewer = null;
  let owner = 'hero';
  let heroIn = true;
  let heroSphere = null;
  let intro = 0;
  let introRaf = 0;
  let introClock = 0;
  let cameraLocked = false;

  function heroFit(walk) {
    if (!viewer || !heroSphere) return;
    const w = heroMount.clientWidth;
    const h = heroMount.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;
    const halfV = 33 * Math.PI / 360;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const ease = walk * walk * (3 - 2 * walk);
    const dir = cameraLocked ? viewer.snapshot().camera : {
      yaw: -1.27 + ease * 0.08,
      elevation: 0.8 - ease * 0.12,
    };
    viewer.setCamera({
      yaw: dir.yaw,
      elevation: dir.elevation,
      radius: heroSphere.radius / (Math.sin(Math.min(halfV, halfH)) * 0.86) * (1 + 0.55 * (1 - ease)),
      target: heroSphere.center.toArray(),
    });
  }

  function introTick(now) {
    introRaf = 0;
    if (!viewer || owner !== 'hero' || !heroIn || document.hidden) { introClock = 0; return; }
    if (!introClock) introClock = now;
    const step = Math.min(1000, now - introClock);
    introClock = now;
    if (intro < 1) { intro = clamp01(intro + step / 7600); viewer.seek(180 * intro); }
    heroFit(intro);
    if (intro < 1) introRaf = requestAnimationFrame(introTick);
  }

  function startIntro(reset) {
    if (!viewer || owner !== 'hero') return;
    if (reduced) { intro = 1; viewer.seek(180); heroFit(1); return; }
    if (reset) { intro = 0; viewer.seek(0); }
    introClock = 0;
    if (!introRaf) introRaf = requestAnimationFrame(introTick);
  }

  function mountHero() {
    if (!viewer || owner === 'hero') return;
    owner = 'hero';
    cameraLocked = false;
    viewer.play(false);
    viewer.moveTo(heroMount);
    viewer.setMode('assembly');
    startIntro(true);
  }

  function mountResult() {
    if (!viewer || owner === 'result') return;
    owner = 'result';
    viewer.play(false);
    viewer.moveTo($('model-mount'));
    viewer.setMode('motion');
    const loading = $('model-loading');
    if (loading) loading.remove();
  }

  async function initScene() {
    try {
      if (!window.gearboxData) {
        const res = await fetch(document.documentElement.dataset.assets + 'model.json');
        if (!res.ok) throw new Error('model');
        window.gearboxData = await res.json();
      }
      viewer = window.GearboxViewer.create(heroMount, {
        theme: 'atlas',
        onUpdate: (s) => window.dispatchEvent(new CustomEvent('gearbox-update', { detail: s })),
      });
      viewer.scene.children.filter((n) => n.isLight).forEach((l) => {
        if (l.isHemisphereLight) l.intensity = 1.7;
        else if (l.castShadow) { l.intensity = 3.4; l.shadow.mapSize.set(2048, 2048); }
        else l.intensity *= 0.82;
      });
      viewer.renderer.toneMappingExposure = 1.04;
      viewer.setMode('assembly');
      viewer.play(false);
      viewer.seek(180);
      const model = viewer.scene.children.find((n) => n.type === 'Group');
      heroSphere = new window.THREE.Box3().setFromObject(model).getBoundingSphere(new window.THREE.Sphere());
      viewer.seek(0);
      heroFit(0);
      viewer.canvas.setAttribute('aria-label', '拖动旋转装配模型');
      viewer.canvas.addEventListener('pointerdown', () => { cameraLocked = true; }, { passive: true });
      const loading = $('hero-model-loading');
      if (loading) loading.remove();
      stage.classList.add('is-ready');
      startIntro(true);
      return viewer;
    } catch (err) {
      const loading = $('hero-model-loading');
      if (loading) loading.textContent = '场景暂未加载';
      return null;
    }
  }

  const ready = initScene();

  new IntersectionObserver((entries) => {
    heroIn = entries[entries.length - 1].isIntersecting;
    if (heroIn) { ready.then(mountHero); startIntro(false); }
    else introClock = 0;
  }).observe(opening);

  /* ═══ 二 · 架构板：正交测量布线 + 相位脉冲 ═══ */
  const DUR = { routing: 2100, executing: 1700, returning: 2200, idle: 1100 };
  const FLOW = {
    routing: [['step1', 0, 0.30], ['goal', 0.30, 0.62], ['lane', 0.64, 1]],
    executing: [['run', 0, 1]],
    returning: [['back', 0, 0.36], ['loop', 0.40, 1]],
  };
  const ORDER = ['idle', 'routing', 'executing', 'returning'];

  let route = 'gui';
  let phase = 'idle';
  let boardIn = false;
  let timer = 0;
  let phaseAt = 0;
  let pulseRaf = 0;
  let frame = null;
  let wires = {};

  const dots = [];
  for (let i = 0; i < 3; i += 1) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', '3.2');
    c.style.opacity = '0';
    pulseLayer.appendChild(c);
    dots.push(c);
  }

  const f = (n) => Math.round(n * 10) / 10;

  function rel(el) {
    const r = el.getBoundingClientRect();
    return {
      x: r.left - frame.left, y: r.top - frame.top,
      w: r.width, h: r.height,
      r: r.right - frame.left, b: r.bottom - frame.top,
      cx: r.left - frame.left + r.width / 2,
      cy: r.top - frame.top + r.height / 2,
    };
  }

  function clearBoard() {
    wireLayer.innerHTML = '';
    labelLayer.innerHTML = '';
    wires = {};
    dots.forEach((d) => { d.style.opacity = '0'; });
  }

  function drawBoard() {
    track.style.display = '';
    frame = track.getBoundingClientRect();
    if (innerWidth <= 1080 || !frame || frame.width < 300 || frame.height < 200) {
      track.style.display = 'none';
      clearBoard();
      return;
    }
    track.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
    const input = rel($('arch-input'));
    const slow = rel($('arch-slow'));
    const zone = rel(board.querySelector('.route-zone'));
    const router = rel($('arch-router'));
    const gGui = rel(gates.gui);
    const gCli = rel(gates.cli);
    const runtime = rel($('arch-runtime'));
    const ret = rel($('arch-return'));

    const mid = f((slow.r + zone.x) / 2);
    const stem = f(router.b + 13);
    const gutL = f(zone.x + 9);
    const gutR = f(zone.r - 9);
    const loopX = f(Math.max(18, input.x - 26));
    const cx = f(gGui.cx);

    const paths = {
      step1: `M${f(input.r)} ${f(input.cy)}H${f(slow.x - 3)}`,
      goal: `M${f(slow.r)} ${f(slow.cy)}H${mid}V${f(router.cy)}H${f(router.x - 3)}`,
      gui: `M${cx} ${f(router.b)}V${f(gGui.y - 3)}`,
      cli: `M${cx} ${f(router.b)}V${stem}H${gutL}V${f(gCli.cy)}H${f(gCli.x - 3)}`,
      runGui: `M${f(gGui.r)} ${f(gGui.cy)}H${gutR}V${f(runtime.y - 3)}`,
      runCli: `M${f(gCli.cx)} ${f(gCli.b)}V${f(runtime.y - 3)}`,
      back: `M${f(runtime.cx)} ${f(runtime.b)}V${f(ret.y - 3)}`,
      loop: `M${f(ret.x)} ${f(ret.cy)}H${loopX}V${f(input.cy)}H${f(input.x - 3)}`,
    };

    wireLayer.innerHTML = Object.keys(paths)
      .map((k) => `<path id="w-${k}" d="${paths[k]}"/>`).join('');
    wires = {};
    wireLayer.querySelectorAll('path').forEach((p) => { wires[p.id.slice(2)] = p; });

    const labelY = f(Math.min(slow.cy, router.cy) - 12);
    const loopMidY = f((input.cy + ret.cy) / 2);
    labelLayer.innerHTML =
      `<text x="${mid}" y="${labelY}" text-anchor="middle">子目标</text>` +
      `<text x="${f(runtime.cx + 14)}" y="${f((runtime.b + ret.y) / 2 + 5)}">回执</text>` +
      `<text x="${f(loopX + 4)}" y="${loopMidY}" text-anchor="middle" transform="rotate(-90 ${f(loopX + 4)} ${loopMidY})">新观察</text>`;

    dress();
  }

  function lane(which) {
    if (which === 'lane') return wires[route === 'gui' ? 'gui' : 'cli'];
    if (which === 'run') return wires[route === 'gui' ? 'runGui' : 'runCli'];
    return wires[which];
  }

  function dress() {
    const on = (key, cls, live) => { if (wires[key]) wires[key].classList.toggle(cls, live); };
    const routing = phase === 'routing';
    on('step1', 'on', routing);
    on('goal', 'on', routing);
    on('gui', 'on', routing && route === 'gui');
    on('cli', 'on', routing && route === 'cli');
    on('runGui', 'on', phase === 'executing' && route === 'gui');
    on('runCli', 'on', phase === 'executing' && route === 'cli');
    on('back', 'back', phase === 'returning');
    on('loop', 'back', phase === 'returning');
  }

  function lightRuntime(live) {
    $('arch-runtime').querySelectorAll('.runtime-node')
      .forEach((n) => n.classList.toggle('is-lit', live));
  }

  function setPhase(name) {
    phase = name;
    phaseAt = performance.now();
    board.dataset.phase = name;
    clearTimeout(timer);
    lightRuntime(name === 'executing' || name === 'returning');
    dress();
    if (name === 'idle') {
      if (pulseRaf) cancelAnimationFrame(pulseRaf);
      pulseRaf = 0;
      dots.forEach((d) => { d.style.opacity = '0'; });
      return;
    }
    if (!pulseRaf && !reduced) pulseRaf = requestAnimationFrame(pulseTick);
  }

  function pulseTick(now) {
    pulseRaf = 0;
    if (reduced || !boardIn || document.hidden || phase === 'idle') return;
    const steps = FLOW[phase] || [];
    const t = clamp01((now - phaseAt) / (DUR[phase] || 1000));
    dots.forEach((dot, i) => {
      const step = steps[i];
      const path = step ? lane(step[0]) : null;
      if (!path) { dot.style.opacity = '0'; return; }
      if (!path.__len) path.__len = path.getTotalLength();
      const local = clamp01((t - step[1]) / Math.max(0.001, step[2] - step[1]));
      const pt = path.getPointAtLength(local * path.__len);
      dot.setAttribute('cx', pt.x.toFixed(1));
      dot.setAttribute('cy', pt.y.toFixed(1));
      dot.style.opacity = (t >= step[1] && t <= step[2])
        ? String(Math.min(1, 0.3 + 3 * Math.min(local, 1 - local))) : '0';
    });
    pulseRaf = requestAnimationFrame(pulseTick);
  }

  function cycle() {
    clearTimeout(timer);
    if (reduced || !boardIn || document.hidden) { setPhase('idle'); return; }
    const next = ORDER[(ORDER.indexOf(phase) + 1) % ORDER.length];
    setPhase(next);
    timer = setTimeout(cycle, DUR[next]);
  }

  Object.keys(gates).forEach((key) => {
    gates[key].addEventListener('click', () => {
      route = key;
      board.dataset.route = route;
      Object.keys(gates).forEach((k) => gates[k].setAttribute('aria-pressed', String(k === key)));
      $('router-selection').textContent = key === 'gui' ? 'JEV · GUI' : '慢模型 · CLI';
      drawBoard();
      setPhase('idle');
      cycle();
    });
  });

  new IntersectionObserver((entries) => {
    boardIn = entries[entries.length - 1].isIntersecting;
    if (!boardIn) { setPhase('idle'); clearTimeout(timer); return; }
    drawBoard();
    cycle();
  }, { threshold: 0.15 }).observe(board);

  /* ═══ 三 · 滚动、揭示与导出 ═══ */
  let scrollRaf = 0;

  function readScroll() {
    header.classList.toggle('is-solid', scrollY > 24);
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : '0');
    const dock = reduced ? 0 : clamp01(-opening.getBoundingClientRect().top / Math.max(1, opening.offsetHeight * 0.9));
    stage.style.setProperty('--dock', dock.toFixed(3));
    stage.classList.toggle('is-docked', dock > 0.985);
  }

  addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; readScroll(); });
  }, { passive: true });

  if (!reduced) {
    const revealer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        revealer.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.section-lead, .film-figure, .records, .viewer, .closing-inner')
      .forEach((n) => { n.classList.add('reveal'); revealer.observe(n); });
  }

  media.addEventListener('change', () => {
    reduced = media.matches;
    if (!reduced) { startIntro(false); if (boardIn) cycle(); return; }
    setPhase('idle');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (boardIn) cycle();
      startIntro(false);
      return;
    }
    setPhase('idle');
    clearTimeout(timer);
    if (viewer) viewer.play(false);
    introClock = 0;
  });

  new ResizeObserver(() => drawBoard()).observe(board);
  addEventListener('resize', () => {
    readScroll();
    drawBoard();
    if (viewer && owner === 'hero') heroFit(intro);
  }, { passive: true });
  new ResizeObserver(() => { if (viewer && owner === 'hero') heroFit(intro); }).observe(heroMount);
  document.fonts.ready.then(() => drawBoard());

  window.JevDuoScene = {
    ready,
    mountResult,
    get viewer() { return viewer; },
    state: () => ({
      ...(window.JevDuoExecution ? window.JevDuoExecution.state() : {}),
      route, boardPhase: phase, owner, intro, cameraLocked, boardIn,
    }),
  };

  readScroll();
  drawBoard();
})();
