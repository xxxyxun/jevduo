'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const icon = (name) => `<svg class='ico' aria-hidden='true'><use href='#i-${name}'/></svg>`;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const ease = (value) => { value = clamp(value); return value * value * (3 - 2 * value); };
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const steps = [
    { name: '聚焦', obs: '定位零件搜索框', picks: ['展开左侧分类', '点击零件搜索框', '打开最近工程'], weights: [11, 82, 7], duration: 700, receipt: '读回焦点：零件搜索框已激活' },
    { name: '输入', obs: '输入指定零件编号', picks: ['修改工程名称', '重新打开零件库', '输入 64179'], weights: [5, 7, 88], duration: 1100, receipt: '读回字段：编号为 64179，搜索结果已更新' },
    { name: '选中', obs: '选择匹配的框架零件', picks: ['选中目标框架', '再次输入编号', '选择普通砖块'], weights: [79, 13, 8], duration: 750, receipt: '读回选中状态：目标框架已选中' },
    { name: '放置', obs: '移动到装配位置并放入', picks: ['切回搜索框', '放到指定装配位置', '重复选中框架'], weights: [9, 84, 7], duration: 1400, receipt: '动作反馈：框架已放入当前模块' },
    { name: '保存', obs: '保存模块工程', picks: ['关闭未保存工程', '重复放置框架', '保存当前工程'], weights: [4, 6, 90], duration: 900, receipt: '保存状态已更新，向慢模型回传结果' },
  ];
  const handoff = { picks: ['返回慢模型', '重复上次点击位置', '未确认就重放动作'], weights: [94, 4, 2] };
  const chooseMs = 450, holdMs = 320;
  const theater = $('execution-theater'), screen = $('mini-screen');
  const choiceBox = $('local-choice'), beads = $('action-beads'), playButton = $('loop-play');
  const field = $('mini-search-value');
  let action = 0, elapsed = 0, phase = 'execution';
  let playing = false, running = false, blocked = false, applied = false, started = false;
  let raf = 0, clock = 0, lastKey = '', rows = [], points;
  const duration = () => chooseMs + steps[action].duration + holdMs;
  const progress = () => clamp((elapsed - chooseMs) / steps[action].duration);
  const point = (selector) => {
    const host = screen.getBoundingClientRect(), box = $(selector).getBoundingClientRect();
    return { x: box.x - host.x + box.width / 2, y: box.y - host.y + box.height / 2, width: box.width };
  };
  function measure() {
    points = { search: point('mini-search'), card: point('library-target'), drop: point('drop-target'), save: point('app-save') };
    points.drop.x += 26; points.drop.y -= 20;
    points.start = { x: screen.clientWidth * .73, y: screen.clientHeight * .66 };
    lastKey = '';
    render();
  }
  function paintPlay() {
    playButton.innerHTML = icon(running ? 'pause' : 'play');
    playButton.setAttribute('aria-label', running ? '暂停执行流程' : '播放执行流程');
  }
  function paintChrome() {
    const key = `${action}:${phase}:${blocked}`;
    if (key === lastKey) return;
    lastKey = key;
    const step = blocked ? handoff : steps[action];
    $('slow-status').textContent = blocked ? '接收阻塞，调整子目标' : phase === 'review' ? '核验本段结果' : '子目标已下发';
    $('plan-state').textContent = blocked ? '处理缺失的信息' : phase === 'review' ? '核验回传结果' : '等待本段执行结果';
    $('work-title').textContent = blocked ? '局部执行已暂停' : '装配工作台';
    $('observation-text').textContent = blocked ? '保留现场并交还慢模型' : phase === 'review' ? '本段结果已回传' : steps[action].obs;
    $('goal-step').textContent = blocked || phase === 'review' ? '交还慢模型' : `JEV 连续执行 · ${steps[action].name}`;
    $('decision-title').textContent = blocked ? 'JEV 选择返回' : 'JEV 候选选择';
    $('loop-block').textContent = blocked ? '返回局部执行' : '遇阻时如何返回';
    theater.dataset.phase = phase;
    theater.dataset.blocked = String(blocked);
    choiceBox.innerHTML = step.picks.map((label, i) => `<div class='choice-row'><span class='choice-label'>${label}</span>`
      + `<strong class='choice-value'>${step.weights[i]}%</strong><span class='choice-track'><i class='choice-bar'></i></span></div>`).join('');
    rows = [...choiceBox.children];
    const winner = step.weights.indexOf(Math.max(...step.weights));
    choiceBox.style.setProperty('--cursor-y', `${rows[winner].offsetTop + rows[winner].offsetHeight / 2}px`);
    const focused = beads.contains(document.activeElement);
    beads.innerHTML = steps.map((item, i) => `<button class='bead ${phase === 'review' || i < action ? 'is-done' : i === action ? 'is-active' : ''}'`
      + ` data-action='${i}' aria-pressed='${i === action && phase !== 'review'}'><i aria-hidden='true'></i><span>${item.name}</span></button>`).join('');
    beads.style.setProperty('--done', phase === 'review' ? 1 : action / (steps.length - 1));
    if (focused) beads.querySelector(`[data-action='${action}']`).focus({ preventScroll: true });
  }
  function render() {
    paintChrome();
    const p = progress(), done = (index, at) => action > index || (action === index && p >= at);
    const focused = done(0, .72), filtered = done(1, .85), selected = done(2, .75);
    const placed = done(3, .88), saved = done(4, .7);
    const typing = action === 1 && elapsed >= chooseMs && p < .85;
    const typed = action < 1 ? '' : action > 1 ? '64179' : '64179'.slice(0, Math.floor(clamp((p - .12) / .58) * 5));
    field.value = typed;
    screen.dataset.state = [focused && 'focused', typing && 'typing', filtered && 'filtered', selected && 'selected', placed && 'placed', saved && 'saved'].filter(Boolean).join(' ');
    screen.dataset.blocked = String(blocked);
    screen.style.setProperty('--typed-chars', typed.length);
    $('library-target').querySelector('strong').textContent = filtered ? '64179' : '常用零件';
    $('app-file-state').textContent = saved ? '已保存' : '尚未保存';
    $('mini-canvas-status').textContent = saved ? '保存完成' : placed ? '框架已放置' : selected ? '框架已选中' : filtered ? '找到 64179' : focused ? '搜索框已聚焦' : '装配工作区';
    $('app-operation').textContent = blocked ? '交还慢模型' : phase === 'review' ? '等待核验' : applied ? '观察已更新' : !running ? started ? '已暂停' : '等待执行' : elapsed < chooseMs ? 'JEV 选择' : `${steps[action].name}中`;
    const choices = blocked ? handoff : steps[action];
    const winner = choices.weights.indexOf(Math.max(...choices.weights));
    const decided = blocked || elapsed >= chooseMs;
    rows.forEach((row, i) => {
      row.querySelector('.choice-bar').style.setProperty('--w', `${choices.weights[i] * (blocked ? 1 : clamp(elapsed / chooseMs))}%`);
      row.classList.toggle('selected', decided && i === winner);
    });
    $('selected-action').textContent = decided ? choices.picks[winner] : '评估候选中';
    $('selection-caption').textContent = blocked ? '返回条件' : decided ? 'JEV 已选' : '本次选择';
    $('receipt-text').textContent = blocked ? '保留当前观察与缺失目标信息，不重放无效动作' : phase === 'review' ? '将本段执行结果与最新观察交还慢模型核验' : applied ? steps[action].receipt : decided ? '执行所选动作，随后读取反馈' : '等待 JEV 选择下一动作';
    if (!points) return;
    const from = [points.start, points.search, points.search, points.card, points.drop][action];
    const to = [points.search, points.search, points.card, points.drop, points.save][action];
    const travel = ease(p / (action === 3 ? .88 : .65));
    const x = from.x + (to.x - from.x) * travel, y = from.y + (to.y - from.y) * travel;
    screen.style.setProperty('--cursor-x', `${x}px`);
    screen.style.setProperty('--cursor-y', `${y}px`);
    screen.style.setProperty('--tap', blocked || action === 1 ? 0 : Math.sin(clamp((p - .67) / .3) * Math.PI));
    screen.dataset.carrying = String(!blocked && action === 3 && elapsed >= chooseMs && p < .88);
    screen.style.setProperty('--drag-x', `${x - 26}px`);
    screen.style.setProperty('--drag-y', `${y + 20}px`);
    screen.style.setProperty('--drag-w', `${points.card.width * .85 + (points.drop.width - points.card.width * .85) * travel}px`);
  }
  function tick(now) {
    raf = 0;
    if (!running) return;
    if (clock) elapsed = Math.min(duration(), elapsed + Math.min(120, now - clock));
    clock = now;
    applied = elapsed >= duration();
    render();
    if (applied) {
      if (!playing) { running = false; paintPlay(); return; }
      if (action === steps.length - 1) {
        phase = 'review'; running = playing = false; render(); paintPlay(); return;
      }
      action += 1; elapsed = 0; applied = false;
    }
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    running = playing = false;
    cancelAnimationFrame(raf); raf = 0; clock = 0;
    render(); paintPlay();
  }
  function play() {
    started = true; blocked = false;
    if (phase === 'review') { action = 0; elapsed = 0; }
    else if (applied && action < steps.length - 1) { action += 1; elapsed = 0; }
    phase = 'execution'; playing = running = true; clock = 0; applied = false;
    if (media.matches) {
      action = steps.length - 1; elapsed = duration(); phase = 'review'; applied = true; running = playing = false;
    } else if (!raf) raf = requestAnimationFrame(tick);
    render(); paintPlay();
  }
  function preview(index) {
    pause(); started = true; action = index; phase = 'execution'; blocked = false; elapsed = 0; applied = false;
    if (media.matches) { elapsed = duration(); applied = true; }
    else { running = true; raf = requestAnimationFrame(tick); }
    render(); paintPlay();
  }
  playButton.addEventListener('click', () => running ? pause() : play());
  $('loop-replay').addEventListener('click', () => { pause(); phase = 'review'; play(); });
  $('loop-block').addEventListener('click', () => { pause(); started = true; blocked = !blocked; applied = blocked || elapsed >= duration(); render(); });
  beads.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) preview(Number(button.dataset.action));
  });
  new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) { if (running) pause(); return; }
    if (!started && !media.matches) play();
  }, { threshold: .3 }).observe(theater);
  new ResizeObserver(measure).observe(screen);
  media.addEventListener('change', () => { if (media.matches) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.JevDuoExecution = { state: () => ({ phase, action, blocked, playing, running, applied, elapsed,
    actionProgress: progress(), typed: field.value, carrying: screen.dataset.carrying === 'true' }) };
  measure(); paintPlay();
})();
