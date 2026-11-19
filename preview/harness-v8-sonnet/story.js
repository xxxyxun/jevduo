'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const icon = name => `<svg aria-hidden='true'><use href='#i-${name}'/></svg>`;
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const clamp = value => Math.max(0, Math.min(1, value));
  const NS = 'http://www.w3.org/2000/svg';

  const opening = $('opening');
  const stage = document.querySelector('.assembly-stage');
  const slot = $('architecture-model-slot');
  const board = $('architecture-board');
  const theater = $('execution-theater');
  const wireLayer = $('arch-wires');
  const wireSvg = document.querySelector('.architecture-wires');
  const header = document.querySelector('.header');
  const poster = document.querySelector('.assembly-poster');

  const actions = [
    { label: '聚焦', observation: '搜索框已出现在当前观察中', choices: ['展开其他分类', '点击零件搜索框', '返回慢模型'], weights: [.11, .82, .07], receipt: '读回焦点：搜索框已激活' },
    { label: '输入', observation: '搜索框已激活，零件编号已由慢模型提供', choices: ['修改工程名称', '重新打开零件库', '输入 64179'], weights: [.05, .07, .88], receipt: '读回字段：输入值为 64179' },
    { label: '选择', observation: '搜索结果已更新，目标框架可见', choices: ['选中目标框架', '再次输入编号', '选择普通砖块'], weights: [.79, .13, .08], receipt: '读回选中状态：目标框架已选中' },
    { label: '放置', observation: '目标框架已选中，可以放入当前工程', choices: ['切回搜索框', '放到指定装配位置', '重复选中框架'], weights: [.09, .84, .07], receipt: '动作回执：框架已放入装配区' },
    { label: '保存', observation: '本段装配已完成，等待保存', choices: ['关闭未保存工程', '重复放置框架', '保存当前工程'], weights: [.04, .06, .90], receipt: '保存回执与最新观察已返回' },
  ];
  const routes = ['gui', 'cli', 'extension'];

  let viewer = null;
  let owner = 'hero';
  let heroVisible = true;
  let introAge = reduced ? 7600 : 0;
  let introFraction = reduced ? 1 : 0;
  let introFrame = 0;
  let lastIntro = 0;
  let manualCamera = false;
  let route = 'gui';
  let bridgeProgress = 0;
  let phase = 'execution';
  let action = 0;
  let blocked = false;
  let playing = false;
  let loopTimer = null;
  let loopStarted = false;

  function marker(id, color) {
    if (!wireSvg || document.getElementById(id)) return;
    const defs = wireSvg.querySelector('defs');
    if (!defs) return;
    const node = document.createElementNS(NS, 'marker');
    node.setAttribute('id', id);
    node.setAttribute('viewBox', '0 0 8 8');
    node.setAttribute('refX', '7');
    node.setAttribute('refY', '4');
    node.setAttribute('markerWidth', '6');
    node.setAttribute('markerHeight', '6');
    node.setAttribute('orient', 'auto');
    const head = document.createElementNS(NS, 'path');
    head.setAttribute('d', 'm1 1 6 3-6 3Z');
    head.setAttribute('stroke', 'none');
    head.style.fill = color;
    node.appendChild(head);
    defs.appendChild(node);
  }

  function ortho(points, radius) {
    const pts = points.filter((point, index) => !index || Math.abs(point[0] - points[index - 1][0]) + Math.abs(point[1] - points[index - 1][1]) > 1.5);
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], corner = pts[i], next = pts[i + 1];
      const a = Math.hypot(corner[0] - prev[0], corner[1] - prev[1]);
      const b = Math.hypot(next[0] - corner[0], next[1] - corner[1]);
      if (a < 2 || b < 2) {
        d += 'L' + corner[0] + ' ' + corner[1];
        continue;
      }
      const r = Math.min(radius, a / 2, b / 2);
      const ux = (corner[0] - prev[0]) / a, uy = (corner[1] - prev[1]) / a;
      const vx = (next[0] - corner[0]) / b, vy = (next[1] - corner[1]) / b;
      d += 'L' + (corner[0] - ux * r).toFixed(1) + ' ' + (corner[1] - uy * r).toFixed(1);
      d += 'Q' + corner[0] + ' ' + corner[1] + ' ' + (corner[0] + vx * r).toFixed(1) + ' ' + (corner[1] + vy * r).toFixed(1);
    }
    const end = pts[pts.length - 1];
    d += 'L' + end[0] + ' ' + end[1];
    return d;
  }

  function wire(points, cls, hook) {
    const head = hook ? `marker-end:url(#${hook})` : 'marker-end:none';
    return `<path class='arch-wire ${cls}' style='${head}' d='${ortho(points, 10)}'/>`;
  }

  function drawArchitecture() {
    if (!wireSvg || !wireLayer) return;
    if (innerWidth < 1000) {
      wireLayer.innerHTML = '';
      wireSvg.style.display = 'none';
      return;
    }
    wireSvg.style.display = '';
    marker('arch-arrow-fast', '#b6462a');
    marker('arch-arrow-slow', '#3f4590');
    const frame = wireSvg.getBoundingClientRect();
    if (frame.width < 60 || frame.height < 60) return;
    wireSvg.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
    const ox = frame.left, oy = frame.top;
    const box = target => {
      const el = typeof target === 'string' ? $(target) : target;
      const r = el.getBoundingClientRect();
      return {
        x: r.left - ox, y: r.top - oy, w: r.width, h: r.height,
        cx: r.left - ox + r.width / 2, cy: r.top - oy + r.height / 2,
        right: r.right - ox, bottom: r.bottom - oy,
      };
    };
    const planHost = document.querySelector('.arch-planning');
    if (!planHost) return;
    const plan = box(planHost);
    const slow = box('arch-slow');
    const goal = box('arch-goal');
    const router = box('arch-router');
    const lanes = ['arch-jev', 'arch-cli', 'arch-extension'].map(box);
    const runtime = box('arch-runtime');
    const evidence = box('arch-evidence');
    const index = Math.max(0, routes.indexOf(route));
    const selected = lanes[index];
    const parts = [];

    const joinX = goal.right + Math.max(12, (router.x - goal.right) * 0.55);
    parts.push(wire([[goal.right + 3, goal.cy], [joinX, goal.cy], [joinX, router.cy], [router.x - 3, router.cy]], '', 'arch-arrow'));

    const busX = router.right + Math.max(12, (lanes[0].x - router.right) * 0.55);
    parts.push(wire([[router.right + 3, router.cy], [busX, router.cy]], '', ''));
    parts.push(wire([[busX, lanes[0].cy], [busX, lanes[2].cy]], '', ''));
    lanes.forEach((lane, i) => {
      const active = i === index;
      parts.push(wire([[busX, lane.cy], [lane.x - 3, lane.cy]], active ? 'active' : '', active ? 'arch-arrow-fast' : 'arch-arrow'));
    });

    const laneRight = Math.max(...lanes.map(lane => lane.right));
    const outward = laneRight + (frame.width - laneRight) * .34;
    parts.push(wire([[selected.right + 3, selected.cy - 9], [outward, selected.cy - 9],
      [outward, runtime.cy - 9], [runtime.right + 3, runtime.cy - 9]], 'active', 'arch-arrow-fast'));
    if (route === 'gui') {
      const back = laneRight + (frame.width - laneRight) * .72;
      parts.push(wire([[runtime.right + 3, runtime.cy + 12], [back, runtime.cy + 12],
        [back, selected.cy + 12], [selected.right + 3, selected.cy + 12]], 'local', 'arch-arrow-fast'));
    }

    parts.push(wire([[evidence.cx, runtime.bottom + 3], [evidence.cx, evidence.y - 3]], '', 'arch-arrow'));

    const gutter = Math.max(10, plan.x - 18);
    parts.push(wire([[evidence.x - 3, evidence.cy], [gutter, evidence.cy], [gutter, slow.cy], [plan.x - 2, slow.cy]], 'return', 'arch-arrow-slow'));

    wireLayer.innerHTML = parts.join('');
  }

  board.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => {
    route = button.dataset.route;
    board.dataset.route = route;
    board.querySelectorAll('[data-route]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    const label = button.querySelector('strong');
    if (label) $('router-selection').textContent = label.textContent;
    board.querySelectorAll('[data-lane]').forEach(item => item.classList.toggle('active', item.dataset.lane === route));
    drawArchitecture();
  }));

  if (window.ResizeObserver) new ResizeObserver(drawArchitecture).observe(board);
  addEventListener('resize', drawArchitecture);
  addEventListener('load', drawArchitecture);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawArchitecture);

  function renderLoop() {
    const item = actions[action];
    const decided = phase !== 'goal';
    const choices = blocked ? ['返回慢模型补充观察', '重复点击上次位置', '未确认就重放动作'] : item.choices;
    const weights = blocked ? [.94, .04, .02] : item.weights;
    let winner = 0;
    weights.forEach((weight, i) => { if (weight > weights[winner]) winner = i; });

    theater.dataset.phase = phase;
    theater.dataset.blocked = String(blocked);
    document.querySelectorAll('.execution-flow [data-phase]').forEach(node => node.classList.toggle('active', node.dataset.phase === phase));

    $('slow-status').textContent = blocked ? '接收阻塞，调整子目标' : phase === 'goal' ? '下发一个子目标' : phase === 'review' ? '核验本段结果' : '子目标已下发';
    $('plan-state').textContent = blocked ? '处理当前缺失的信息' : phase === 'review' ? '核验后决定下一步' : '等待本段执行结果';
    $('work-title').textContent = blocked ? '停止局部循环' : phase === 'goal' ? '接收子目标与输入' : phase === 'review' ? '本段执行已结束' : 'JEV 选择下一动作';
    $('observation-text').textContent = blocked ? '目标控件未出现在当前候选中' : phase === 'goal' ? '目标、输入与返回条件已明确' : phase === 'review' ? '把执行结果与最新观察交给慢模型' : item.observation;
    $('decision-title').textContent = blocked ? 'JEV 选择返回' : 'JEV 候选选择';
    $('receipt-text').textContent = blocked ? '保留当前状态，返回缺失控件与最后观察' : phase === 'goal' ? '收到子目标后，开始本段 GUI 操作' : item.receipt;
    $('goal-step').textContent = `第 ${Math.min(actions.length, action + 1)} / ${actions.length} 步`;

    $('local-choice').innerHTML = choices.map((text, i) => {
      const pct = decided ? Math.round(weights[i] * 100) : 0;
      return `<div class='choice-row${decided && i === winner ? ' selected' : ''}' data-weight='${pct}'>`
        + `<span class='choice-label'>${text}</span>`
        + `<strong class='choice-value'>${decided ? pct + '%' : '—'}</strong>`
        + `<span class='choice-track' aria-hidden='true'><i class='choice-bar' style='--score:${pct}%'></i></span>`
        + '</div>';
    }).join('');

    $('selection-caption').textContent = decided ? 'JEV 已选' : '等待观察';
    $('selected-action').textContent = decided ? choices[winner] : '接收子目标与输入';
    const seal = document.querySelector('.selection-result>svg');
    if (seal) seal.style.visibility = decided ? 'visible' : 'hidden';

    $('action-beads').innerHTML = actions.map((entry, i) => {
      const state = (phase === 'review' && !blocked) || i < action ? 'done' : i === action && phase === 'execution' ? 'active' : '';
      return `<button class='action-bead ${state}' data-action='${i}' aria-pressed='${i === action}'>${entry.label}</button>`;
    }).join('');

    $('mini-search').classList.toggle('focused', phase === 'execution' && action < 2);
    $('mini-search-value').textContent = action > 0 ? '64179' : '零件编号';
    $('mini-parts').classList.toggle('visible', action > 0);
    $('mini-parts').classList.toggle('chosen', action > 1);
    $('placed-part').classList.toggle('visible', action > 2);
    $('saved-mark').classList.toggle('visible', action === 4 && !blocked);
    $('mini-canvas-status').textContent = action > 2 ? '框架已放入工程' : '当前工程';

    $('loop-block').innerHTML = icon('refresh') + (blocked ? '返回局部执行' : '遇阻时如何返回');
    $('loop-play').innerHTML = playing ? 'Ⅱ' : icon('play');
    $('loop-play').setAttribute('aria-label', playing ? '暂停执行流程' : '播放执行流程');
  }

  function pauseLoop() {
    clearTimeout(loopTimer);
    playing = false;
    renderLoop();
  }

  function advanceLoop() {
    if (!playing || blocked || document.hidden) return;
    if (phase === 'goal') phase = 'execution';
    else if (action === actions.length - 1) {
      phase = 'review';
      pauseLoop();
      return;
    } else action++;
    renderLoop();
    loopTimer = setTimeout(advanceLoop, 1350);
  }

  function playLoop() {
    clearTimeout(loopTimer);
    loopStarted = true;
    if (blocked || phase === 'review') {
      blocked = false;
      action = 0;
      phase = 'goal';
    }
    playing = true;
    renderLoop();
    loopTimer = setTimeout(advanceLoop, phase === 'goal' ? 900 : 1350);
  }

  $('action-beads').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    loopStarted = true;
    action = +button.dataset.action;
    phase = 'execution';
    blocked = false;
    pauseLoop();
  });

  $('loop-play').onclick = () => playing ? pauseLoop() : playLoop();

  $('loop-replay').onclick = () => {
    clearTimeout(loopTimer);
    action = 0;
    blocked = false;
    playing = false;
    phase = reduced ? 'execution' : 'goal';
    if (reduced) renderLoop();
    else playLoop();
  };

  $('loop-block').onclick = () => {
    loopStarted = true;
    blocked = !blocked;
    phase = blocked ? 'review' : 'execution';
    pauseLoop();
  };

  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) {
      if (playing) pauseLoop();
      return;
    }
    if (!loopStarted && !reduced) {
      loopStarted = true;
      phase = 'goal';
      playLoop();
    }
  }, { threshold: .35 }).observe(theater);

  function scheduleIntro() {
    if (!introFrame) introFrame = requestAnimationFrame(paintIntro);
  }

  function paintIntro(now) {
    introFrame = 0;
    if (!viewer || owner !== 'hero' || !heroVisible || document.hidden) {
      lastIntro = 0;
      return;
    }
    const elapsed = lastIntro ? Math.min(now - lastIntro, 1000) : 0;
    lastIntro = now;
    if (!reduced && introFraction < 1) {
      introAge = Math.min(7600, introAge + elapsed);
      introFraction = clamp(introAge / 7600);
      viewer.seek(180 * introFraction);
    }
    if (!manualCamera) {
      const mount = $('hero-model-mount');
      const aspect = Math.min(mount.clientWidth, innerWidth) / Math.max(1, mount.clientHeight);
      const fit = Math.max(1, 1.5 / Math.max(.6, aspect));
      const dock = reduced ? 0 : clamp(bridgeProgress);
      const walk = reduced ? 1 : introFraction;
      viewer.setCamera({
        yaw: (-1.27 + walk * .08) * (1 - dock) + (-1.04) * dock,
        elevation: (.8 - walk * .12) * (1 - dock) + .52 * dock,
        radius: ((.64 - walk * .04) * fit) * (1 - dock) + (.56 * fit) * dock,
        target: [-.06, .015, .02],
      });
    }
    if (introFraction < 1) introFrame = requestAnimationFrame(paintIntro);
  }

  async function initScene() {
    try {
      if (!window.gearboxData) {
        const response = await fetch(document.documentElement.dataset.assets + 'model.json');
        window.gearboxData = await response.json();
      }
      viewer = window.GearboxViewer.create($('hero-model-mount'), {
        theme: 'atlas',
        onUpdate: state => window.dispatchEvent(new CustomEvent('gearbox-update', { detail: state })),
      });
      viewer.renderer.toneMappingExposure = 1.04;
      viewer.canvas.setAttribute('aria-label', '拖动旋转装配模型');
      viewer.scene.children.filter(node => node.isLight).forEach(light => {
        if (light.isHemisphereLight) light.intensity = 1.7;
        else if (light.castShadow) {
          light.intensity = 3.4;
          light.shadow.mapSize.set(2048, 2048);
        } else light.intensity *= .82;
      });
      viewer.setMode('assembly');
      viewer.play(false);
      viewer.seek(reduced ? 180 : 0);
      viewer.setCamera({ yaw: -1.27, elevation: .8, radius: .64 });
      const loading = $('hero-model-loading');
      if (loading) loading.remove();
      if (poster) poster.style.opacity = 0;
      viewer.canvas.addEventListener('pointerdown', () => { manualCamera = true; });
      introAge = reduced ? 7600 : 0;
      introFraction = reduced ? 1 : 0;
      readScroll();
      scheduleIntro();
      return viewer;
    } catch (error) {
      const loading = $('hero-model-loading');
      if (loading) loading.textContent = '场景暂未加载。';
      return null;
    }
  }

  function mountResult() {
    if (!viewer || owner === 'result') return;
    owner = 'result';
    viewer.play(false);
    viewer.moveTo($('model-mount'));
    viewer.setMode('motion');
    viewer.setView('overall');
    const loading = $('model-loading');
    if (loading) loading.remove();
    if (poster) poster.style.opacity = 1;
  }

  function mountHero() {
    if (!viewer || owner === 'hero') return;
    owner = 'hero';
    manualCamera = false;
    introAge = 7600;
    introFraction = 1;
    viewer.play(false);
    viewer.moveTo($('hero-model-mount'));
    viewer.setMode('assembly');
    viewer.seek(180);
    if (poster) poster.style.opacity = 0;
    scheduleIntro();
  }

  const ready = initScene().catch(() => {
    const loading = $('hero-model-loading');
    if (loading) loading.textContent = '场景暂未加载。';
    return null;
  });

  new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    if (heroVisible) ready.then(() => { mountHero(); scheduleIntro(); });
    else lastIntro = 0;
  }).observe(opening);

  function readScroll() {
    if (header) header.classList.toggle('scrolled', scrollY > 24);
    if (reduced || !stage || !slot) return;
    const root = opening.getBoundingClientRect();
    const target = slot.getBoundingClientRect();
    const targetY = target.top - root.top + target.height / 2;
    bridgeProgress = clamp(-root.top / Math.max(1, targetY - innerHeight * .34));
    const eased = bridgeProgress * bridgeProgress * (3 - 2 * bridgeProgress);
    const scale = Math.min(target.width / stage.offsetWidth, target.height / stage.offsetHeight);
    const crop = Math.max(0, (1 - target.height / (stage.offsetHeight * scale)) * 50);
    const x = target.left - root.left + target.width / 2 - stage.offsetLeft - stage.offsetWidth / 2;
    const y = targetY - stage.offsetTop - stage.offsetHeight / 2;
    const height = stage.offsetHeight * (1 + (scale - 1) * eased);
    const bottom = root.top + stage.offsetTop + stage.offsetHeight / 2 + y * eased + height / 2;
    const clipBottom = Math.max(crop * eased, 100 * clamp((bottom - board.getBoundingClientRect().top + 16) / height));
    stage.style.transform = `translate(${x * eased}px,${y * eased}px) scale(${1 + (scale - 1) * eased})`;
    stage.style.clipPath = `inset(${crop * eased}% 0 ${clipBottom}% 0)`;
    if (viewer && owner === 'hero' && bridgeProgress * 7600 > introAge) {
      introAge = bridgeProgress * 7600;
      introFraction = clamp(introAge / 7600);
      viewer.seek(180 * introFraction);
    }
    if (owner === 'hero') scheduleIntro();
  }

  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', readScroll);

  document.addEventListener('visibilitychange', () => {
    lastIntro = 0;
    if (document.hidden) {
      pauseLoop();
      if (viewer) viewer.play(false);
    } else {
      scheduleIntro();
    }
  });

  if (!reduced) {
    document.documentElement.classList.add('motion-enabled');
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('revealed');
      reveal.unobserve(entry.target);
    }), { threshold: .1 });
    document.querySelectorAll('.section-heading:not(.architecture-heading), .result-copy, .closing').forEach(node => {
      node.dataset.reveal = '';
      reveal.observe(node);
    });
  }

  renderLoop();
  readScroll();
  drawArchitecture();

  window.JevDuoScene = {
    ready,
    mountResult,
    get viewer() { return viewer; },
    state: () => ({ route, phase, action, blocked, playing, owner, introFraction, manualCamera, bridgeProgress }),
  };
})();
