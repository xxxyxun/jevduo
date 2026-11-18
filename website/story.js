"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const pinned = matchMedia("(min-width:1000px) and (min-height:720px) and (prefers-reduced-motion:no-preference)");
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = (start, end, value) => { const t = clamp((value - start) / (end - start)); return t * t * (3 - 2 * t); };
  const story = $("story"), stage = document.querySelector(".mechanism-stage");
  const chapterPositions = [0, .28, .46, .69, .96];
  const chapters = [
    ["THINK WITH INTENT", "先明确目标，<br>再开始行动。", "慢模型理解任务，提供准确输入与返回条件。把明确的一小段工作交给执行端。", "思考目标，而不是预编每次点击。", "brain"],
    ["THINK WITH INTENT", "先明确目标，<br>再开始行动。", "慢模型理解任务，提供准确输入与返回条件。把明确的一小段工作交给执行端。", "思考目标，而不是预编每次点击。", "brain"],
    ["ROUTE WITH PURPOSE", "分工不同，<br>目标一致。", "界面操作交给 JEV，代码与文件处理走 CLI。不同路径共享目标与执行反馈。", "一个子目标，选择当前合适的路径。", "route"],
    ["ACT CONTINUOUSLY", "目标不变，<br>动作接着发生。", "每次新观察进入，JEV 选择下一动作。子目标内持续推进，减少逐动作的慢模型往返。", "少重复规划，少生成动作长文本。", "bolt"],
    ["CLOSE THE LOOP", "不是做过，<br>而是有证据。", "完成、遇阻或缺少信息时，带执行证据返回。独立验证后更新记忆，再决定下一步。", "连续执行有边界，任务状态有依据。", "check"],
  ];
  const actions = [
    ["搜索", "搜索界面已就绪", "点击零件搜索框", "展开无关分类", "返回上层规划", "焦点读回 → 接收新观察"],
    ["输入", "输入框已获得焦点", "输入已提供的零件编号", "修改其他字段", "请求补充信息", "字段值读回 → 接收新观察"],
    ["选择", "搜索结果已经出现", "选择匹配的零件", "点击无关分类", "请求更多观察", "选中状态读回 → 接收新观察"],
    ["放置", "当前零件已被选中", "在目标位置放置零件", "重复搜索同一零件", "返回上层规划", "执行回执返回 → 接收新观察"],
    ["保存", "本段放置操作已完成", "保存当前模块", "关闭未保存工程", "重复放置零件", "保存证据返回 → 按条件检查"],
  ];
  let viewer = null, owner = "hero", target = pinned.matches ? 0 : .28, progress = target;
  let phase = -1, route = "gui", action = -1, frameId = 0, last = 0;
  let introAge = 0, introFraction = reduced ? 1 : 0, localAge = 0, manualCamera = false;
  let wiresDirty = true, lastWireTime = 0;
  let sceneTime = -1, cameraAspect = 0, localTimer = null;

  function showAction(index) {
    if (index === action) return;
    action = index;
    const item = actions[index];
    $("observation-text").textContent = item[1];
    $("receipt-text").textContent = item[5];
    $("local-choice").innerHTML = item.slice(2, 5).map((text, i) => `<div class="choice-row ${i === 0 ? "selected" : ""}"><span>0${i + 1}</span>${text}${i === 0 ? icon("check") : ""}</div>`).join("");
    $("action-beads").innerHTML = actions.map((entry, i) => `<span class="action-bead ${i < index ? "done" : i === index ? "active" : ""}">${entry[0]}</span>`).join("");
    if (!reduced) $("local-choice").animate([{opacity:.3,transform:"translateY(5px)"},{opacity:1,transform:"none"}],{duration:260,easing:"ease-out"});
  }

  function changeChapter(next) {
    if (next === phase) return;
    phase = next;
    const item = chapters[phase];
    $("chapter-kicker").textContent = item[0]; $("chapter-title").innerHTML = item[1];
    $("chapter-description").textContent = item[2]; $("chapter-note").innerHTML = `${icon(item[4])}<span>${item[3]}</span>`;
    document.querySelectorAll(".chapter-nav [data-chapter]").forEach(button => button.setAttribute("aria-pressed", String(+button.dataset.chapter === phase)));
    stage.dataset.phase = phase;
    $("slow-status").textContent = phase === 3 ? "目标已给出 · 等待执行反馈" : phase === 4 ? "独立验证 · 更新任务记忆" : "理解任务 · 明确目标";
    document.querySelector(".slow-indicator").style.opacity = phase === 3 ? .2 : 1;
    if (phase === 3) localAge = 0;
    wiresDirty = true;
  }

  function position(node, opacity, transform) {
    node.style.opacity = opacity;
    node.style.transform = transform;
    node.style.pointerEvents = opacity > .65 ? "auto" : "none";
    node.style.visibility = opacity < .015 ? "hidden" : "visible";
    node.inert = opacity < .2;
  }

  function drawWires() {
    const svg = stage.querySelector(".mechanism-wires"), root = svg.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${root.width} ${root.height}`);
    const box = selector => {
      const r = stage.querySelector(selector).getBoundingClientRect();
      return {x:r.x-root.x,y:r.y-root.y,w:r.width,h:r.height};
    };
    const task = box(".task-ticket"), slow = box(".slow-node"), goal = box(".goal-ticket"), router = box(".route-heading"), evidence = box(".evidence-ticket");
    const cx = b => b.x + b.w/2, bottom = b => b.y+b.h;
    const wires = [];
    if (phase <= 1) {
      wires.push([`M${cx(task)} ${bottom(task)+4}V${slow.y-6}`,""]);
      wires.push([`M${cx(slow)} ${bottom(slow)+5}V${goal.y-6}`,""]);
    }
    if (phase === 2) wires.push([`M${cx(goal)} ${bottom(goal)+5}V${router.y-6}`,""]);
    if (phase === 3 && route === "gui") {
      const obs = box(".observation"), receipt = box(".local-receipt"), loop = box(".local-loop");
      const edge = -8, port = loop.x-3;
      wires.push([`M${port} ${receipt.y+receipt.h/2}H${edge+7}Q${edge} ${receipt.y+receipt.h/2} ${edge} ${receipt.y+receipt.h/2-7}V${obs.y+obs.h/2+7}Q${edge} ${obs.y+obs.h/2} ${edge+7} ${obs.y+obs.h/2}H${port}`,"flow"]);
    }
    if (phase === 4) {
      const edge = root.width-3;
      wires.push([`M${evidence.x+evidence.w+3} ${evidence.y+evidence.h/2}H${edge-10}Q${edge} ${evidence.y+evidence.h/2} ${edge} ${evidence.y+evidence.h/2-10}V${slow.y+slow.h/2+10}Q${edge} ${slow.y+slow.h/2} ${edge-10} ${slow.y+slow.h/2}H${slow.x+slow.w+6}`,"return"]);
    }
    $("story-wires").innerHTML = wires.map(([path,type])=>`<path class="story-wire ${type}" d="${path}"/>`).join("");
    wiresDirty = false;
  }

  function paint(now) {
    frameId = 0;
    const elapsed = last ? Math.min(now-last,2000) : 16; last = now;
    const moving = Math.abs(target-progress) > .00015;
    progress = reduced ? target : moving ? progress + (target-progress)*(1-Math.exp(-elapsed/115)) : target;
    const p = progress;
    changeChapter(p < .18 ? 0 : p < .39 ? 1 : p < .55 ? 2 : p < .86 ? 3 : 4);
    const heroFade = 1-smooth(.04,.14,p), enter = smooth(.16,.27,p), dock = smooth(.07,.36,p);
    position(document.querySelector(".hero-copy"), pinned.matches ? heroFade : 1, `translateY(${-dock*45}px)`);
    position(document.querySelector(".assembly-stage"), pinned.matches ? 1-smooth(.4,.58,p) : 1, `translate(${-dock*43}vw,${dock*25}vh) scale(${1-dock*.62})`);
    const caption = document.querySelector(".assembly-caption"), captionOpacity = 1-smooth(.06,.16,p);
    caption.style.opacity = captionOpacity; caption.inert = pinned.matches && captionOpacity<.2;
    position($("execution"), pinned.matches ? enter : 1, `translateY(${(1-enter)*35}px)`);
    const stageEnter = smooth(.12,.24,p);
    position(stage, pinned.matches ? stageEnter : 1, `translateY(${(1-stageEnter)*55}px)`);
    position(stage.querySelector(".task-ticket"), 1-smooth(.32,.47,p), `translateY(${-smooth(.28,.47,p)*45}px)`);
    const slowOpacity = 1-smooth(.28,.34,p)+.72*smooth(.65,.69,p)+.28*smooth(.86,.96,p);
    position(stage.querySelector(".slow-node"), slowOpacity, `translateY(${smooth(.48,.65,p)*7}px) scale(${1-smooth(.28,.34,p)*.1+smooth(.86,.98,p)*.1})`);
    position(stage.querySelector(".goal-ticket"), 1, `translateY(${-smooth(.36,.64,p)*220}px)`);
    const routeOpacity = smooth(.29,.4,p)*(1-smooth(.53,.65,p));
    position(stage.querySelector(".route-fan"), routeOpacity, `translateY(${-smooth(.32,.56,p)*115}px) scale(${1-smooth(.54,.65,p)*.08})`);
    const localOpacity = smooth(.51,.65,p)*(1-smooth(.79,.87,p));
    position(stage.querySelector(".local-loop"), route === "gui" ? localOpacity : 0, `translateY(${(1-smooth(.51,.65,p))*90-smooth(.79,.87,p)*40}px) scale(${.94+smooth(.51,.65,p)*.06})`);
    position(stage.querySelector(".tool-preview"), route === "gui" ? 0 : localOpacity, `translateY(${(1-smooth(.51,.65,p))*70}px)`);
    position(stage.querySelector(".evidence-ticket"), smooth(.85,.96,p), `translateY(${(1-smooth(.85,.96,p))*55}px)`);
    if (phase === 3 && !document.hidden) localAge += reduced ? 0 : elapsed;
    showAction(reduced ? 1 : Math.floor(localAge/1450)%actions.length);
    if (viewer && owner === "hero") {
      if (!document.hidden) introAge += elapsed;
      introFraction = Math.max(introFraction, reduced ? 1 : Math.min(introAge/8500,1), pinned.matches ? smooth(0,.18,p) : 0);
      const nextTime = 12+168*introFraction;
      const aspect = $("hero-model-mount").clientWidth/$("hero-model-mount").clientHeight;
      if (Math.abs(nextTime-sceneTime)>.02 || Math.abs(aspect-cameraAspect)>.01) {
        viewer.seek(nextTime); sceneTime=nextTime;
        cameraAspect=aspect;
        if (!manualCamera) viewer.setCamera({yaw:-1.22+introFraction*.1,elevation:.86-introFraction*.22,radius:(.80-introFraction*.24)*Math.max(1,1.5/aspect),target:[-.03-introFraction*.035,.005+introFraction*.009,.015+introFraction*.005]});
      }
    }
    if (wiresDirty || (moving && now-lastWireTime>70)) { drawWires(); lastWireTime = now; }
    const filmTop = $("film-player").getBoundingClientRect().top;
    const filmEntrance = clamp((innerHeight-filmTop)/(innerHeight*.65));
    document.querySelector(".film-wrap").style.setProperty("--film-scale", reduced ? 1 : .96+filmEntrance*.04);
    if (moving || (!document.hidden && viewer && owner==="hero" && introFraction<1)) schedule();
    else if (!document.hidden && phase===3 && !reduced && story.getBoundingClientRect().bottom>0) localTimer=setTimeout(schedule,Math.max(40,1450-localAge%1450));
  }
  function schedule() { clearTimeout(localTimer); if (!frameId) frameId = requestAnimationFrame(paint); }
  function readScroll() {
    if (pinned.matches) { const r = story.getBoundingClientRect(); target = clamp(-r.top/(r.height-innerHeight)); }
    schedule();
  }
  function selectChapter(index) {
    if (pinned.matches) scrollTo({top:scrollY+story.getBoundingClientRect().top+(story.offsetHeight-innerHeight)*chapterPositions[index],behavior:"smooth"});
    else { target = chapterPositions[index]; schedule(); }
  }
  document.querySelectorAll("[data-chapter]").forEach(button => button.addEventListener("click",event=>{
    event.preventDefault(); selectChapter(+button.dataset.chapter);
    if (button.tagName==="A" && !pinned.matches) $("execution").scrollIntoView({behavior:reduced?"instant":"smooth"});
  }));
  document.querySelector('nav a[href="#execution"]').onclick = event => { event.preventDefault(); selectChapter(1); if (!pinned.matches) $("execution").scrollIntoView({behavior:reduced?"instant":"smooth"}); };
  stage.querySelectorAll("button[data-route]").forEach(button => button.onclick = () => {
    route = button.dataset.route; stage.dataset.route = route;
    stage.querySelectorAll("button[data-route]").forEach(item=>item.setAttribute("aria-pressed",String(item===button)));
    $("route-description").textContent = route === "gui" ? "界面操作，交给 JEV 连续选择。" : route === "cli" ? "代码由慢模型提供，工具执行并返回回执。" : "按组件接口接入其他执行器，共享回执。";
    $("tool-title").textContent = route === "cli" ? "CLI 工具路径" : "可扩展执行路径";
    $("tool-description").textContent = route === "cli" ? "慢模型提供代码与准确输入，工具执行后返回真实回执。" : "按任务需求接入执行组件；这里展示扩展接口，不代表已运行额外执行器。";
    wiresDirty = true; schedule();
  });
  $("intro-replay").onclick = () => { introAge = 0; introFraction = 0; manualCamera = false; schedule(); };
  addEventListener("scroll",readScroll,{passive:true});
  addEventListener("resize",()=>{ if (!pinned.matches && target===0) target=.28; wiresDirty=true; readScroll(); });
  new ResizeObserver(()=>{wiresDirty=true;schedule();}).observe(stage);
  document.addEventListener("visibilitychange",()=>{last=0;if(document.hidden)viewer?.play(false);else schedule();});

  async function initScene() {
    window.gearboxData ||= await fetch(`${document.documentElement.dataset.assets}model.json`).then(response=>response.json());
    viewer = window.GearboxViewer.create($("hero-model-mount"),{theme:"atlas",onUpdate:state=>{
      $("assembly-count").textContent = `${state.placed} / ${state.pieces} 件`;
      window.dispatchEvent(new CustomEvent("gearbox-update",{detail:state}));
    }});
    viewer.renderer.toneMappingExposure = 1.08;
    viewer.setMode("assembly"); viewer.play(false); viewer.seek(reduced ? 180 : 12);
    viewer.setCamera({yaw:-1.22,elevation:.86,radius:.80});
    $("hero-model-loading").remove();
    document.querySelector(".assembly-poster").style.opacity = 0;
    viewer.canvas.addEventListener("pointerdown",()=>{manualCamera=true;});
    introAge=0;last=0;schedule();
    return viewer;
  }
  function mountResult() {
    if (!viewer || owner==="result") return;
    owner="result";introFraction=1;viewer.play(false);viewer.moveTo($("model-mount"));viewer.setMode("motion");
    $("model-loading")?.remove();
  }
  function mountHero() {
    if (!viewer || owner==="hero") return;
    owner="hero";manualCamera=false;sceneTime=-1;viewer.play(false);viewer.moveTo($("hero-model-mount"));viewer.setMode("assembly");schedule();
  }
  const ready = initScene().catch(()=>{
    $("hero-model-loading").textContent="交互场景暂未载入，可继续观看影片。";
    return null;
  });
  new IntersectionObserver(entries=>{if(entries[0].isIntersecting)ready.then(mountHero);}).observe(document.querySelector(".hero-copy"));
  if (!reduced) {
    document.documentElement.classList.add("motion-enabled");
    const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add("revealed");observer.unobserve(entry.target);}
    }),{threshold:.12});
    document.querySelectorAll(".benefits>div,.section-heading,.result-copy,.closing").forEach(node=>{node.dataset.reveal="";observer.observe(node);});
  }
  showAction(0);readScroll();
  window.JevDuoScene = {ready,mountResult,selectChapter,get viewer(){return viewer;},state:()=>({progress,target,phase,route,action,owner,introFraction,manualCamera,pinned:pinned.matches})};
})();
