'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

  /* ═══ 一 · 几何：整个工作台共用一个等轴测投影 ═══
     屏幕 X = (x − y)·cos30 ；屏幕 Y = (x + y)/2 − z
     零件、吸附位、拖拽体、底板全部由同一函数算出。 */
  const K = Math.sqrt(3) / 2;
  const iso = (x, y, z) => [(x - y) * K, (x + y) / 2 - z];
  const n2 = (v) => Math.round(v * 100) / 100;
  const xy = (pts) => pts.map((p) => n2(p[0]) + ',' + n2(p[1])).join('L');
  const poly = (pts) => 'M' + xy(pts) + 'Z';
  const attr = (pts) => pts.map((p) => n2(p[0]) + ',' + n2(p[1])).join(' ');
  const box = (pts) => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    pts.forEach((p) => {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    });
    return [x0, y0, x1 - x0, y1 - y0];
  };
  const pad = (b, n) => [b[0] - n, b[1] - n, b[2] + n * 2, b[3] + n * 2];

  const PART = { lx: 85, ly: 48, hx: 61, hy: 28, t: 12 };
  const DECK = { lx: 120, ly: 84, t: 16 };

  function buildScene() {
    const oT = [[-PART.lx, -PART.ly, PART.t], [PART.lx, -PART.ly, PART.t],
      [PART.lx, PART.ly, PART.t], [-PART.lx, PART.ly, PART.t]].map((p) => iso(p[0], p[1], p[2]));
    const oB = [[-PART.lx, -PART.ly, 0], [PART.lx, -PART.ly, 0],
      [PART.lx, PART.ly, 0], [-PART.lx, PART.ly, 0]].map((p) => iso(p[0], p[1], p[2]));
    const hT = [[-PART.hx, -PART.hy, PART.t], [PART.hx, -PART.hy, PART.t],
      [PART.hx, PART.hy, PART.t], [-PART.hx, PART.hy, PART.t]].map((p) => iso(p[0], p[1], p[2]));
    const faceX = [iso(PART.lx, -PART.ly, PART.t), iso(PART.lx, PART.ly, PART.t),
      iso(PART.lx, PART.ly, 0), iso(PART.lx, -PART.ly, 0)];
    const faceY = [iso(-PART.lx, PART.ly, PART.t), iso(PART.lx, PART.ly, PART.t),
      iso(PART.lx, PART.ly, 0), iso(-PART.lx, PART.ly, 0)];
    const wallX = [iso(-PART.hx, -PART.hy, PART.t), iso(-PART.hx, PART.hy, PART.t),
      iso(-PART.hx, PART.hy, 0), iso(-PART.hx, -PART.hy, 0)];
    const wallY = [iso(-PART.hx, -PART.hy, PART.t), iso(PART.hx, -PART.hy, PART.t),
      iso(PART.hx, -PART.hy, 0), iso(-PART.hx, -PART.hy, 0)];
    const ring = poly(oT) + poly(hT);

    const holes = [];
    [-54, 0, 54].forEach((x) => {
      [-38, 38].forEach((y) => {
        const c = iso(x, y, PART.t);
        holes.push(`<ellipse cx="${n2(c[0])}" cy="${n2(c[1])}" rx="${n2(7 * K * Math.SQRT2)}" ry="${n2(7 * Math.SQRT2 / 2)}" fill="#ac9d83"/>`);
      });
    });

    const partMarkup =
      `<path d="${poly(wallX)}" fill="#a99a80"/>`
      + `<path d="${poly(wallY)}" fill="#b5a68c"/>`
      + `<path d="${poly(faceY)}" fill="#bfb094"/>`
      + `<path d="${poly(faceX)}" fill="#d3c4a9"/>`
      + `<path d="${ring}" fill="#efe5d2" fill-rule="evenodd"/>`
      + `<path d="${poly(oT)}" fill="none" stroke="#ccbca1" stroke-width="1.2"/>`
      + `<path d="M${n2(oT[3][0])} ${n2(oT[3][1])}L${n2(oT[0][0])} ${n2(oT[0][1])}" fill="none" stroke="#fdf8ef" stroke-width="1.6" stroke-linecap="round"/>`
      + holes.join('');

    const ghostMarkup = `<path d="${ring}" fill="currentColor" fill-opacity=".13" stroke="currentColor"`
      + ` stroke-width="2.4" stroke-dasharray="9 7" stroke-linejoin="round" fill-rule="evenodd"/>`;

    const PART_VB = pad(box([...oT, ...oB]), 4);

    const dTop = [[-DECK.lx, -DECK.ly, 0], [DECK.lx, -DECK.ly, 0],
      [DECK.lx, DECK.ly, 0], [-DECK.lx, DECK.ly, 0]].map((p) => iso(p[0], p[1], p[2]));
    const dLeft = [iso(-DECK.lx, DECK.ly, 0), iso(DECK.lx, DECK.ly, 0),
      iso(DECK.lx, DECK.ly, -DECK.t), iso(-DECK.lx, DECK.ly, -DECK.t)];
    const dRight = [iso(DECK.lx, -DECK.ly, 0), iso(DECK.lx, DECK.ly, 0),
      iso(DECK.lx, DECK.ly, -DECK.t), iso(DECK.lx, -DECK.ly, -DECK.t)];
    const grid = [];
    [-60, 0, 60].forEach((x) => {
      const a = iso(x, -DECK.ly, 0); const b = iso(x, DECK.ly, 0);
      grid.push(`<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}"/>`);
    });
    [-42, 0, 42].forEach((y) => {
      const a = iso(-DECK.lx, y, 0); const b = iso(DECK.lx, y, 0);
      grid.push(`<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}"/>`);
    });
    const deckMarkup =
      `<polygon points="${attr(dLeft)}" fill="#cfc0a5"/>`
      + `<polygon points="${attr(dRight)}" fill="#ded0b6"/>`
      + `<polygon points="${attr(dTop)}" fill="#f2ead8" stroke="#d9c9ad" stroke-width="1.2"/>`
      + `<g stroke="#e6dac2" stroke-width="1">${grid.join('')}</g>`
      + `<path d="M${n2(dTop[3][0])} ${n2(dTop[3][1])}L${n2(dTop[0][0])} ${n2(dTop[0][1])}" fill="none" stroke="#fdf8ef" stroke-width="1.8" stroke-linecap="round"/>`;

    const DECK_VB = pad(box([...dTop, ...dLeft, ...dRight]), 10);

    const frameSym = $('part-frame');
    const ghostSym = $('part-ghost');
    frameSym.setAttribute('viewBox', PART_VB.join(' '));
    frameSym.innerHTML = partMarkup;
    ghostSym.setAttribute('viewBox', PART_VB.join(' '));
    ghostSym.innerHTML = ghostMarkup;

    document.querySelectorAll('svg use').forEach((u) => {
      const href = u.getAttribute('href') || '';
      if (href !== '#part-frame' && href !== '#part-ghost') return;
      const host = u.ownerSVGElement;
      host.setAttribute('viewBox', PART_VB.join(' '));
      ['x', 'y', 'width', 'height'].forEach((name, i) => u.setAttribute(name, PART_VB[i]));
      host.style.aspectRatio = `${n2(PART_VB[2])} / ${n2(PART_VB[3])}`;
    });

    const canvas = $('assembly-canvas');
    const deckSvg = canvas.querySelector('.bench');
    deckSvg.setAttribute('viewBox', DECK_VB.join(' '));
    deckSvg.innerHTML = deckMarkup;
    canvas.style.aspectRatio = `${n2(DECK_VB[2])} / ${n2(DECK_VB[3])}`;

    const left = (PART_VB[0] - DECK_VB[0]) / DECK_VB[2] * 100;
    const top = (PART_VB[1] - DECK_VB[1]) / DECK_VB[3] * 100;
    const width = PART_VB[2] / DECK_VB[2] * 100;
    const height = PART_VB[3] / DECK_VB[3] * 100;
    [$('placed-part'), $('drop-target')].forEach((el) => {
      el.style.left = `${n2(left * 1000) / 1000}%`;
      el.style.top = `${n2(top * 1000) / 1000}%`;
      el.style.width = `${n2(width * 1000) / 1000}%`;
      el.style.height = `${n2(height * 1000) / 1000}%`;
    });
    $('drag-part').style.aspectRatio = `${n2(PART_VB[2])} / ${n2(PART_VB[3])}`;

    return { dock: { left: left / 100, top: top / 100, width: width / 100, height: height / 100 } };
  }

  const GEOM = buildScene();

  /* ═══ 二 · 时间线：一个 elapsed 驱动画面、候选与文案 ═══ */
  const STEPS = [
    { key: '聚焦', obs: '定位零件搜索框', dur: 720,
      picks: ['展开左侧分类', '点击零件搜索框', '打开最近工程'], w: [12, 76, 12] },
    { key: '输入', obs: '输入慢模型给出的编号', dur: 1150,
      picks: ['修改工程名称', '重新打开零件库', '输入 64179'], w: [6, 8, 86] },
    { key: '选中', obs: '选中唯一匹配的零件', dur: 820,
      picks: ['选中唯一匹配的框架', '再次输入编号', '选择普通砖块'], w: [78, 14, 8] },
    { key: '放置', obs: '把同一零件移到吸附位', dur: 1500,
      picks: ['切回搜索框', '移到吸附位并放入', '重复选中框架'], w: [8, 84, 8] },
    { key: '保存', obs: '保存模块工程', dur: 980,
      picks: ['关闭未保存工程', '重复放置框架', '保存当前工程'], w: [5, 7, 88] },
  ];
  const HANDOFF = { picks: ['返回慢模型', '重复上次点击', '未确认就重放'], w: [93, 4, 3] };
  const CHOOSE = 460;
  const HOLD = 340;
  const total = (i) => CHOOSE + STEPS[i].dur + HOLD;

  const TRACK = [
    { from: 'start', to: 'search', span: 0.62, drag: false, tap: 0.66 },
    { from: 'search', to: 'search', span: 1, drag: false, tap: -1 },
    { from: 'search', to: 'card', span: 0.62, drag: false, tap: 0.70 },
    { from: 'card', to: 'dock', span: 0.80, drag: true, tap: -1 },
    { from: 'dock', to: 'save', span: 0.58, drag: false, tap: 0.58 },
  ];

  const theater = $('execution-theater');
  const screen = $('mini-screen');
  const canvas = $('assembly-canvas');
  const choiceBox = $('local-choice');
  const beads = $('action-beads');
  const playBtn = $('loop-play');
  const cursor = $('demo-cursor');
  const drag = $('drag-part');
  const field = $('mini-search-value');
  const targetName = $('target-name');
  const targetCode = $('target-code');
  const receipt = $('receipt');

  let action = 0;
  let elapsed = 0;
  let phase = 'execution';
  let blocked = false;
  let playing = false;
  let started = false;
  let inView = false;
  let resumeOnReturn = false;
  let stopAfter = -1;
  let raf = 0;
  let clock = 0;
  let geo = null;
  let rows = [];
  let choiceKey = '';
  let beadKey = '';
  let stateKey = '';
  const cache = {};

  const progress = () => clamp01((elapsed - CHOOSE) / STEPS[action].dur);

  function measure() {
    const s = screen.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    if (!c.width || !s.width) return;
    const ox = c.left - s.left;
    const oy = c.top - s.top;
    const mid = (el, fx, fy) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy };
    };
    const thumb = document.querySelector('#library-target .part-shape');
    geo = {
      start: { x: ox + c.width * 0.73, y: oy + c.height * 0.80 },
      search: mid($('mini-search'), 0.5, 0.5),
      card: mid(thumb, 0.5, 0.5),
      dock: { x: ox + c.width * (GEOM.dock.left + GEOM.dock.width / 2),
        y: oy + c.height * (GEOM.dock.top + GEOM.dock.height / 2) },
      save: mid($('app-save'), 0.5, 0.5),
      thumbW: thumb.getBoundingClientRect().width,
      dockW: c.width * GEOM.dock.width,
    };
    stateKey = '';
    render();
  }

  function say(id, value) {
    if (cache[id] === value) return;
    cache[id] = value;
    const el = $(id);
    if (el) el.textContent = value;
  }

  function paintPlay() {
    playBtn.innerHTML = `<svg class='ico' aria-hidden='true'><use href='#i-${playing ? 'pause' : 'play'}'/></svg>`;
    playBtn.setAttribute('aria-label', playing ? '暂停执行流程' : '播放执行流程');
  }

  function paintChoices() {
    const set = blocked ? HANDOFF : STEPS[action];
    const key = blocked ? 'handoff' : `a${action}`;
    if (key === choiceKey) return;
    choiceKey = key;
    choiceBox.innerHTML = set.picks.map((label, i) =>
      `<div class="choice-row"><span class="choice-label">${label}</span>`
      + `<strong class="choice-value">${set.w[i]}%</strong>`
      + `<span class="choice-track"><i class="choice-bar"></i></span></div>`).join('');
    rows = [...choiceBox.children];
  }

  function paintBeads() {
    const key = `${phase}:${action}`;
    if (key === beadKey) return;
    beadKey = key;
    const focused = beads.contains(document.activeElement);
    beads.innerHTML = STEPS.map((s, i) => {
      const cls = phase === 'review' || i < action ? 'is-done' : i === action ? 'is-active' : '';
      return `<button class="bead ${cls}" data-action="${i}" aria-pressed="${i === action && phase !== 'review'}">`
        + `<i aria-hidden="true"></i><span>${s.key}</span></button>`;
    }).join('');
    beads.style.setProperty('--done', phase === 'review' ? 1 : action / (STEPS.length - 1));
    if (focused) {
      const again = beads.querySelector(`[data-action="${action}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function render() {
    const p = progress();
    const at = (i, t) => action > i || (action === i && p >= t);
    const focused = at(0, 0.68);
    const filtered = at(1, 0.88);
    const selected = at(2, 0.70);
    const placed = at(3, 0.80);
    const saved = at(4, 0.62);
    const typing = action === 1 && p > 0.08 && p < 0.94;

    const n = action === 0 ? 0 : action > 1 ? 5
      : Math.min(5, Math.max(0, Math.floor((p - 0.10) / 0.62 * 6)));
    const typed = '64179'.slice(0, n);
    if (field.value !== typed) field.value = typed;
    screen.style.setProperty('--typed', n);

    const tokens = [focused && 'focused', typing && 'typing', filtered && 'filtered',
      selected && 'selected', placed && 'placed', saved && 'saved'].filter(Boolean).join(' ');
    if (tokens !== stateKey) { stateKey = tokens; screen.dataset.state = tokens; }
    screen.dataset.blocked = String(blocked);

    if (phase !== theater.dataset.phase) theater.dataset.phase = phase;
    theater.dataset.blocked = String(blocked);

    say('slow-status', blocked ? '收到阻塞，调整子目标' : phase === 'review' ? '核验本段结果' : '子目标已下发');
    say('plan-state', blocked ? '检查当前阻塞' : phase === 'review' ? '核验回传结果' : '等待本段执行结果');
    say('work-title', blocked ? '局部执行已暂停' : '装配工作台');
    say('observation-text', blocked ? '保留现场并交还慢模型'
      : phase === 'review' ? '本段结果已回传' : STEPS[action].obs);
    say('goal-step', blocked || phase === 'review' ? '交还慢模型' : `JEV 连续执行 · ${STEPS[action].key}`);
    say('decision-title', blocked ? 'JEV 选择返回' : 'JEV 候选选择');
    say('loop-block', blocked ? '返回局部执行' : '遇阻时如何返回');
    say('app-file-state', saved ? '已保存' : '尚未保存');
    say('mini-canvas-status', saved ? '保存完成' : placed ? '框架已吸附到位'
      : selected ? '框架已选中' : filtered ? '找到 1 个匹配' : focused ? '搜索框已激活' : '装配工作区');
    say('app-operation', blocked ? '交还慢模型' : phase === 'review' ? '等待核验'
      : playing ? (elapsed < CHOOSE ? 'JEV 选择' : `${STEPS[action].key}中`) : started ? '已暂停' : '等待执行');
    say('target-name', filtered ? '框架件 64179' : '常用零件');
    say('target-code', filtered ? '框架 · 5×7' : '未检索');

    paintChoices();
    const set = blocked ? HANDOFF : STEPS[action];
    const winner = set.w.indexOf(Math.max(...set.w));
    const decided = blocked || elapsed >= CHOOSE * 0.9;
    const fill = blocked ? 1 : clamp01(elapsed / CHOOSE);
    rows.forEach((row, i) => {
      row.querySelector('.choice-bar').style.setProperty('--w', `${set.w[i] * fill}%`);
      row.classList.toggle('selected', decided && i === winner);
    });
    say('selected-action', decided ? set.picks[winner] : '评估候选中');
    say('selection-caption', blocked ? '返回条件' : decided ? 'JEV 已选' : '本次选择');

    const note = blocked ? '保留当前观察与缺失的目标信息，不重放无效动作'
      : phase === 'review' ? '把本段回执与最新观察交还慢模型'
        : saved ? '回执：工程保存状态已更新'
          : placed ? '回执：框架已吸附到当前模块的位姿'
            : decided ? '执行所选动作，随后读取回执' : '等待 JEV 选择下一个动作';
    say('receipt-text', note);
    if (cache.phase !== phase) { cache.phase = phase; receipt.classList.add('flash'); }
    if (receipt.classList.contains('flash') && cache.flash !== `${action}:${phase}`) {
      cache.flash = `${action}:${phase}`;
      receipt.classList.remove('flash');
      void receipt.offsetWidth;
      receipt.classList.add('flash');
    }

    paintBeads();

    if (!geo) return;
    const track = TRACK[action];
    const a = geo[track.from];
    const b = geo[track.to];
    const tr = ease(p / track.span);
    const arc = Math.sin(Math.PI * tr) * (track.drag ? 22 : 7);
    let px = a.x + (b.x - a.x) * tr;
    let py = a.y + (b.y - a.y) * tr - arc;
    let cx = px;
    let cy = py;

    if (track.drag) {
      const w = geo.thumbW + (geo.dockW - geo.thumbW) * tr;
      drag.style.setProperty('--drag-w', `${w.toFixed(1)}px`);
      drag.style.setProperty('--drag-x', `${px.toFixed(1)}px`);
      drag.style.setProperty('--drag-y', `${py.toFixed(1)}px`);
      screen.dataset.carrying = String(!blocked && elapsed >= CHOOSE && !placed);
    } else {
      screen.dataset.carrying = 'false';
    }

    cursor.style.setProperty('--cursor-x', `${cx.toFixed(1)}px`);
    cursor.style.setProperty('--cursor-y', `${cy.toFixed(1)}px`);
    const tap = blocked || track.tap < 0 ? 0
      : Math.max(0, 1 - Math.abs(p - track.tap) / 0.12);
    cursor.style.setProperty('--tap', tap.toFixed(3));
    screen.style.setProperty('--tap', tap.toFixed(3));
  }

  /* ═══ 三 · 播放控制 ═══ */
  function tick(now) {
    raf = 0;
    if (!playing) return;
    if (!clock) clock = now;
    let dt = Math.min(140, now - clock);
    clock = now;
    let guard = 0;
    while (dt > 0.5 && guard < 12) {
      guard += 1;
      const need = total(action) - elapsed;
      if (dt < need) { elapsed += dt; dt = 0; break; }
      dt -= need;
      elapsed = total(action);
      if (stopAfter === action) { stopAfter = -1; playing = false; break; }
      if (action >= STEPS.length - 1) { phase = 'review'; playing = false; break; }
      action += 1;
      elapsed = 0;
    }
    render();
    if (playing) raf = requestAnimationFrame(tick);
    else paintPlay();
  }

  function play() {
    blocked = false;
    stopAfter = -1;
    if (phase === 'review') { action = 0; elapsed = 0; }
    started = true;
    phase = 'execution';
    if (media.matches) {
      action = STEPS.length - 1;
      elapsed = total(action);
      phase = 'review';
      playing = false;
      paintPlay();
      render();
      return;
    }
    playing = true;
    clock = 0;
    if (!raf) raf = requestAnimationFrame(tick);
    paintPlay();
    render();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    raf = 0;
    clock = 0;
    paintPlay();
    render();
  }

  function replay() {
    blocked = false;
    stopAfter = -1;
    action = 0;
    elapsed = 0;
    phase = 'execution';
    started = true;
    choiceKey = '';
    beadKey = '';
    if (media.matches) { play(); return; }
    playing = true;
    clock = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    paintPlay();
    render();
  }

  function preview(i) {
    blocked = false;
    choiceKey = '';
    action = i;
    phase = 'execution';
    started = true;
    elapsed = 0;
    cancelAnimationFrame(raf);
    raf = 0;
    clock = 0;
    if (media.matches) {
      elapsed = total(i);
      playing = false;
      stopAfter = -1;
    } else {
      playing = true;
      stopAfter = i;
      raf = requestAnimationFrame(tick);
    }
    paintPlay();
    render();
  }

  playBtn.addEventListener('click', () => { if (playing) pause(); else play(); });
  $('loop-replay').addEventListener('click', replay);
  $('loop-block').addEventListener('click', () => {
    pause();
    blocked = !blocked;
    started = true;
    choiceKey = '';
    render();
  });
  beads.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (btn) preview(Number(btn.dataset.action));
  });

  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    if (!inView) {
      if (playing) { resumeOnReturn = true; pause(); }
      return;
    }
    if (resumeOnReturn) { resumeOnReturn = false; play(); return; }
    if (!started && !media.matches) play();
  }, { threshold: 0.25 }).observe(theater);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (playing) { resumeOnReturn = true; pause(); } }
    else if (resumeOnReturn && inView) { resumeOnReturn = false; play(); }
  });

  media.addEventListener('change', () => { if (media.matches) pause(); });

  new ResizeObserver(measure).observe(screen);
  new ResizeObserver(measure).observe(canvas);
  document.fonts.ready.then(measure);

  window.JevDuoExecution = {
    state: () => ({
      phase, action, blocked, playing, started, elapsed,
      actionProgress: progress(), typed: field.value,
      carrying: screen.dataset.carrying === 'true',
      screenState: screen.dataset.state || '',
    }),
  };

  paintPlay();
  render();
  measure();
})();
