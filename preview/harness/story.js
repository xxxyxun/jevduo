"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const clamp = value => Math.max(0, Math.min(1, value));
  const hero = $("story"), board = $("architecture-board"), theater = $("execution-theater");
  const actions = [
    {label:"聚焦", observation:"零件库已打开，搜索框可用", choices:["聚焦零件搜索框","展开其他分类","返回外层规划"], receipt:"焦点读回：零件搜索框已激活", generated:"根据当前截图，先定位零件库上方的搜索框，再点击该框以建立输入焦点。确认焦点后，下一步才能写入已提供的零件编号。"},
    {label:"输入", observation:"搜索框已获得焦点，输入值由 Planner 提供", choices:["输入零件编号 64179","修改模型名称","重新打开零件库"], receipt:"字段读回：64179，与给定编号一致", generated:"当前焦点已在零件搜索框。读取子目标提供的准确编号 64179，将该编号写入当前字段，再检查字段值和对应搜索结果。"},
    {label:"选择", observation:"匹配搜索条件的零件已出现", choices:["选择编号匹配的框架","选择旁边的普通砖块","重复输入相同编号"], receipt:"选中状态读回：目标框架已选中", generated:"查看更新后的搜索结果，辨认与编号匹配的框架，点击选中该零件。不要选择旁边的普通砖块，也不需要再次输入相同编号。"},
    {label:"放置", observation:"目标框架已选中，装配区可操作", choices:["在指定装配位置放置","切回搜索框","再次选择相同零件"], receipt:"执行回执返回：零件已放入装配区", generated:"根据子目标提供的位置与当前装配区，放置已经选中的框架。执行后检查新观察，确认零件出现，再进入本段的保存操作。"},
    {label:"保存", observation:"本段放置完成，当前工程需要保存", choices:["保存当前模块","关闭未保存的工程","再次放置同一零件"], receipt:"保存证据返回：交由外层核验本段结果", generated:"当前放置操作已结束。执行工程保存，并将保存后的观察与回执交回外层，核验是否满足本段目标；不要仅凭已点击保存就宣布整题完成。"},
  ];
  let viewer = null, owner = "hero", heroVisible = true, introAge = 0, introFraction = reduced ? 1 : 0;
  let manualCamera = false, introFrame = 0, lastIntro = 0, route = "gui";
  let mode = "jev", action = 0, blocked = false, playing = false, loopTimer = null, loopStarted = false;

  function line(path, type = "") {
    return '<path class="arch-wire ' + type + '" d="' + path + '"/>';
  }

  function drawArchitecture() {
    if (innerWidth < 1000) { $("arch-wires").innerHTML = ""; return; }
    const root = board.getBoundingClientRect();
    board.querySelector(".architecture-wires").setAttribute("viewBox", "0 0 " + root.width + " " + root.height);
    const bounds = id => {
      const rect = $(id).getBoundingClientRect();
      return {x:rect.x-root.x, y:rect.y-root.y, w:rect.width, h:rect.height};
    };
    const top = ["arch-input", "arch-slow", "arch-goal", "arch-router"].map(bounds);
    const lanes = ["arch-jev", "arch-cli", "arch-extension"].map(bounds);
    const runtime = bounds("arch-runtime"), evidence = bounds("arch-evidence");
    const cx = node => node.x + node.w/2, cy = node => node.y + node.h/2;
    const bottom = node => node.y + node.h;
    const paths = [];
    for (let i = 0; i < top.length-1; i++) {
      paths.push(line("M" + (top[i].x+top[i].w+3) + " " + cy(top[i]) + "H" + (top[i+1].x-6)));
    }
    const router = top[3], bus = (bottom(router)+lanes[0].y)/2;
    lanes.forEach((lane, i) => {
      const active = ["gui","cli","extension"][i] === route;
      paths.push(line("M" + cx(router) + " " + (bottom(router)+3) + "V" + bus + "H" + cx(lane) + "V" + (lane.y-7), active ? "active" : ""));
      paths.push(line("M" + cx(lane) + " " + (bottom(lane)+3) + "V" + (runtime.y-7), active ? "active" : ""));
    });
    const localX = runtime.x-28, localY = cy(runtime), jevY = cy(lanes[0]);
    if (route === "gui") {
      paths.push(line("M" + (runtime.x-4) + " " + localY + "H" + (localX+9) + "Q" + localX + " " + localY + " " + localX + " " + (localY-9) + "V" + (jevY+9) + "Q" + localX + " " + jevY + " " + (localX+9) + " " + jevY + "H" + (lanes[0].x-7), "local"));
    }
    paths.push(line("M" + cx(runtime) + " " + (bottom(runtime)+3) + "V" + (evidence.y-7)));
    const outerX = root.width-18, slowX = cx(top[1]), outerY = 30;
    paths.push(line("M" + (evidence.x+evidence.w+3) + " " + cy(evidence) + "H" + (outerX-10) + "Q" + outerX + " " + cy(evidence) + " " + outerX + " " + (cy(evidence)-10) + "V" + (outerY+10) + "Q" + outerX + " " + outerY + " " + (outerX-10) + " " + outerY + "H" + (slowX+10) + "Q" + slowX + " " + outerY + " " + slowX + " " + (outerY+10) + "V" + (top[1].y-7), "return"));
    $("arch-wires").innerHTML = paths.join("");
  }

  board.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => {
    route = button.dataset.route;
    board.dataset.route = route;
    board.querySelectorAll("[data-route]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    $("route-explanation").textContent = route === "gui"
      ? "JEV 在同一子目标内接收新观察、连续选择动作；局部动作不逐次触发外层规划。"
      : route === "cli"
      ? "CLI 路径由慢模型提供代码与命令，同样经过共享执行器、预算与真实回执，不绕过外层核验。"
      : "注册组件时声明能力、工具权限与预算。这里展示扩展接口，不代表已经接入额外生产执行器。";
    board.querySelector(".inner-loop-label").style.opacity = route === "gui" ? 1 : .3;
    drawArchitecture();
  }));
  new ResizeObserver(drawArchitecture).observe(board);

  function renderLoop() {
    const item = actions[action], generated = mode === "generated";
    theater.dataset.mode = mode;
    theater.dataset.blocked = String(blocked);
    $("slow-status").textContent = blocked ? "收到阻塞证据" : generated ? "生成第 " + (action+1) + " 个动作" : action === 4 ? "等待本段核验" : "子目标保持不变";
    $("plan-state").textContent = blocked ? "补充观察后再决定" : generated ? "逐步请求动作生成" : "不逐动作重新规划";
    $("work-title").textContent = blocked ? "停止局部执行，带证据返回" : generated ? "慢模型生成下一动作" : "JEV 选择下一动作";
    $("work-icon").innerHTML = icon(generated ? "brain" : "bolt");
    $("observation-text").textContent = blocked ? "当前候选里缺少目标控件" : item.observation;
    $("decision-title").textContent = blocked ? "本次返回条件已触发" : generated ? "为当前一步生成操作说明" : "从当前候选中选择";
    $("receipt-text").textContent = blocked ? "停止重复点击；将缺失控件与最后观察返回外层" : item.receipt;
    $("local-choice").hidden = generated && !blocked;
    $("generation-copy").hidden = !generated || blocked;
    $("generation-copy").textContent = item.generated;
    const choices = blocked ? ["返回外层补充观察","重复点击上次位置","未确认就重放动作"] : item.choices;
    $("local-choice").innerHTML = choices.map((text, i) => '<div class="choice-row ' + (i === 0 ? "selected" : "") + '"><span>0' + (i+1) + '</span>' + text + (i === 0 ? icon("check") : "") + '</div>').join("");
    $("action-beads").innerHTML = actions.map((entry, i) => '<button class="action-bead ' + (i < action ? "done" : i === action ? "active" : "") + '" data-action="' + i + '" aria-pressed="' + (i === action) + '">' + entry.label + '</button>').join("");
    $("mini-search").classList.toggle("focused", action < 2);
    $("mini-search-value").textContent = action > 0 ? "64179" : "搜索零件";
    $("mini-parts").classList.toggle("visible", action > 0);
    $("mini-parts").classList.toggle("chosen", action > 1);
    $("placed-part").classList.toggle("visible", action > 2);
    $("saved-mark").classList.toggle("visible", action === 4 && !blocked);
    $("mini-canvas-status").textContent = action > 2 ? "目标框架已放置" : "装配区";
    $("mode-explanation").textContent = blocked
      ? "目标缺失时停止局部循环。把阻塞与新观察交回外层，补充信息或调整路径；不靠重复点击继续。"
      : generated
      ? "对照示意：每一步请求慢模型生成操作说明。这里比较调用结构，不比较真实秒数或 token 数量。"
      : "子目标与输入保持不变。JEV 连续选择具体动作，减少逐动作慢模型往返与动作长文本生成；阶段返回后再由外层核验。";
    $("loop-block").innerHTML = icon("refresh") + (blocked ? "恢复演示" : "模拟遇阻");
    $("loop-play").innerHTML = playing ? "Ⅱ" : icon("play");
    $("loop-play").setAttribute("aria-label", playing ? "暂停连续执行示意" : "播放连续执行示意");
  }

  function pauseLoop() {
    clearTimeout(loopTimer);
    playing = false;
    renderLoop();
  }

  function advanceLoop() {
    if (!playing || blocked || document.hidden) return;
    if (action === actions.length-1) { pauseLoop(); return; }
    action++;
    renderLoop();
    loopTimer = setTimeout(advanceLoop, 1550);
  }

  function playLoop() {
    clearTimeout(loopTimer);
    if (blocked) blocked = false;
    if (action === actions.length-1) action = 0;
    playing = true;
    renderLoop();
    loopTimer = setTimeout(advanceLoop, 1550);
  }

  document.querySelectorAll(".mode-switch [data-mode]").forEach(button => button.addEventListener("click", () => {
    mode = button.dataset.mode;
    document.querySelectorAll(".mode-switch [data-mode]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    blocked = false;
    action = 0;
    pauseLoop();
  }));
  $("action-beads").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    action = +button.dataset.action;
    blocked = false;
    pauseLoop();
  });
  $("loop-play").onclick = () => playing ? pauseLoop() : playLoop();
  $("loop-replay").onclick = () => { action = 0; blocked = false; reduced ? pauseLoop() : playLoop(); };
  $("loop-block").onclick = () => { blocked = !blocked; pauseLoop(); };
  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) { if (playing) pauseLoop(); return; }
    if (!loopStarted && !reduced) { loopStarted = true; playLoop(); }
  }, {threshold:.35}).observe(theater);

  function paintIntro(now) {
    introFrame = 0;
    if (!viewer || owner !== "hero" || !heroVisible || document.hidden) { lastIntro = 0; return; }
    const elapsed = lastIntro ? Math.min(now-lastIntro, 1000) : 0;
    lastIntro = now;
    introAge += elapsed;
    introFraction = reduced ? 1 : clamp(introAge/7600);
    viewer.seek(180*introFraction);
    if (!manualCamera) {
      const aspect = Math.min($("hero-model-mount").clientWidth, innerWidth-32)/$("hero-model-mount").clientHeight;
      viewer.setCamera({yaw:-1.30+introFraction*.16,elevation:.82-introFraction*.14,radius:(.65-introFraction*.23)*Math.max(1,1.55/aspect),target:[-.065,.014,.02]});
    }
    if (introFraction < 1) introFrame = requestAnimationFrame(paintIntro);
  }

  function scheduleIntro() {
    if (!introFrame) introFrame = requestAnimationFrame(paintIntro);
  }

  async function initScene() {
    window.gearboxData ||= await fetch(document.documentElement.dataset.assets + "model.json").then(response => response.json());
    viewer = window.GearboxViewer.create($("hero-model-mount"), {theme:"atlas", onUpdate:state => {
      $("assembly-count").textContent = state.placed + " / " + state.pieces + " 件";
      window.dispatchEvent(new CustomEvent("gearbox-update", {detail:state}));
    }});
    viewer.renderer.toneMappingExposure = 1.02;
    viewer.scene.children.filter(node => node.isLight).forEach(light => {
      if (light.isHemisphereLight) light.intensity = 1.6;
      else if (light.castShadow) { light.intensity = 3.6; light.shadow.mapSize.set(2048,2048); }
      else light.intensity *= .8;
    });
    viewer.setMode("assembly");
    viewer.play(false);
    viewer.seek(reduced ? 180 : 0);
    viewer.setCamera({yaw:-1.30,elevation:.82,radius:.65});
    $("hero-model-loading").remove();
    document.querySelector(".assembly-poster").style.opacity = 0;
    viewer.canvas.addEventListener("pointerdown", () => { manualCamera = true; });
    introAge = reduced ? 7600 : 0;
    scheduleIntro();
    return viewer;
  }

  function mountResult() {
    if (!viewer || owner === "result") return;
    owner = "result";
    viewer.play(false);
    viewer.moveTo($("model-mount"));
    viewer.setMode("motion");
    viewer.setView("overall");
    $("model-loading")?.remove();
    document.querySelector(".assembly-poster").style.opacity = 1;
  }

  function mountHero() {
    if (!viewer || owner === "hero") return;
    owner = "hero";
    manualCamera = false;
    introAge = 7600;
    viewer.play(false);
    viewer.moveTo($("hero-model-mount"));
    viewer.setMode("assembly");
    document.querySelector(".assembly-poster").style.opacity = 0;
    scheduleIntro();
  }

  const ready = initScene().catch(() => {
    $("hero-model-loading").textContent = "交互场景暂未载入，可继续观看影片。";
    return null;
  });
  new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    if (heroVisible) ready.then(() => { mountHero(); scheduleIntro(); });
    else lastIntro = 0;
  }).observe(hero);
  $("intro-replay").onclick = () => {
    introAge = 0; introFraction = reduced ? 1 : 0; manualCamera = false; lastIntro = 0;
    scheduleIntro();
  };
  function readScroll() {
    document.querySelector(".header").classList.toggle("scrolled", scrollY > 30);
    const progress = clamp(-hero.getBoundingClientRect().top/hero.offsetHeight);
    if (!reduced) document.querySelector(".assembly-stage").style.transform = "translateY(" + (progress*70) + "px)";
  }
  addEventListener("scroll", readScroll, {passive:true});
  addEventListener("resize", () => { if (owner === "hero") scheduleIntro(); });
  document.addEventListener("visibilitychange", () => {
    lastIntro = 0;
    if (document.hidden) { pauseLoop(); viewer?.play(false); }
    else scheduleIntro();
  });
  if (!reduced) {
    document.documentElement.classList.add("motion-enabled");
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
    }), {threshold:.1});
    document.querySelectorAll(".overview-heading,.overview-copy,.section-heading,.result-copy,.closing").forEach(node => {
      node.dataset.reveal = ""; observer.observe(node);
    });
  }
  renderLoop();
  readScroll();
  window.JevDuoScene = {ready, mountResult, get viewer(){return viewer;}, state:() => ({route, mode, action, blocked, playing, owner, introFraction, manualCamera})};
})();
