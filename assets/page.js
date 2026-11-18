"use strict";
(() => {
  const $ = id => document.getElementById(id), D = window.gearboxData, media = window.demoMedia;
  const P = media.presentation, parallel = P.parallel_seconds, duration = parallel + P.master_seconds;
  const videos = {}, clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
  const clock = t => `${Math.floor(t/60).toString().padStart(2,"0")}:${Math.floor(t%60).toString().padStart(2,"0")}`;
  let desktopTime = 0, desktopPlaying = false, inMaster = false, focused = null, active = "product";
  let intro = null;
  let viewer, modelPlace = "product", moduleOpen = false, manualView = false, scrollFrame = 0;
  let motionTime = 0, motionPlaying = false, motionXray = false;

  function renderDesktop() {
    $("desktop-seek").value = desktopTime;
    $("desktop-clock").textContent = `${clock(desktopTime)} / ${clock(duration)}`;
    $("desktop-play").querySelector("span").textContent = desktopPlaying ? "Ⅱ" : "▶";
    $("desktop-play").querySelector("b").textContent = desktopPlaying ? "暂停实录" : "播放实录";
    $("desktop-play").setAttribute("aria-label", desktopPlaying ? "暂停桌面录像" : "播放桌面录像");
    $("master-play").textContent = desktopPlaying ? "Ⅱ 暂停总装" : "▶ 总装回放";
    $("desktop-now").textContent = inMaster ? "案例实录 · 合装与保存" : desktopTime < 3 ? "案例实录 · 从空工程开始" : "案例实录 · 搜索、放置与保存";
    P.lanes.forEach(lane => {
      let marker = lane.markers[0];
      for (const entry of lane.markers) { if (entry.at > desktopTime) break; marker = entry; }
      $("phase-" + lane.id).textContent = marker.import ? "导入自建模块" : marker.phase;
      $("count-" + lane.id).textContent = marker.count ? `保存点 ${marker.count} 件` : "空工程 / 0 件";
    });
    const jumps = [...document.querySelectorAll("[data-desktop-time]")];
    let current = jumps[0];
    jumps.forEach(button => { if (+button.dataset.desktopTime <= desktopTime) current = button; });
    jumps.forEach(button => button.classList.toggle("active", button === current));
  }

  function focusLane(id) {
    focused = id;
    $("desktop-grid").classList.toggle("focused", id !== null);
    document.querySelectorAll(".desktop-lane").forEach(node => {
      const selected = node.dataset.lane === id;
      node.classList.toggle("focused", selected);
      node.querySelector("button").textContent = selected ? "↙" : "↗";
      node.querySelector("button").setAttribute("aria-label", `${selected ? "恢复四屏" : "放大"} ${node.dataset.lane.toUpperCase()} 工作台`);
    });
  }

  function desktopMode() {
    const next = desktopTime >= parallel;
    if (next === inMaster) return;
    inMaster = next;
    Object.values(videos).forEach(video => video.pause());
    $("desktop-grid").hidden = next;
    $("master-stage").hidden = !next;
    $("master-play").hidden = !next;
    $("desktop-stage-label").innerHTML = `<i class="signal"></i> ${next ? "CASE INTEGRATION / 318 PIECES" : "CASE RECORDS / 04 WORKSPACES"}`;
  }

  async function playDesktop(value) {
    desktopPlaying = Boolean(value);
    Object.values(videos).forEach(video => video.pause());
    if (desktopPlaying && desktopTime >= duration) {
      desktopTime = 0; desktopMode();
      Object.values(videos).forEach(video => video.currentTime = 0);
    }
    renderDesktop();
    if (!desktopPlaying) return;
    const selected = inMaster ? [videos.master] : P.lanes.map(lane => videos[lane.id]);
    try { await Promise.all(selected.map(video => video.play())); }
    catch (error) {
      desktopPlaying = false;
      $("media-error").hidden = false;
      $("media-error").textContent = "录像未启动，请使用支持 MP4 的浏览器重试播放。";
      renderDesktop();
    }
  }

  function seekDesktop(value) {
    desktopTime = clamp(+value, 0, duration);
    desktopMode();
    P.lanes.forEach(lane => videos[lane.id].currentTime = Math.min(desktopTime, parallel - .05));
    videos.master.currentTime = Math.max(0, desktopTime - parallel);
    if (desktopPlaying) playDesktop(true);
    renderDesktop();
  }

  P.lanes.forEach(lane => {
    const node = document.createElement("article");
    node.className = "desktop-lane"; node.dataset.lane = lane.id;
    node.innerHTML = `<div class="lane-top"><span><i class="lane-id">${lane.id.toUpperCase()}</i>${lane.label}</span><button aria-label="放大 ${lane.id.toUpperCase()} 工作台">↗</button></div><div class="lane-video"><video playsinline muted preload="none" aria-label="${lane.label}真实桌面录像"></video></div><div class="lane-bottom"><span id="phase-${lane.id}"></span><output id="count-${lane.id}">空工程 / 0 件</output></div>`;
    $("desktop-grid").append(node);
    const video = node.querySelector("video");
    video.id = "desktop-" + lane.id; video.poster = media.poster(lane.id); video.src = media.video(lane.id);
    node.querySelector("button").onclick = () => focusLane(focused === lane.id ? null : lane.id);
    video.ondblclick = () => focusLane(focused === lane.id ? null : lane.id);
    videos[lane.id] = video;
  });
  videos.master = $("desktop-master"); videos.master.src = media.video("master");
  videos.a.ontimeupdate = () => {
    if (!inMaster) { desktopTime = videos.a.currentTime; renderDesktop(); }
  };
  videos.a.onended = () => {
    desktopTime = parallel; desktopMode(); videos.master.currentTime = 0;
    if (desktopPlaying) playDesktop(true); renderDesktop();
  };
  videos.master.ontimeupdate = () => {
    if (inMaster) { desktopTime = parallel + videos.master.currentTime; renderDesktop(); }
  };
  videos.master.onended = () => { desktopPlaying = false; desktopTime = duration; renderDesktop(); };
  $("desktop-play").onclick = () => playDesktop(!desktopPlaying);
  $("master-play").onclick = () => playDesktop(!desktopPlaying);
  $("desktop-seek").oninput = event => seekDesktop(+event.target.value);
  $("desktop-speed").onchange = event => Object.values(videos).forEach(video => video.playbackRate = +event.target.value);
  $("grid-button").onclick = () => { focusLane(null); if (inMaster) seekDesktop(0); };
  $("desktop-fullscreen").onclick = () => document.fullscreenElement ? document.exitFullscreen() : $("desktop-frame").requestFullscreen();
  document.querySelectorAll("[data-desktop-time]").forEach(button => button.onclick = () => seekDesktop(+button.dataset.desktopTime));
  document.addEventListener("keydown", event => { if (event.key === "Escape") focusLane(null); });
  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting && desktopPlaying) playDesktop(false);
  }, {threshold:0}).observe($("desktop-frame"));

  function renderModel(state) {
    if (modelPlace === "product") { intro?.update(state); return; }
    if (state.mode !== "motion") return;
    $("current-gear").textContent = state.label;
    $("ratio").textContent = Math.abs(state.input) > .01 ? state.ratio.toFixed(2) : "—";
    $("input-speed").textContent = state.input.toFixed(1);
    $("output-speed").textContent = state.output.toFixed(1);
    $("motion-seek").max = state.duration; $("motion-seek").value = state.time;
    $("motion-clock").textContent = `${clock(state.time)} / ${clock(state.duration)}`;
    $("motion-play").querySelector("span").textContent = state.playing ? "Ⅱ" : "▶";
    $("motion-play").querySelector("b").textContent = state.playing ? "暂停回放" : "运行回放";
    $("motion-xray").setAttribute("aria-pressed", String(state.xray));
    document.querySelectorAll("[data-gear]").forEach(button => button.setAttribute("aria-pressed", String(+button.dataset.gear === state.gear)));
  }

  viewer = window.GearboxViewer.create($("hero-mount"), {theme:"atlas", onUpdate:renderModel});
  intro = window.GearboxIntro.create(viewer, {camera:{target:[-.065,.014,.020],yaw:-1.2,elevation:.55,radius:.44}});
  intro.start();
  D.labels.forEach((label, index) => {
    const button = document.createElement("button");
    button.textContent = label; button.dataset.gear = index;
    button.setAttribute("aria-label", label === "R" ? "倒挡" : label === "P" ? "驻车挡" : `${label} 挡`);
    button.setAttribute("aria-pressed", String(index === 0));
    button.onclick = () => { showMotion(); viewer.setGear(index); };
    $("gear-buttons").append(button);
  });

  function moveModel(place) {
    if (place !== "product" && intro?.active) intro.finish();
    if (place === modelPlace) { viewer.setVisible(place !== "none"); return; }
    if (modelPlace === "motion") {
      const state = viewer.snapshot(); motionTime = state.time; motionPlaying = state.playing; motionXray = state.xray;
      viewer.play(false);
    }
    modelPlace = place;
    if (place === "none") { viewer.setVisible(false); return; }
    viewer.moveTo($(place === "product" ? "hero-mount" : "motion-mount"));
    viewer.setVisible(true); viewer.setMode(place === "product" ? "product" : "motion");
    viewer.setExploded(place === "product" && moduleOpen);
    viewer.setXray(place === "motion" && motionXray);
    if (place === "motion") { viewer.seek(motionTime); viewer.play(motionPlaying); }
    else manualView = false;
  }

  function showMotion() { moveModel("motion"); }
  $("motion-play").onclick = () => {
    showMotion();
    if (viewer.snapshot().time >= viewer.snapshot().duration) viewer.seek(0);
    viewer.play(!viewer.snapshot().playing);
  };
  $("motion-seek").oninput = event => { showMotion(); viewer.seek(+event.target.value); };
  $("motion-xray").onclick = () => { showMotion(); viewer.setXray(!viewer.snapshot().xray); };
  $("motion-zoom-in").onclick = () => { showMotion(); viewer.zoom(.85); };
  $("motion-zoom-out").onclick = () => { showMotion(); viewer.zoom(1.15); };
  $("motion-reset").onclick = () => { showMotion(); viewer.setView("overall"); selectView("motion", "overall"); };
  function selectView(kind, view) {
    document.querySelectorAll(`[data-${kind}-view]`).forEach(button => button.setAttribute("aria-pressed", String(button.dataset[`${kind}View`] === view)));
  }
  document.querySelectorAll("[data-motion-view]").forEach(button => button.onclick = () => {
    showMotion(); viewer.setView(button.dataset.motionView); selectView("motion", button.dataset.motionView);
  });
  document.querySelectorAll("[data-product-view]").forEach(button => button.onclick = () => {
    moveModel("product"); manualView = true;
    viewer.setView(button.dataset.productView); selectView("product", button.dataset.productView);
    if (button.dataset.productView === "overall" && moduleOpen) viewer.setCamera({radius:.68,elevation:.78});
  });

  function updateScroll() {
    scrollFrame = 0;
    const height = innerHeight, story = $("product").getBoundingClientRect();
    const motion = $("motion").getBoundingClientRect(), desktop = $("desktop").getBoundingClientRect();
    const progress = clamp(-story.top / (story.height - height));
    $("product-scene").style.setProperty("--progress", progress.toFixed(4));
    $("product-scene").classList.toggle("modules-visible", progress > .42);
    $("product-scene").querySelector(".module-copy").inert = progress < .42;
    $("product-scene").querySelector(".intro-console").inert = progress > .4;
    active = motion.top < height * .55 ? "motion" : desktop.top < height * .55 ? "desktop" : "product";
    document.querySelectorAll("[data-nav]").forEach(link => link.setAttribute("aria-current", String(link.dataset.nav === active)));
    const place = motion.top < height * .82 && motion.bottom > height * .1 ? "motion" : story.bottom > 0 && story.top < height ? "product" : "none";
    if (intro?.active && progress > .12) intro.finish();
    moveModel(place);
    if (place === "product" && !intro?.active) {
      const opened = progress > .42;
      if (opened !== moduleOpen) { moduleOpen = opened; viewer.setExploded(opened); manualView = false; }
      if (!manualView) {
        const p = clamp((progress - .12) / .65), eased = p * p * (3 - 2 * p);
        viewer.setCamera({yaw:-1.20 + eased * .15, elevation:.55 + eased * .23, radius:.44 + eased * .24, target:[-.065,.014,.02]});
      }
    }
  }
  function queueScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }
  addEventListener("scroll", queueScroll, {passive:true});
  addEventListener("resize", queueScroll);
  $("hero-mount").addEventListener("pointerdown", () => manualView = true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { playDesktop(false); viewer.play(false); viewer.setVisible(false); }
    else updateScroll();
  });
  window.designDemo = {
    viewer, intro, videos, seekDesktop, playDesktop, setPlaying:playDesktop, focus:focusLane,
    showMotion, setGear:index => { showMotion(); viewer.setGear(index); },
    state:() => ({active, time:desktopTime, playing:desktopPlaying, inMaster, focused, duration, modelPlace, desktop:{time:desktopTime,playing:desktopPlaying,inMaster,focused}, model:viewer.snapshot()})
  };
  renderDesktop(); updateScroll();
})();
