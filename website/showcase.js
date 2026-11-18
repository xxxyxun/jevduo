"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const assets = document.documentElement.dataset.assets;
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const clock = value => `${Math.floor(value / 60).toString().padStart(2, "0")}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scenarios = {
    gui: {
      goal: "搜索指定零件，放置后保存模块。",
      description: "减少逐动作的慢模型往返和长文本生成，把推理留给目标、业务信息与必要验收。",
      steps: [
        {name:"明确子目标", rail:"plan", route:"Slow · Plan", options:["指定零件与目标模块", "提供准确编号与保存位置", "明确何时返回检查"], feedback:"上层给出目标、准确输入和返回条件。", planner:"慢模型介入 · 先给出明确子目标"},
        {name:"选择 GUI", rail:"route", route:"Router", options:["GUI · 当前界面操作", "CLI · 代码与文件处理", "扩展执行器"], feedback:"把当前子目标交给 GUI 执行路径。", planner:"路由分派 · 子目标保留，不逐步重写计划"},
        {name:"聚焦搜索", rail:"execute", route:"JEV · GUI", options:["点击零件搜索框", "展开分类菜单", "返回上层规划"], feedback:"新截图与可用控件进入选择。", planner:"上层暂不重规划 · JEV 继续选择"},
        {name:"写入编号", rail:"execute", route:"JEV · GUI", options:["写入已确认的零件编号", "清空其他字段", "返回上层规划"], feedback:"文本来自上层，不让选择器猜业务输入。", planner:"同一个子目标 · 输入来自已确认信息"},
        {name:"选择零件", rail:"execute", route:"JEV · GUI", options:["选择匹配的搜索结果", "点击不相关的分类", "请求更多观察"], feedback:"依据新观察选择下一步，不盲目执行预编动作。", planner:"上层暂不重规划 · 每次选择都有新观察"},
        {name:"放置零件", rail:"execute", route:"JEV · GUI", options:["在当前模块放置零件", "继续搜索其他零件", "返回上层规划"], feedback:"执行器送达动作，回执返回共享运行时。", planner:"连续局部执行 · 按返回条件控制范围"},
        {name:"保存模块", rail:"execute", route:"JEV · GUI", options:["保存当前模块", "关闭未保存工程", "再次放置同一零件"], feedback:"动作已执行不等于任务完成，还需要读回与检查。", planner:"子目标接近返回条件 · 准备提交执行证据", saved:true},
        {name:"检查返回", rail:"verify", route:"Slow · Verify", options:["结合执行证据独立检查", "更新任务状态与记忆", "决定继续、恢复或结束"], feedback:"JEV 的阶段结束请求不是整题成功评分。", planner:"慢模型再次介入 · 检查阶段结果", saved:true},
      ],
    },
    hybrid: {
      goal: "整理模块资料，在 GUI 中检查并保存。",
      description: "GUI 和 CLI 共享任务与执行反馈。适合代码的工作交给工具，界面操作交给 JEV，而不是固定只走一种路径。",
      steps: [
        {name:"拆出子目标", rail:"plan", route:"Slow · Plan", options:["明确需要处理的资料", "绑定输入与输出位置", "要求在界面中检查成果"], feedback:"规划模型确定工作内容与返回条件。", planner:"慢模型介入 · 生成目标与必要代码"},
        {name:"路由 CLI", rail:"route", route:"Router → CLI", options:["CLI · 处理资料与文件", "GUI · 当前不必逐项操作", "扩展执行器"], feedback:"当前子目标适合代码与文件工具。", planner:"路由分派 · 选择 CLI 工具路径"},
        {name:"工具执行", rail:"execute", route:"Slow · CLI", options:["运行明确的处理命令", "保留标准输出与执行回执", "不把退出码当业务验收"], feedback:"代码由慢模型提供，工具负责执行并返回结果。", planner:"CLI 执行 · 使用工具回执，而非虚构执行结果"},
        {name:"回到 GUI", rail:"route", route:"Router → GUI", options:["GUI · 打开并检查成果", "CLI · 继续相同命令", "结束整题"], feedback:"后续子目标需要真实软件中的观察与操作。", planner:"依据回执继续分派 · 交给 GUI 执行"},
        {name:"局部检查", rail:"execute", route:"JEV · GUI", options:["打开当前成果并检查", "重新处理相同资料", "忽略执行回执"], feedback:"JEV 根据当前控件与截图继续选择。", planner:"界面操作交给 JEV · 不重新生成整套方案"},
        {name:"保存返回", rail:"verify", route:"Slow · Verify", options:["检查保存与界面证据", "记录当前交付状态", "据结果继续下一子目标"], feedback:"共享执行证据，保留业务检查与阶段推进。", planner:"慢模型介入 · 判断当前成果是否满足要求", saved:true},
      ],
    },
    recovery: {
      goal: "遇到失效目标时，先查状态，再决定恢复。",
      description: "连续执行有边界：目标失效就重新观察；送达不确定先只读检查，不重放可能已经执行的操作。需要新计划时再返回上层。",
      steps: [
        {name:"给出目标", rail:"plan", route:"Slow · Plan", options:["明确当前业务子目标", "约束输入与执行范围", "列出需要返回的情况"], feedback:"恢复也围绕当前子目标，不凭空更换业务目标。", planner:"慢模型介入 · 给出有界子目标"},
        {name:"选择动作", rail:"execute", route:"JEV · GUI", options:["选择当前目标的合法动作", "重复上一次失效操作", "忽略当前窗口变化"], feedback:"JEV 选择动作，工具检查当前目标。", planner:"局部执行 · 等待真实送达回执"},
        {name:"目标失效", rail:"execute", route:"Tool · Feedback", options:["记录目标失效或歧义", "不替换为任意同名控件", "重新取得当前观察"], feedback:"工具反馈是状态约束，不是可以忽略的报错文字。", planner:"暂停这条动作路径 · 先明确发生了什么"},
        {name:"只读检查", rail:"execute", route:"Observe", options:["检查窗口与动作结果", "不确定时不自动重放", "保留原始执行回执"], feedback:"先判断操作是否已发生，避免重复提交或删除。", planner:"没有盲目重放 · 先查执行结果"},
        {name:"返回阻塞", rail:"route", route:"Return to Slow", options:["将具体阻塞交回上层", "附上当前观察与失败证据", "保留尚未完成的目标"], feedback:"当前路径无法继续时，带证据返回，而不是无效循环。", planner:"需要新信息或新路径 · 请求上层处理"},
        {name:"重新推进", rail:"verify", route:"Slow · Recover", options:["根据证据调整当前子目标", "明确新的合法执行路径", "继续观察与执行闭环"], feedback:"恢复方案仍需真实执行和后续检查。", planner:"慢模型介入 · 解决当前阻塞，再继续"},
      ],
    },
  };
  let scenario = "gui", step = 0, loopRunning = !reducedMotion, loopTimer = null;
  const visibleLoopSections = new Set();
  const scene = document.querySelector(".system-scene");
  const story = $("story");
  const stickyStory = matchMedia("(min-width:1000px) and (min-height:820px) and (prefers-reduced-motion:no-preference)");
  const storyFrames = [
    ["先想清楚，再交出一个目标。", "慢模型提供准确输入和返回条件，不预编整段点击。"],
    ["让合适的执行器接手。", "GUI、CLI 和扩展工具，共享同一份目标与执行反馈。"],
    ["同一个目标，连续选择。", "JEV 每次依据新观察选择动作，减少逐动作的慢模型往返与长文本生成。"],
    ["带着证据，才决定下一步。", "完成、遇阻或缺少信息时返回；独立验证后更新记忆，继续或结束。"],
  ];
  let storyPhase = -1, storyAction = -1, scrollQueued = false, manualCamera = false;

  function drawConnections() {
    const svg = scene.querySelector(".scene-connections"), bounds = svg.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const box = name => {
      const rect = scene.querySelector(`[data-node="${name}"]`).getBoundingClientRect();
      return {x:rect.x - bounds.x, y:rect.y - bounds.y, w:rect.width, h:rect.height};
    };
    const task = box("task"), plan = box("plan"), goal = box("goal"), route = box("route"), runtime = box("runtime");
    const cx = node => node.x + node.w / 2, bottom = node => node.y + node.h;
    const goalBus = (bottom(goal) + route.y) / 2;
    const wires = [
      ["task", `M${cx(plan)} ${bottom(task) + 3}V${plan.y - 5}`, storyPhase === 0],
      ["goal", `M${plan.x + plan.w + 3} ${plan.y + plan.h / 2}H${goal.x - 6}`, storyPhase === 0],
      ["route", `M${cx(goal)} ${bottom(goal) + 3}V${goalBus}H${cx(route)}V${route.y - 5}`, storyPhase === 1],
    ];
    for (const name of ["cli", "jev", "extension"]) {
      const worker = box(name), bus = bottom(route) + 8, out = runtime.y - 12;
      const selected = name === "jev" && (storyPhase === 1 || storyPhase === 2);
      wires.push([name, `M${cx(route)} ${bottom(route) + 2}V${bus}H${cx(worker)}V${worker.y - 5}`, selected]);
      wires.push([`${name}-result`, `M${cx(worker)} ${bottom(worker) + 2}V${out}H${cx(worker)}V${runtime.y - 5}`, name === "jev" && storyPhase >= 2]);
    }
    const jev = box("jev"), localX = cx(jev) + jev.w * .24;
    wires.push(["local", `M${localX} ${runtime.y - 3}V${bottom(jev) + 5}`, storyPhase === 2]);
    const edge = Math.max(11, plan.x * .4);
    wires.push(["return", `M${runtime.x - 2} ${runtime.y + runtime.h / 2}H${edge + 6}Q${edge} ${runtime.y + runtime.h / 2} ${edge} ${runtime.y + runtime.h / 2 - 6}V${plan.y + plan.h / 2 + 6}Q${edge} ${plan.y + plan.h / 2} ${edge + 6} ${plan.y + plan.h / 2}H${plan.x - 5}`, storyPhase === 3]);
    $("scene-wires").innerHTML = wires.map(([name, path, active]) => `<path class="wire-halo" d="${path}"/><path data-wire="${name}" class="scene-wire ${name === "return" || name === "local" ? name : ""} ${active ? "active" : ""}" d="${path}"/>`).join("");
  }

  function setStory(phase, action = 0) {
    if (phase === storyPhase && action === storyAction) return;
    storyPhase = phase; storyAction = action;
    $("story-index").textContent = `0${phase + 1} / 04`;
    $("story-title").textContent = storyFrames[phase][0];
    $("story-description").textContent = storyFrames[phase][1];
    document.querySelectorAll("[data-story]").forEach(button => button.setAttribute("aria-pressed", String(+button.dataset.story === phase)));
    scene.dataset.phase = phase;
    scene.classList.toggle("planning", phase === 0);
    scene.classList.toggle("working", phase === 2);
    scene.classList.toggle("verifying", phase === 3);
    scene.querySelector(".worker.jev").classList.toggle("selected-worker", phase === 1 || phase === 2);
    $("hero-status").textContent = phase === 2 ? `同一子目标 · 第 ${action + 1} 次选择 · 每次都有新观察` : phase === 3 ? "完成或遇阻时，带证据返回上层。" : phase === 1 ? "选中 GUI 路径；其他执行器保持可用。" : "上层给出目标、准确输入和返回条件。";
    drawConnections();
  }

  function updateScroll() {
    scrollQueued = false;
    if (stickyStory.matches) {
      const rect = story.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -rect.top / (rect.height - innerHeight)));
      const phase = progress < .18 ? 0 : progress < .34 ? 1 : progress < .86 ? 2 : 3;
      setStory(phase, phase === 2 ? Math.min(4, Math.floor((progress - .34) / .104)) : 0);
      scene.style.setProperty("--scene-y", `${-Math.sin(progress * Math.PI) * 9}px`);
    } else scene.style.removeProperty("--scene-y");
    if (!reducedMotion) {
      const filmRect = $("film-player").getBoundingClientRect();
      const entrance = Math.max(0, Math.min(1, (innerHeight - filmRect.top) / (innerHeight * .65)));
      document.querySelector(".film-wrap").style.setProperty("--film-scale", .96 + entrance * .04);
      if (viewer && !manualCamera) {
        const rect = $("result").getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (innerHeight - rect.top) / innerHeight));
        viewer.setCamera({yaw:-1.4 + progress * .2, elevation:.6 - progress * .05});
      }
    }
  }
  function queueScroll() {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateScroll); }
  }
  addEventListener("scroll", queueScroll, {passive:true});
  addEventListener("resize", () => { drawConnections(); queueScroll(); });
  new ResizeObserver(drawConnections).observe(scene);
  document.querySelectorAll("[data-story]").forEach(button => {
    button.onclick = () => {
      const phase = +button.dataset.story;
      if (stickyStory.matches) {
        const progress = [0, .24, .52, .94][phase];
        scrollTo({top:scrollY + story.getBoundingClientRect().top + (story.offsetHeight - innerHeight) * progress, behavior:"smooth"});
      } else setStory(phase);
    };
  });
  setStory(0);

  if (!reducedMotion) {
    document.documentElement.classList.add("motion-enabled");
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("revealed"); reveal.unobserve(entry.target); }
    }), {threshold:.12});
    document.querySelectorAll(".section-heading, .scenario-tabs, .loop-panel, .result-copy, .closing").forEach(node => {
      node.dataset.reveal = ""; reveal.observe(node);
    });
  }

  function renderLoop() {
    const current = scenarios[scenario], frame = current.steps[step];
    $("goal-text").textContent = current.goal;
    $("scenario-description").textContent = current.description;
    $("executor-pill").textContent = frame.route;
    $("planner-state").textContent = frame.planner;
    $("choice-feedback").textContent = frame.feedback;
    $("choice-title").textContent = frame.rail === "execute" ? frame.route.includes("JEV") ? "JEV 选择下一动作" : "执行与反馈" : frame.rail === "plan" ? "规划目标与输入" : frame.rail === "verify" ? "按返回条件检查" : "选择执行路径";
    $("choice-options").innerHTML = frame.options.map((text, i) => `<div class="choice-option ${i === 0 ? "selected" : ""}"><span>${String(i + 1).padStart(2, "0")}</span>${text}${i === 0 ? icon("check") : ""}</div>`).join("");
    $("app-save-state").textContent = frame.saved ? "已返回检查" : "执行中";
    $("app-value").textContent = scenario === "recovery" ? "只读检查当前状态" : scenario === "hybrid" ? "已提供的文件与输入" : "已提供的零件编号";
    const actions = current.steps.filter(entry => entry.rail === "execute").slice(0, 5);
    const passed = current.steps.slice(0, step).filter(entry => entry.rail === "execute").length;
    $("action-timeline").innerHTML = actions.map((entry, i) => `<div class="action-step ${i < passed ? "done" : i === passed && frame.rail === "execute" ? "active" : ""}"><span>STEP ${i + 1}</span><strong>${entry.name}</strong></div>`).join("");
    $("loop-play").innerHTML = loopRunning ? "暂停 <span>Ⅱ</span>" : "播放 <span>▶</span>";
    $("loop-play").setAttribute("aria-label", loopRunning ? "暂停机制演示" : "播放机制演示");
    clearTimeout(loopTimer);
    if (loopRunning && visibleLoopSections.size && !document.hidden) {
      loopTimer = setTimeout(() => { step = (step + 1) % current.steps.length; renderLoop(); }, frame.rail === "execute" ? 1400 : 2400);
    }
  }

  function selectScenario(name) {
    scenario = name; step = 0;
    document.querySelectorAll("[data-scenario]").forEach(button => {
      const selected = button.dataset.scenario === name;
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    $("loop-panel").setAttribute("aria-labelledby", `tab-${name}`);
    renderLoop();
  }
  const tabs = [...document.querySelectorAll("[data-scenario]")];
  tabs.forEach((button, index) => {
    button.onclick = () => selectScenario(button.dataset.scenario);
    button.onkeydown = event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      selectScenario(tabs[next].dataset.scenario); tabs[next].focus();
    };
  });
  $("loop-play").onclick = () => { loopRunning = !loopRunning; renderLoop(); };
  const loopObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visibleLoopSections.add(entry.target);
      else visibleLoopSections.delete(entry.target);
    });
    renderLoop();
  });
  loopObserver.observe($("execution"));
  renderLoop();

  let presentation, videos = {}, activeLane = "a", caseTime = 0, casePlaying = false, grid = false;
  let viewer = null, modelPromise = null;

  async function playCase(playing) {
    casePlaying = Boolean(playing);
    Object.values(videos).forEach(video => video.pause());
    $("case-play").innerHTML = casePlaying ? "Ⅱ" : icon("play");
    $("case-play").setAttribute("aria-label", casePlaying ? "暂停案例录像" : "播放案例录像");
    if (!casePlaying || !presentation) return;
    const selected = grid && activeLane !== "master" ? presentation.lanes.map(lane => videos[lane.id]) : [videos[activeLane]];
    try { await Promise.all(selected.map(video => video.play())); }
    catch { casePlaying = false; $("workspace-phase").textContent = "未能播放，请点击重试或观看上方影片。"; $("case-play").innerHTML = icon("play"); }
  }

  function renderCase() {
    if (!presentation) return;
    const isMaster = activeLane === "master";
    $("workspace-display").classList.toggle("grid", grid && !isMaster);
    $("grid-toggle").setAttribute("aria-pressed", String(grid && !isMaster));
    $("grid-toggle").innerHTML = `${icon("grid")} ${grid && !isMaster ? "聚焦当前桌面" : "四屏总览"}`;
    Object.entries(videos).forEach(([id, video]) => video.classList.toggle("active", id === activeLane));
    document.querySelectorAll("[data-workspace]").forEach(button => {
      const selected = button.dataset.workspace === activeLane;
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    $("workspace-title").textContent = isMaster ? "主工程总装" : presentation.lanes.find(lane => lane.id === activeLane).label;
    $("workspace-phase").textContent = isMaster ? "自建模块合入、对齐与保存" : caseTime < 3 ? "从空工程开始" : "搜索、放置与保存";
    $("case-seek").value = caseTime;
    $("case-clock").textContent = `${clock(caseTime)} / ${clock(presentation.parallel_seconds + presentation.master_seconds)}`;
  }

  function selectLane(id) {
    activeLane = id;
    if (id === "master" && caseTime < presentation.parallel_seconds) caseTime = presentation.parallel_seconds;
    if (id !== "master" && caseTime >= presentation.parallel_seconds) caseTime = 0;
    videos[id].currentTime = id === "master" ? caseTime - presentation.parallel_seconds : caseTime;
    renderCase(); playCase(casePlaying);
  }

  function seekCase(time) {
    caseTime = Math.min(presentation.parallel_seconds + presentation.master_seconds, Math.max(0, +time));
    activeLane = caseTime >= presentation.parallel_seconds ? "master" : activeLane === "master" ? "a" : activeLane;
    presentation.lanes.forEach(lane => { videos[lane.id].currentTime = Math.min(caseTime, presentation.parallel_seconds - .05); });
    videos.master.currentTime = Math.max(0, caseTime - presentation.parallel_seconds);
    renderCase(); playCase(casePlaying);
  }

  async function initCase() {
    presentation = window.showcasePresentation || await fetch(`${assets}presentation.json`).then(response => response.json());
    const lanes = [...presentation.lanes, {id:"master", label:"主工程总装"}];
    for (const lane of lanes) {
      const video = document.createElement("video");
      video.dataset.lane = lane.id; video.playsInline = true; video.muted = true;
      video.preload = "metadata"; video.playbackRate = +$("case-speed").value;
      video.src = `${assets}desktop-${lane.id}.mp4`;
      if (lane.id !== "master") video.poster = `${assets}desktop-${lane.id}.jpg`;
      video.setAttribute("aria-label", `${lane.label}历史桌面录像`);
      $("workspace-display").append(video); videos[lane.id] = video;
      const button = document.createElement("button");
      button.className = "workspace-tab"; button.dataset.workspace = lane.id;
      button.setAttribute("role", "tab"); button.setAttribute("aria-controls", "workspace-display");
      button.innerHTML = `${lane.id === "master" ? "" : `<img src="${assets}desktop-${lane.id}.jpg" alt="" loading="lazy">`}<span><b>${lane.id === "master" ? "ASSEMBLY" : `WORKSPACE ${lane.id.toUpperCase()}`}</b>${lane.label}</span>`;
      button.onclick = () => selectLane(lane.id);
      $("workspace-tabs").append(button);
      video.ontimeupdate = () => {
        if (lane.id !== (grid && activeLane !== "master" ? "a" : activeLane)) return;
        caseTime = video.currentTime + (lane.id === "master" ? presentation.parallel_seconds : 0);
        renderCase();
      };
      video.onended = () => {
        if (lane.id !== (grid && activeLane !== "master" ? "a" : activeLane)) return;
        if (lane.id !== "master") { caseTime = presentation.parallel_seconds; selectLane("master"); }
        else playCase(false);
      };
    }
    $("case-seek").max = presentation.parallel_seconds + presentation.master_seconds;
    $("case-play").onclick = () => {
      if (caseTime >= presentation.parallel_seconds + presentation.master_seconds - .1) seekCase(0);
      playCase(!casePlaying);
    };
    $("case-seek").oninput = event => seekCase(event.target.value);
    $("case-speed").onchange = event => Object.values(videos).forEach(video => { video.playbackRate = +event.target.value; });
    $("grid-toggle").onclick = () => {
      if (activeLane === "master") { caseTime = 0; activeLane = "a"; }
      grid = !grid; seekCase(caseTime);
    };
    document.querySelectorAll("[data-case-time]").forEach(button => { button.onclick = () => seekCase(button.dataset.caseTime); });
    new IntersectionObserver(entries => { if (!entries[0].isIntersecting) playCase(false); }).observe($("case-workspace"));
    renderCase();
  }
  let casePromise = null;
  $("execution-records").ontoggle = () => {
    if (!$("execution-records").open) { playCase(false); return; }
    if (!casePromise) casePromise = initCase().catch(() => { $("workspace-phase").textContent = "案例素材暂未加载，请检查网络连接。"; });
  };

  function updateModel(state) {
    $("model-gear").textContent = state.label;
    $("model-ratio").textContent = Math.abs(state.input) > .01 ? state.ratio.toFixed(2) : "—";
    $("model-seek").max = state.duration; $("model-seek").value = state.time;
    $("model-clock").textContent = clock(state.time);
    $("model-play").innerHTML = `${state.playing ? "Ⅱ" : icon("play")} ${state.playing ? "暂停回放" : "运动回放"}`;
    $("model-play").setAttribute("aria-label", state.playing ? "暂停运动记录" : "播放运动记录");
    document.querySelectorAll("[data-gear]").forEach(button => button.setAttribute("aria-pressed", String(+button.dataset.gear === state.gear)));
  }

  async function initModel() {
    window.gearboxData ||= await fetch(`${assets}model.json`).then(response => response.json());
    $("model-loading").remove();
    viewer = window.GearboxViewer.create($("model-mount"), {theme:"atlas", onUpdate:updateModel});
    viewer.setMode("motion"); viewer.play(false);
    viewer.canvas.addEventListener("pointerdown", () => { manualCamera = true; });
    $("result").addEventListener("focusin", () => { manualCamera = true; });
    window.gearboxData.labels.forEach((label, index) => {
      const button = document.createElement("button");
      button.textContent = label; button.dataset.gear = index;
      button.setAttribute("aria-label", label === "R" ? "倒挡" : label === "P" ? "驻车挡" : `${label} 挡`);
      button.onclick = () => viewer.setGear(index);
      $("gear-controls").append(button);
    });
    $("model-play").onclick = () => {
      if (viewer.snapshot().time >= viewer.snapshot().duration) viewer.seek(0);
      viewer.play(!viewer.snapshot().playing);
    };
    $("model-seek").oninput = event => viewer.seek(+event.target.value);
    $("model-zoom-in").onclick = () => viewer.zoom(.85);
    $("model-zoom-out").onclick = () => viewer.zoom(1.15);
    $("model-xray").onclick = () => {
      const next = !viewer.snapshot().xray; viewer.setXray(next);
      $("model-xray").setAttribute("aria-pressed", String(next));
    };
    document.querySelectorAll("[data-view]").forEach(button => {
      button.onclick = () => {
        viewer.setView(button.dataset.view);
        document.querySelectorAll("[data-view]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      };
    });
    updateModel(viewer.snapshot()); queueScroll();
  }

  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !modelPromise) {
      modelPromise = initModel().catch(() => {
        $("model-mount").textContent = "交互模型暂未加载成功；可先观看影片与桌面实录。";
      });
    }
    if (!entries[0].isIntersecting) viewer?.play(false);
  }, {rootMargin:"250px"}).observe($("result"));
  const film = $("film-player");
  film.onplay = () => { playCase(false); viewer?.play(false); };
  new IntersectionObserver(entries => { if (!entries[0].isIntersecting) film.pause(); }).observe(film);
  document.addEventListener("visibilitychange", () => {
    renderLoop();
    if (document.hidden) { playCase(false); viewer?.play(false); film.pause(); }
  });
  queueScroll();
  window.showcase = {selectScenario, seekCase, playCase, selectLane, get viewer() { return viewer; }, get videos() { return videos; }, state:() => ({scenario, step, loopRunning, storyPhase, storyAction, manualCamera, activeLane, caseTime, casePlaying, grid})};
})();
