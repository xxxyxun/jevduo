'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const NS = 'http://www.w3.org/2000/svg';
  let reduced = media.matches;
  const opening = $('opening');
  const stage = $('assembly-stage');
  const heroMount = $('hero-model-mount');
  const board = $('architecture-board');
  const header = $('site-header');
  const progress = document.querySelector('.header-progress');
  const wireSvg = document.querySelector('.arch-track');
  const wireLayer = $('arch-wires');
  const pulseLayer = $('arch-pulses');
  const gates = [$('arch-jev'), $('arch-cli'), $('arch-extension')];
  const stops = [...$('arch-runtime').querySelectorAll('.runtime-node')];
  /* 三维装配：一个 viewer 在开场与结果之间迁移 */
  let viewer = null;
  let owner = 'hero';
  let heroIn = true;
  let intro = 0;
  let introRaf = 0;
  let introClock = 0;
  let cameraLocked = false;
  let heroSphere = null;
  function heroFit(walk) {
    if (!viewer || !heroSphere) return;
    const aspect = heroMount.clientWidth / heroMount.clientHeight;
    const halfV = 33 * Math.PI / 360;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const ease = walk * walk * (3 - 2 * walk);
    const direction = cameraLocked ? viewer.snapshot().camera : {
      yaw: -1.27 + ease * 0.08, elevation: 0.8 - ease * 0.12,
    };
    viewer.setCamera({
      yaw: direction.yaw, elevation: direction.elevation,
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
    $('model-loading')?.remove();
  }
  async function initScene() {
    try {
      if (!window.gearboxData) {
        const response = await fetch(document.documentElement.dataset.assets + 'model.json');
        if (!response.ok) throw new Error('model');
        window.gearboxData = await response.json();
      }
      viewer = window.GearboxViewer.create(heroMount, {
        theme: 'atlas',
        onUpdate: (state) => window.dispatchEvent(new CustomEvent('gearbox-update', { detail: state })),
      });
      viewer.scene.children.filter((node) => node.isLight).forEach((light) => {
        if (light.isHemisphereLight) light.intensity = 1.7;
        else if (light.castShadow) { light.intensity = 3.4; light.shadow.mapSize.set(2048, 2048); }
        else light.intensity *= 0.82;
      });
      viewer.renderer.toneMappingExposure = 1.04;
      viewer.setMode('assembly');
      viewer.play(false);
      viewer.seek(180);
      const model = viewer.scene.children.find((node) => node.type === 'Group');
      heroSphere = new window.THREE.Box3().setFromObject(model).getBoundingSphere(new window.THREE.Sphere());
      viewer.seek(0);
      heroFit(0);
      viewer.canvas.setAttribute('aria-label', '拖动旋转装配模型');
      viewer.canvas.addEventListener('pointerdown', () => { cameraLocked = true; }, { passive: true });
      $('hero-model-loading').remove();
      stage.classList.add('is-ready');
      startIntro(true);
      return viewer;
    } catch (error) {
      const loading = $('hero-model-loading');
      if (loading) loading.textContent = '场景暂未加载';
      return null;
    }
  }
  const ready = initScene();
  new IntersectionObserver((entries) => {
    heroIn = entries[0].isIntersecting;
    if (heroIn) { ready.then(mountHero); startIntro(false); }
    else introClock = 0;
  }).observe(opening);
  /* 架构：量测真实 rect 的轨道，一次只走一条路 */
  const labelsLayer = $('arch-labels');
  const ROUTES = ['gui', 'cli', 'extension'];
  const DUR = { routing: 1100, executing: 2200, returning: 1400, idle: 2800 };
  const FLOW = { routing: [['goal', 0, 0.6], ['dispatch', 0.38, 1]], executing: [['run', 0, 1]], returning: [['back', 0, 0.42], ['loop', 0.46, 1]] };
  let route = 'gui';
  let boardPhase = 'idle';
  let boardInView = false;
  let boardTimer = 0;
  let phaseAt = 0;
  let pulseRaf = 0;
  let frameRect = null;
  let wireMap = {};
  let stopTimers = [];
  const n1 = (v) => Math.round(v * 10) / 10;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left - frameRect.left;
    const y = r.top - frameRect.top;
    return { x, y, right: x + r.width, bottom: y + r.height, cx: x + r.width / 2, cy: y + r.height / 2 };
  };
  const dots = [0, 1].map(() => {
    const dot = pulseLayer.appendChild(document.createElementNS(NS, 'circle'));
    dot.setAttribute('r', '3');
    dot.style.opacity = '0';
    return dot;
  });
  function dress() {
    const live = boardPhase === 'routing' || boardPhase === 'executing';
    ['goal', 'dispatch', 'run'].forEach((key) => { if (wireMap[key]) wireMap[key].classList.toggle('is-active', live); });
    ['back', 'loop'].forEach((key) => { if (wireMap[key]) wireMap[key].classList.toggle('is-return', boardPhase === 'returning'); });
  }
  function drawBoard() {
    if (innerWidth < 960 || board.clientWidth < 620) {
      wireSvg.style.display = 'none';
      wireLayer.innerHTML = '';
      labelsLayer.innerHTML = '';
      wireMap = {};
      return;
    }
    wireSvg.style.display = '';
    frameRect = wireSvg.getBoundingClientRect();
    if (frameRect.width < 60) return;
    wireSvg.setAttribute('viewBox', `0 0 ${frameRect.width} ${frameRect.height}`);
    const input = box($('arch-input'));
    const observe = box($('arch-observe'));
    const slow = box($('arch-slow'));
    const end = box($('arch-end'));
    const score = box($('arch-score'));
    const router = box($('arch-router'));
    const runtime = box($('arch-runtime'));
    const back = box($('arch-return'));
    const pool = [...board.querySelectorAll('.pool .gate')].map((node) => Object.assign({ key: node.dataset.route }, box(node)));
    const busRoute = n1(router.bottom + (pool[0].y - router.bottom) * 0.56);
    const busRun = n1(pool[0].bottom + (runtime.y - pool[0].bottom) * 0.5);
    const top = 18;
    const paths = {
      step1: `M${n1(input.right)} ${n1(input.cy)}H${n1(observe.x)}`,
      step2: `M${n1(observe.right)} ${n1(observe.cy)}H${n1(slow.x)}`,
      stop: `M${n1(slow.right)} ${n1(slow.cy)}H${n1(end.x)}`,
      score: `M${n1(end.cx)} ${n1(end.bottom)}V${n1(score.y)}`,
      goal: `M${n1(slow.cx)} ${n1(slow.bottom)}V${n1(router.y)}`,
      back: `M${n1(runtime.x)} ${n1(runtime.cy)}H${n1(back.right)}`,
      loop: `M${n1(back.x)} ${n1(back.cy)}H26Q16 ${n1(back.cy)} 16 ${n1(back.cy - 14)}V${n1(top + 14)}Q16 ${n1(top)} 26 ${n1(top)}H${n1(observe.cx)}V${n1(observe.y)}`,
    };
    const parts = Object.keys(paths).map((key) => `<path id='w-${key}' d='${paths[key]}'${key === 'score' ? " class='is-note'" : ''}/>`);
    pool.forEach((gate) => {
      parts.push(`<path id='w-dispatch-${gate.key}' class='is-lane' data-kind='${gate.key}' d='M${n1(router.cx)} ${n1(router.bottom)}V${busRoute}H${n1(gate.cx)}V${n1(gate.y)}'/>`);
      parts.push(`<path id='w-run-${gate.key}' class='is-lane' data-kind='${gate.key}' d='M${n1(gate.cx)} ${n1(gate.bottom)}V${busRun}H${n1(runtime.cx)}V${n1(runtime.y)}'/>`);
    });
    wireLayer.innerHTML = parts.join('');
    wireMap = {};
    wireLayer.querySelectorAll('path').forEach((path) => { wireMap[path.id.slice(2)] = path; });
    wireMap.dispatch = wireMap[`dispatch-${route}`];
    wireMap.run = wireMap[`run-${route}`];
    const mark = (x, y, text, mid) => `<text x='${n1(x)}' y='${n1(y)}'${mid ? " text-anchor='middle'" : ''}>${text}</text>`;
    labelsLayer.innerHTML = mark((slow.right + end.x) / 2, slow.cy - 12, '成功 / 失败', 1)
      + mark(slow.cx + 14, (slow.bottom + router.y) / 2 + 5, '继续 · 一个子目标')
      + mark(end.cx + 14, (end.bottom + score.y) / 2 + 5, '评测旁路')
      + mark(34, 13, '下一轮');
    dress();
  }
  function setPhase(name) {
    boardPhase = name;
    phaseAt = performance.now();
    board.dataset.phase = name;
    clearTimeout(boardTimer);
    stopTimers.forEach(clearTimeout);
    stopTimers = [];
    if (name === 'executing') {
      stops.forEach((stop, i) => stopTimers.push(setTimeout(() => stop.classList.add('is-lit'), 240 + i * 520)));
    } else {
      stops.forEach((stop) => stop.classList.remove('is-lit'));
    }
    dress();
    if (name === 'idle') {
      if (pulseRaf) cancelAnimationFrame(pulseRaf);
      pulseRaf = 0;
      dots.forEach((dot) => { dot.style.opacity = '0'; });
      return;
    }
    if (!pulseRaf && !reduced) pulseRaf = requestAnimationFrame(pulseTick);
  }
  function pulseTick(now) {
    pulseRaf = 0;
    if (reduced || !boardInView || document.hidden || boardPhase === 'idle') return;
    const steps = FLOW[boardPhase] || [];
    const t = clamp01((now - phaseAt) / (DUR[boardPhase] || 1000));
    dots.forEach((dot, i) => {
      const step = steps[i];
      const path = step ? wireMap[step[0]] : null;
      if (!path) { dot.style.opacity = '0'; return; }
      if (!path.__length) path.__length = path.getTotalLength();
      const local = clamp01((t - step[1]) / Math.max(0.001, step[2] - step[1]));
      const point = path.getPointAtLength(local * path.__length);
      dot.setAttribute('cx', point.x.toFixed(1));
      dot.setAttribute('cy', point.y.toFixed(1));
      const on = t >= step[1] && t <= step[2];
      dot.style.opacity = on ? String(Math.min(1, 0.25 + 3 * Math.min(local, 1 - local))) : '0';
    });
    pulseRaf = requestAnimationFrame(pulseTick);
  }
  function cycle() {
    clearTimeout(boardTimer);
    if (reduced || !boardInView || document.hidden) { setPhase('idle'); return; }
    const phases = ['idle', 'routing', 'executing', 'returning'];
    const next = phases[(phases.indexOf(boardPhase) + 1) % phases.length];
    setPhase(next);
    boardTimer = setTimeout(cycle, DUR[next]);
  }
  gates.forEach((gate) => gate.addEventListener('click', () => {
    route = gate.dataset.route;
    board.dataset.route = route;
    gates.forEach((item) => item.setAttribute('aria-pressed', String(item === gate)));
    const label = gate.querySelector('strong');
    if (label) $('router-selection').textContent = label.textContent;
    drawBoard();
    setPhase('idle');
    cycle();
  }));
  new IntersectionObserver((entries) => {
    boardInView = entries[0].isIntersecting;
    if (!boardInView) { setPhase('idle'); return; }
    drawBoard();
    cycle();
  }, { threshold: 0.2 }).observe(board);
  /* 滚动、减轻动效与导出 */
  let scrollFrame = 0;
  function readScroll() {
    header.classList.toggle('is-solid', scrollY > 24);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : '0');
    const dock = reduced ? 0 : clamp01(-opening.getBoundingClientRect().top / Math.max(1, opening.offsetHeight * 0.9));
    stage.style.setProperty('--dock', dock.toFixed(3));
    stage.classList.toggle('is-docked', dock > 0.985);
  }
  addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; readScroll(); });
  }, { passive: true });
  if (!reduced) {
    const revealer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealer.unobserve(entry.target);
      });
    }, { threshold: 0.14 });
    document.querySelectorAll('.section-lead, .film-figure, .records, .viewer, .closing-inner').forEach((node) => {
      node.classList.add('reveal');
      revealer.observe(node);
    });
  }
  function applyMotion() {
    reduced = media.matches;
    if (!reduced) {
      startIntro(false);
      if (boardInView) cycle();
      return;
    }
    if (boardInView) setPhase('idle');
  }
  media.addEventListener('change', applyMotion);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (boardInView) cycle();
      startIntro(false);
      return;
    }
    setPhase('idle');
    if (viewer) viewer.play(false);
    introClock = 0;
  });
  new ResizeObserver(() => drawBoard()).observe(board);
  const refitHero = () => { if (viewer && owner === 'hero') heroFit(intro); };
  addEventListener('resize', () => { readScroll(); drawBoard(); refitHero(); }, { passive: true });
  new ResizeObserver(refitHero).observe(heroMount);
  document.fonts.ready.then(() => drawBoard());
  window.JevDuoScene = {
    ready, mountResult, get viewer() { return viewer; },
    state: () => ({ ...window.JevDuoExecution.state(), route, owner, boardPhase, intro, cameraLocked }),
  };
  readScroll();
  drawBoard();
})();
