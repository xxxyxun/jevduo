'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const icon = (name) => `<svg class='ico' aria-hidden='true'><use href='#i-${name}'/></svg>`;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const best = (list) => list.reduce((at, v, i) => (v > list[at] ? i : at), 0);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const NS = 'http://www.w3.org/2000/svg';
  let reduced = media.matches;
  const opening = $('opening');
  const stage = $('assembly-stage');
  const heroMount = $('hero-model-mount');
  const board = $('architecture-board');
  const theater = $('execution-theater');
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
  /* 局部执行：观察 → 候选 → 选择 → 效果 → 读回 */
  const STEPS = [
    { name: '聚焦', obs: '搜索框已出现在当前观察中', picks: ['展开左侧分类', '点击零件搜索框', '打开最近工程'], weights: [11, 82, 7], stage: 1, receipt: '读回焦点：搜索框已激活' },
    { name: '输入', obs: '搜索框已激活，零件编号已由慢模型给出', picks: ['修改工程名称', '重新打开零件库', '输入 64179'], weights: [5, 7, 88], stage: 2, receipt: '读回字段：输入值为 64179' },
    { name: '选择', obs: '搜索结果已更新，目标框架出现在候选里', picks: ['选中目标框架', '再次输入编号', '选择普通砖块'], weights: [79, 13, 8], stage: 2, receipt: '读回选中状态：目标框架已选中' },
    { name: '放置', obs: '目标框架已选中，可以放入当前工程', picks: ['切回搜索框', '放到指定装配位置', '重复选中框架'], weights: [9, 84, 7], stage: 3, receipt: '动作回执：框架已放入装配区' },
    { name: '保存', obs: '本段装配已完成，等待保存', picks: ['关闭未保存工程', '重复放置框架', '保存当前工程'], weights: [4, 6, 90], stage: 4, receipt: '保存回执与最新观察已返回' },
  ];
  const BLOCKED = {
    obs: '目标控件未出现在当前候选中',
    picks: ['返回慢模型', '重复上次点击位置', '未确认就重放动作'],
    weights: [94, 4, 2],
    receipt: '保留当前状态，返回缺失控件与最后观察',
  };
  const beads = $('action-beads');
  const choiceBox = $('local-choice');
  const screen = $('mini-screen');
  const searchValue = $('mini-search-value');
  const canvasNote = $('mini-canvas-status');
  const receipt = $('receipt');
  const receiptText = $('receipt-text');
  const selectedAction = $('selected-action');
  const selectionCaption = $('selection-caption');
  const playButton = $('loop-play');
  const blockButton = $('loop-block');
  selectedAction.setAttribute('aria-live', 'polite');
  receiptText.textContent = '等待本步动作执行';
  let phase = 'execution';
  let action = 0;
  let blocked = false;
  let playing = false;
  let applied = false;
  let started = false;
  let timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const currentStage = () => Number(screen.dataset.stage || 0);
  const barOf = (row) => row.querySelector('.choice-bar');
  function paintScreen(state) {
    screen.dataset.stage = String(state);
    searchValue.textContent = state >= 2 ? '64179' : '零件编号';
    canvasNote.textContent = state >= 3 ? '框架已放入工程' : '当前工程';
  }
  function paintPlay() {
    playButton.innerHTML = playing ? icon('pause') : icon('play');
    playButton.setAttribute('aria-label', playing ? '暂停执行流程' : '播放执行流程');
  }
  function paintBeads() {
    const reviewing = phase === 'review';
    const focused = beads.contains(document.activeElement);
    beads.innerHTML = STEPS.map((step, i) => {
      const state = reviewing || i < action ? 'is-done' : i === action ? 'is-active' : '';
      return `<button type='button' class='bead ${state}' data-action='${i}' aria-pressed='${i === action && !reviewing}'><i aria-hidden='true'></i><span>${step.name}</span></button>`;
    }).join('');
    beads.style.setProperty('--done', (reviewing ? 1 : action / (STEPS.length - 1)).toFixed(3));
    if (!focused) return;
    const target = beads.querySelector(`[data-action='${action}']`);
    if (target) target.focus({ preventScroll: true });
  }
  function paintChrome() {
    const reviewing = phase === 'review';
    $('slow-status').textContent = blocked ? '接收阻塞，调整子目标' : reviewing ? '核验本段结果' : '子目标已下发';
    $('plan-state').textContent = blocked ? '处理缺失的信息' : reviewing ? '核验后决定下一步' : '等待本段执行结果';
    $('work-title').textContent = blocked ? '停止局部循环' : reviewing ? '本段执行已结束' : 'JEV 选择下一动作';
    $('observation-text').textContent = blocked ? BLOCKED.obs : reviewing ? '把执行结果与最新观察交给慢模型' : STEPS[action].obs;
    $('decision-title').textContent = blocked ? 'JEV 选择返回' : 'JEV 候选选择';
    $('goal-step').textContent = `第 ${action + 1} / ${STEPS.length} 步`;
    blockButton.textContent = blocked ? '返回局部执行' : '遇阻时如何返回';
    theater.dataset.blocked = String(blocked);
    theater.dataset.phase = phase;
    paintBeads();
  }
  function renderChoices(picks, weights) {
    choiceBox.innerHTML = picks.map((text, i) => `<div class='choice-row' style='--i:${i}'>`
      + `<span class='choice-label'>${text}</span>`
      + `<strong class='choice-value'>${weights[i]}%</strong>`
      + `<span class='choice-track' aria-hidden='true'><i class='choice-bar' style='--w:0%'></i></span>`
      + '</div>').join('');
    const rows = [...choiceBox.children];
    const win = best(weights);
    choiceBox.style.setProperty('--cursor-y', `${Math.round(rows[win].offsetTop + rows[win].offsetHeight / 2)}px`);
    return { rows, win };
  }
  function finish(rows, win, picks) {
    applied = true;
    rows[win].classList.add('selected');
    selectedAction.textContent = blocked ? '返回慢模型' : picks[win];
    paintScreen(blocked ? currentStage() : STEPS[action].stage);
    receiptText.textContent = blocked ? BLOCKED.receipt : STEPS[action].receipt;
    receipt.classList.remove('flash');
    void receipt.offsetWidth;
    receipt.classList.add('flash');
    screen.classList.add('is-scan');
    later(400, () => receipt.classList.remove('flash'));
    later(660, () => screen.classList.remove('is-scan'));
    if (!playing) return;
    later(800, () => {
      if (!playing) return;
      if (action >= STEPS.length - 1) review();
      else { action += 1; frame(); }
    });
  }
  function frame() {
    clear();
    applied = false;
    const step = blocked ? BLOCKED : STEPS[action];
    paintChrome();
    paintPlay();
    paintScreen(blocked ? currentStage() : action === 0 ? 0 : STEPS[action - 1].stage);
    selectedAction.textContent = '评估候选中';
    selectionCaption.textContent = blocked ? '返回条件' : '本次选择';
    const { rows, win } = renderChoices(step.picks, step.weights);
    const fill = () => rows.forEach((row, i) => barOf(row).style.setProperty('--w', `${step.weights[i]}%`));
    if (reduced) { fill(); finish(rows, win, step.picks); return; }
    later(240, fill);
    later(940, () => {
      rows[win].classList.add('selected');
      selectedAction.textContent = blocked ? '返回慢模型' : step.picks[win];
      selectionCaption.textContent = blocked ? '返回条件' : 'JEV 已选';
    });
    later(1120, () => finish(rows, win, step.picks));
  }
  function review() {
    clear();
    playing = false;
    phase = 'review';
    paintChrome();
    paintPlay();
  }
  function play() {
    clear();
    started = true;
    blocked = false;
    if (phase === 'review') action = 0;
    phase = 'execution';
    playing = true;
    frame();
  }
  function pause() {
    clear();
    playing = false;
    screen.classList.remove('is-scan');
    paintPlay();
  }
  playButton.addEventListener('click', () => { if (playing) pause(); else play(); });
  $('loop-replay').addEventListener('click', () => { action = 0; play(); });
  blockButton.addEventListener('click', () => {
    started = true;
    playing = false;
    blocked = !blocked;
    phase = 'execution';
    frame();
  });
  beads.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const index = Number(button.dataset.action);
    if (!(index >= 0 && index < STEPS.length)) return;
    started = true;
    playing = false;
    blocked = false;
    phase = 'execution';
    action = index;
    frame();
  });
  new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) { if (playing) pause(); return; }
    if (!started && !reduced) play();
  }, { threshold: 0.35 }).observe(theater);
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
    clear();
    playing = false;
    paintPlay();
    if (boardInView) setPhase('idle');
  }
  media.addEventListener('change', applyMotion);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (boardInView) cycle();
      startIntro(false);
      return;
    }
    if (playing) pause();
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
    state: () => ({ route, phase, action, blocked, playing, owner, applied, boardPhase, intro, cameraLocked }),
  };
  readScroll();
  drawBoard();
  frame();
})();
