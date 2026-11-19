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
  const stops = [...$('arch-runtime').querySelectorAll('.runtime-stops > li')];
  /* 三维装配：一个 viewer 在开场与结果之间迁移 */
  let viewer = null;
  let owner = 'hero';
  let heroIn = true;
  let intro = 0;
  let introRaf = 0;
  let introClock = 0;
  let cameraLocked = false;
  function heroCamera(walk) {
    if (!viewer) return;
    const aspect = Math.min(heroMount.clientWidth, innerWidth) / Math.max(1, heroMount.clientHeight);
    const fit = Math.max(1, 1.5 / Math.max(0.6, aspect));
    viewer.setCamera({
      yaw: -1.27 + walk * 0.08,
      elevation: 0.8 - walk * 0.12,
      radius: (0.64 - walk * 0.04) * fit,
      target: [-0.06, 0.015, 0.02],
    });
  }
  function introTick(now) {
    introRaf = 0;
    if (!viewer || owner !== 'hero' || !heroIn || document.hidden) { introClock = 0; return; }
    if (!introClock) introClock = now;
    const step = Math.min(1000, now - introClock);
    introClock = now;
    if (intro < 1) { intro = clamp01(intro + step / 7600); viewer.seek(180 * intro); }
    if (!cameraLocked) heroCamera(intro);
    if (intro < 1) introRaf = requestAnimationFrame(introTick);
  }
  function startIntro(reset) {
    if (!viewer || owner !== 'hero') return;
    if (reduced) { intro = 1; viewer.seek(180); heroCamera(1); return; }
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
      viewer.seek(0);
      viewer.setCamera({ yaw: -1.27, elevation: 0.8, radius: 0.64 });
      viewer.canvas.setAttribute('aria-label', '拖动旋转装配模型');
      viewer.canvas.addEventListener('pointerdown', () => { cameraLocked = true; }, { passive: true });
      const loading = $('hero-model-loading');
      if (loading) loading.remove();
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
  const ROUTES = ['gui', 'cli', 'extension'];
  const DUR = { routing: 1100, executing: 2300, returning: 1300, idle: 3000 };
  const FLOW = {
    routing: [['goal', 0, 0.62], ['dispatch', 0.34, 1]],
    executing: [['run', 0, 1]],
    returning: [['back', 0, 1]],
  };
  let route = 'gui';
  let boardPhase = 'idle';
  let boardInView = false;
  let boardTimer = 0;
  let phaseAt = 0;
  let pulseRaf = 0;
  let frameRect = null;
  let wireMap = {};
  let stopTimers = [];
  const dots = [0, 1, 2].map(() => {
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '3');
    dot.style.opacity = '0';
    pulseLayer.appendChild(dot);
    return dot;
  });
  const n1 = (v) => Math.round(v * 10) / 10;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left - frameRect.left;
    const y = r.top - frameRect.top;
    return { x, y, right: x + r.width, bottom: y + r.height, cx: x + r.width / 2, cy: y + r.height / 2 };
  };
  const hc = (x1, y1, x2, y2) => {
    const dx = (x2 - x1) * 0.55;
    return `M${n1(x1)} ${n1(y1)}C${n1(x1 + dx)} ${n1(y1)} ${n1(x2 - dx)} ${n1(y2)} ${n1(x2)} ${n1(y2)}`;
  };
  const vc = (x1, y1, x2, y2) => {
    const dy = (y2 - y1) * 0.5;
    return `M${n1(x1)} ${n1(y1)}C${n1(x1)} ${n1(y1 + dy)} ${n1(x2)} ${n1(y2 - dy)} ${n1(x2)} ${n1(y2)}`;
  };
  function dress() {
    const live = boardPhase === 'routing' || boardPhase === 'executing';
    ['goal', 'dispatch', 'run'].forEach((key) => {
      if (wireMap[key]) wireMap[key].classList.toggle('is-active', live);
    });
    if (wireMap.back) wireMap.back.classList.toggle('is-return', boardPhase === 'returning');
  }
  function drawBoard() {
    if (innerWidth < 960 || board.clientWidth < 560) {
      wireSvg.style.display = 'none';
      wireLayer.innerHTML = '';
      wireMap = {};
      board.style.setProperty('--beam', '0deg');
      return;
    }
    wireSvg.style.display = '';
    frameRect = wireSvg.getBoundingClientRect();
    if (frameRect.width < 60) return;
    wireSvg.setAttribute('viewBox', `0 0 ${frameRect.width} ${frameRect.height}`);
    const input = box($('arch-input'));
    const planner = box($('arch-slow'));
    const router = box($('arch-router'));
    const gate = box(gates[Math.max(0, ROUTES.indexOf(route))]);
    const runtime = box($('arch-runtime'));
    const out = frameRect.width + 26;
    const back = -18;
    const paths = {
      input: vc(input.cx, input.bottom, planner.cx, planner.y),
      goal: hc(planner.right, planner.cy, router.x, router.cy),
      dispatch: hc(router.right, router.cy, gate.x - 3, gate.cy),
      run: `M${n1(gate.right)} ${n1(gate.cy)}C${n1(out)} ${n1(gate.cy)} ${n1(out)} ${n1(runtime.cy)} ${n1(runtime.right - 1)} ${n1(runtime.cy)}`,
      back: `M${n1(runtime.x - 2)} ${n1(runtime.cy)}C${n1(back)} ${n1(runtime.cy)} ${n1(back)} ${n1(planner.cy)} ${n1(planner.x - 2)} ${n1(planner.cy)}`,
    };
    wireLayer.innerHTML = Object.keys(paths).map((key) => `<path id='w-${key}' d='${paths[key]}'/>`).join('');
    wireMap = {};
    wireLayer.querySelectorAll('path').forEach((path) => { wireMap[path.id.slice(2)] = path; });
    const angle = Math.atan2(gate.cy - router.cy, gate.cx - router.cx) * 180 / Math.PI;
    board.style.setProperty('--beam', `${angle.toFixed(1)}deg`);
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
      stops.forEach((stop, i) => stopTimers.push(setTimeout(() => stop.classList.add('is-lit'), 260 + i * 560)));
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
    setPhase('routing');
    boardTimer = setTimeout(() => {
      setPhase('executing');
      boardTimer = setTimeout(() => {
        setPhase('returning');
        boardTimer = setTimeout(() => {
          setPhase('idle');
          boardTimer = setTimeout(cycle, DUR.idle);
        }, DUR.returning);
      }, DUR.executing);
    }, DUR.routing);
  }
  gates.forEach((gate) => gate.addEventListener('click', () => {
    route = gate.dataset.route;
    board.dataset.route = route;
    gates.forEach((item) => item.setAttribute('aria-pressed', String(item === gate)));
    const label = gate.querySelector('strong');
    if (label) $('router-selection').textContent = label.textContent;
    drawBoard();
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
  addEventListener('resize', () => { readScroll(); drawBoard(); }, { passive: true });
  addEventListener('load', () => drawBoard());
  document.fonts.ready.then(() => drawBoard());
  window.JevDuoScene = {
    ready,
    mountResult,
    get viewer() { return viewer; },
    state: () => ({ route, phase, action, blocked, playing, owner, applied, boardPhase, intro, cameraLocked }),
  };
  readScroll();
  drawBoard();
  frame();
})();
