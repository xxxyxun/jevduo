"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const clamp = value => Math.max(0, Math.min(1, value));
  const opening = $("opening"), stage = document.querySelector(".assembly-stage");
  const slot = $("architecture-model-slot"), board = $("architecture-board"), theater = $("execution-theater");
  const actions = [
    {label:"聚焦", observation:"搜索框已出现在当前观察中", choices:["展开其他分类","点击零件搜索框","返回慢模型"], weights:[.11,.82,.07], receipt:"读回焦点：搜索框已激活"},
    {label:"输入", observation:"搜索框已激活，零件编号已由慢模型提供", choices:["修改工程名称","重新打开零件库","输入 64179"], weights:[.05,.07,.88], receipt:"读回字段：输入值为 64179"},
    {label:"选择", observation:"搜索结果已更新，目标框架可见", choices:["选中目标框架","再次输入编号","选择普通砖块"], weights:[.79,.13,.08], receipt:"读回选中状态：目标框架已选中"},
    {label:"放置", observation:"目标框架已选中，可以放入当前工程", choices:["切回搜索框","放到指定装配位置","重复选中框架"], weights:[.09,.84,.07], receipt:"动作回执：框架已放入装配区"},
    {label:"保存", observation:"本段装配已完成，等待保存", choices:["关闭未保存工程","重复放置框架","保存当前工程"], weights:[.04,.06,.90], receipt:"保存回执与最新观察已返回"},
  ];
  let viewer = null, owner = "hero", heroVisible = true, introAge = 0, introFraction = reduced ? 1 : 0;
  let manualCamera = false, introFrame = 0, lastIntro = 0, route = "gui", bridgeProgress = 0;
  let phase = "execution", action = 0, blocked = false, playing = false, loopTimer = null, loopStarted = false;

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
    const source = ["arch-input", "arch-slow", "arch-goal"].map(bounds), router = bounds("arch-router");
    const lanes = ["arch-jev", "arch-cli", "arch-extension"].map(bounds);
    const runtime = bounds("arch-runtime"), evidence = bounds("arch-evidence");
    const cx = node => node.x + node.w/2, cy = node => node.y + node.h/2;
    const bottom = node => node.y + node.h;
    const paths = [];
    for (let i = 0; i < source.length-1; i++) {
      paths.push(line("M" + cx(source[i]) + " " + (bottom(source[i])+3) + "V" + (source[i+1].y-6)));
    }
    const goal = source[2], inputX = router.x-25, bus = lanes[0].x-26;
    paths.push(line("M" + (goal.x+goal.w+3) + " " + cy(goal) + "H" + inputX + "V" + cy(router) + "H" + (router.x-7)));
    const selected = lanes[["gui","cli","extension"].indexOf(route)];
    const branch = lane => "M" + (router.x+router.w+3) + " " + cy(router) + "H" + bus + "V" + cy(lane) + "H" + (lane.x-7);
    lanes.filter(lane => lane !== selected).forEach(lane => paths.push(line(branch(lane))));
    paths.push(line(branch(selected), "active"));
    paths.push(line("M" + (selected.x+selected.w+3) + " " + (cy(selected)-9) + "H" + (root.width-27) + "V" + (cy(runtime)-12) + "H" + (runtime.x+runtime.w+7), "active"));
    if (route === "gui") {
      const outside = root.width-10, lane = lanes[0];
      paths.push(line("M" + (runtime.x+runtime.w+3) + " " + (cy(runtime)+12) + "H" + outside + "V" + (cy(lane)+12) + "H" + (lane.x+lane.w+7), "local"));
    }
    paths.push(line("M" + cx(runtime) + " " + (bottom(runtime)+3) + "V" + (evidence.y-7)));
    paths.push(line("M" + (evidence.x-3) + " " + cy(evidence) + "H22V" + cy(source[1]) + "H" + (source[1].x-7), "return"));
    $("arch-wires").innerHTML = paths.join("");
  }

  board.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => {
    route = button.dataset.route;
    board.dataset.route = route;
    board.querySelectorAll("[data-route]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    $("router-selection").textContent = button.querySelector("strong").textContent;
    board.querySelectorAll("[data-lane]").forEach(item => item.classList.toggle("active", item.dataset.lane === route));
    drawArchitecture();
  }));
  new ResizeObserver(drawArchitecture).observe(board);

  function renderLoop() {
    const item = actions[action];
    theater.dataset.phase = phase;
    theater.dataset.blocked = String(blocked);
    document.querySelectorAll(".execution-flow [data-phase]").forEach(node => {
      node.classList.toggle("active", node.dataset.phase === phase);
    });
    $("slow-status").textContent = blocked ? "接收阻塞，调整子目标" : phase === "goal" ? "下发一个子目标" : phase === "review" ? "核验本段结果" : "子目标已下发";
    $("plan-state").textContent = blocked ? "处理当前缺失的信息" : phase === "review" ? "核验后决定下一步" : "等待本段执行结果";
    $("work-title").textContent = blocked ? "停止局部循环" : phase === "goal" ? "接收子目标与输入" : phase === "review" ? "本段执行已结束" : "JEV 选择下一动作";
    $("observation-text").textContent = blocked ? "目标控件未出现在当前候选中" : phase === "goal" ? "目标、输入与返回条件已明确" : phase === "review" ? "将执行结果与最新观察交给慢模型" : item.observation;
    $("decision-title").textContent = blocked ? "JEV 选择返回" : "JEV 候选选择";
    $("receipt-text").textContent = blocked ? "保留当前状态，返回缺失控件与最后观察" : phase === "goal" ? "收到子目标后，开始本段 GUI 操作" : item.receipt;
    const choices = blocked ? ["返回慢模型补充观察","重复点击上次位置","未确认就重放动作"] : item.choices;
    const weights = blocked ? [.94,.04,.02] : item.weights;
    const winner = weights.indexOf(Math.max(...weights)), decided = phase !== "goal";
    $("local-choice").innerHTML = choices.map((text, i) => {
      const percent = decided ? Math.round(weights[i]*100) : 0;
      return '<div class="choice-row ' + (decided && i === winner ? "selected" : "") + '" data-weight="' + percent + '"><span class="choice-label">' + text + '</span><strong class="choice-value">' + (decided ? percent+"%" : "—") + '</strong><span class="choice-track" aria-hidden="true"><i class="choice-bar" style="--score:' + percent + '%"></i></span></div>';
    }).join("");
    $("selection-caption").textContent = decided ? "JEV 已选" : "等待观察";
    $("selected-action").textContent = decided ? choices[winner] : "接收子目标与输入";
    document.querySelector(".selection-result>svg").style.visibility = decided ? "visible" : "hidden";
    $("action-beads").innerHTML = actions.map((entry, i) => {
      const state = phase === "review" && !blocked || i < action ? "done" : i === action && phase === "execution" ? "active" : "";
      return '<button class="action-bead ' + state + '" data-action="' + i + '" aria-pressed="' + (i === action) + '">' + entry.label + '</button>';
    }).join("");
    $("mini-search").classList.toggle("focused", phase === "execution" && action < 2);
    $("mini-search-value").textContent = action > 0 ? "64179" : "零件编号";
    $("mini-parts").classList.toggle("visible", action > 0);
    $("mini-parts").classList.toggle("chosen", action > 1);
    $("placed-part").classList.toggle("visible", action > 2);
    $("saved-mark").classList.toggle("visible", action === 4 && !blocked);
    $("mini-canvas-status").textContent = action > 2 ? "框架已放入工程" : "当前工程";
    $("loop-block").innerHTML = icon("refresh") + (blocked ? "返回局部执行" : "遇阻时如何返回");
    $("loop-play").innerHTML = playing ? "Ⅱ" : icon("play");
    $("loop-play").setAttribute("aria-label", playing ? "暂停执行流程" : "播放执行流程");
  }

  function pauseLoop() {
    clearTimeout(loopTimer);
    playing = false;
    renderLoop();
  }

  function advanceLoop() {
    if (!playing || blocked || document.hidden) return;
    if (phase === "goal") phase = "execution";
    else if (action === actions.length-1) { phase = "review"; pauseLoop(); return; }
    else action++;
    renderLoop();
    loopTimer = setTimeout(advanceLoop, 1350);
  }

  function playLoop() {
    clearTimeout(loopTimer);
    if (blocked || phase === "review") { blocked = false; action = 0; phase = "goal"; }
    playing = true;
    renderLoop();
    loopTimer = setTimeout(advanceLoop, phase === "goal" ? 900 : 1350);
  }

  $("action-beads").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    action = +button.dataset.action;
    phase = "execution";
    blocked = false;
    pauseLoop();
  });
  $("loop-play").onclick = () => playing ? pauseLoop() : playLoop();
  $("loop-replay").onclick = () => { action = 0; blocked = false; phase = "goal"; reduced ? pauseLoop() : playLoop(); };
  $("loop-block").onclick = () => { blocked = !blocked; phase = blocked ? "review" : "execution"; pauseLoop(); };
  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) { if (playing) pauseLoop(); return; }
    if (!loopStarted && !reduced) { loopStarted = true; phase = "goal"; playLoop(); }
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
      window.dispatchEvent(new CustomEvent("gearbox-update", {detail:state}));
    }});
    viewer.renderer.toneMappingExposure = 1.02;
    viewer.canvas.setAttribute("aria-label", "拖动旋转装配模型");
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
    readScroll();
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
    $("hero-model-loading").textContent = "场景暂未加载。";
    return null;
  });
  new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    if (heroVisible) ready.then(() => { mountHero(); scheduleIntro(); });
    else lastIntro = 0;
  }).observe(opening);
  function readScroll() {
    document.querySelector(".header").classList.toggle("scrolled", scrollY > 30);
    if (reduced) return;
    const root = opening.getBoundingClientRect(), target = slot.getBoundingClientRect();
    const targetY = target.top-root.top+target.height/2;
    bridgeProgress = clamp(-root.top/Math.max(1, targetY-innerHeight*.3));
    const progress = bridgeProgress*bridgeProgress*(3-2*bridgeProgress);
    const scale = innerWidth < 600 ? target.width/stage.offsetWidth
      : Math.min(target.width/stage.offsetWidth, target.height/stage.offsetHeight);
    const crop = Math.max(0, (1-target.height/(stage.offsetHeight*scale))*50);
    const x = target.left-root.left+target.width/2-stage.offsetLeft-stage.offsetWidth/2;
    const y = targetY-stage.offsetTop-stage.offsetHeight/2;
    const height = stage.offsetHeight*(1+(scale-1)*progress);
    const bottom = root.top+stage.offsetTop+stage.offsetHeight/2+y*progress+height/2;
    const clipBottom = Math.max(crop*progress, 100*clamp((bottom-board.getBoundingClientRect().top+20)/height));
    stage.style.transform = "translate(" + (x*progress) + "px," + (y*progress) + "px) scale(" + (1+(scale-1)*progress) + ")";
    stage.style.clipPath = "inset(" + (crop*progress) + "% 0 " + clipBottom + "% 0)";
    if (bridgeProgress > introAge/7600) introAge = bridgeProgress*7600;
    if (viewer && owner === "hero" && introFraction < 1) scheduleIntro();
  }
  addEventListener("scroll", readScroll, {passive:true});
  addEventListener("resize", () => { readScroll(); if (owner === "hero") scheduleIntro(); });
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
    document.querySelectorAll(".section-heading:not(.architecture-heading),.result-copy,.closing").forEach(node => {
      node.dataset.reveal = ""; observer.observe(node);
    });
  }
  renderLoop();
  readScroll();
  window.JevDuoScene = {ready, mountResult, get viewer(){return viewer;}, state:() => ({route, phase, action, blocked, playing, owner, introFraction, manualCamera, bridgeProgress})};
})();
