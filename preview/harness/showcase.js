"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const assets = document.documentElement.dataset.assets;
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const clock = value => `${Math.floor(value/60).toString().padStart(2,"0")}:${Math.floor(value%60).toString().padStart(2,"0")}`;
  const scene = window.JevDuoScene;
  let presentation, videos = {}, activeLane = "a", caseTime = 0, casePlaying = false, grid = false;

  async function playCase(playing) {
    casePlaying = Boolean(playing);
    Object.values(videos).forEach(video=>video.pause());
    $("case-play").innerHTML = casePlaying ? "Ⅱ" : icon("play");
    $("case-play").setAttribute("aria-label",casePlaying ? "暂停案例录像" : "播放案例录像");
    if (!casePlaying || !presentation) return;
    const selected = grid && activeLane!=="master" ? presentation.lanes.map(lane=>videos[lane.id]) : [videos[activeLane]];
    try { await Promise.all(selected.map(video=>video.play())); }
    catch { casePlaying=false;$("workspace-phase").textContent="未能播放，请点击重试或观看上方影片。";$("case-play").innerHTML=icon("play"); }
  }
  function renderCase() {
    if (!presentation) return;
    const master = activeLane==="master";
    $("workspace-display").classList.toggle("grid",grid&&!master);
    $("grid-toggle").setAttribute("aria-pressed",String(grid&&!master));
    $("grid-toggle").innerHTML=`${icon("grid")} ${grid&&!master ? "聚焦当前桌面" : "四屏总览"}`;
    Object.entries(videos).forEach(([id,video])=>video.classList.toggle("active",id===activeLane));
    document.querySelectorAll("[data-workspace]").forEach(button=>{
      const selected=button.dataset.workspace===activeLane;
      button.setAttribute("aria-selected",String(selected));button.tabIndex=selected?0:-1;
    });
    $("workspace-title").textContent=master ? "主工程总装" : presentation.lanes.find(lane=>lane.id===activeLane).label;
    $("workspace-phase").textContent=master ? "自建模块合入、对齐与保存" : caseTime<3 ? "从空工程开始" : "搜索、放置与保存";
    $("case-seek").value=caseTime;
    $("case-clock").textContent=`${clock(caseTime)} / ${clock(presentation.parallel_seconds+presentation.master_seconds)}`;
  }
  function selectLane(id) {
    activeLane=id;
    if(id==="master"&&caseTime<presentation.parallel_seconds)caseTime=presentation.parallel_seconds;
    if(id!=="master"&&caseTime>=presentation.parallel_seconds)caseTime=0;
    videos[id].currentTime=id==="master"?caseTime-presentation.parallel_seconds:caseTime;
    renderCase();playCase(casePlaying);
  }
  function seekCase(time) {
    caseTime=Math.min(presentation.parallel_seconds+presentation.master_seconds,Math.max(0,+time));
    activeLane=caseTime>=presentation.parallel_seconds?"master":activeLane==="master"?"a":activeLane;
    presentation.lanes.forEach(lane=>{videos[lane.id].currentTime=Math.min(caseTime,presentation.parallel_seconds-.05);});
    videos.master.currentTime=Math.max(0,caseTime-presentation.parallel_seconds);
    renderCase();playCase(casePlaying);
  }
  async function initCase() {
    presentation=window.showcasePresentation||await fetch(`${assets}presentation.json`).then(response=>response.json());
    const lanes=[...presentation.lanes,{id:"master",label:"主工程总装"}];
    for(const lane of lanes){
      const video=document.createElement("video");
      video.dataset.lane=lane.id;video.playsInline=true;video.muted=true;video.preload="metadata";
      video.playbackRate=+$("case-speed").value;video.src=`${assets}desktop-${lane.id}.mp4`;
      if(lane.id!=="master")video.poster=`${assets}desktop-${lane.id}.jpg`;
      video.setAttribute("aria-label",`${lane.label}历史桌面录像`);
      $("workspace-display").append(video);videos[lane.id]=video;
      const button=document.createElement("button");
      button.className="workspace-tab";button.dataset.workspace=lane.id;
      button.setAttribute("role","tab");button.setAttribute("aria-controls","workspace-display");
      button.innerHTML=`${lane.id==="master"?"":`<img src="${assets}desktop-${lane.id}.jpg" alt="" loading="lazy">`}<span><b>${lane.id==="master"?"ASSEMBLY":`WORKSPACE ${lane.id.toUpperCase()}`}</b>${lane.label}</span>`;
      button.onclick=()=>selectLane(lane.id);$("workspace-tabs").append(button);
      video.ontimeupdate=()=>{
        if(lane.id!==(grid&&activeLane!=="master"?"a":activeLane))return;
        caseTime=video.currentTime+(lane.id==="master"?presentation.parallel_seconds:0);renderCase();
      };
      video.onended=()=>{
        if(lane.id!==(grid&&activeLane!=="master"?"a":activeLane))return;
        if(lane.id!=="master"){caseTime=presentation.parallel_seconds;selectLane("master");}else playCase(false);
      };
    }
    $("case-seek").max=presentation.parallel_seconds+presentation.master_seconds;
    $("case-play").onclick=()=>{
      if(caseTime>=presentation.parallel_seconds+presentation.master_seconds-.1)seekCase(0);
      playCase(!casePlaying);
    };
    $("case-seek").oninput=event=>seekCase(event.target.value);
    $("case-speed").onchange=event=>Object.values(videos).forEach(video=>{video.playbackRate=+event.target.value;});
    $("grid-toggle").onclick=()=>{
      if(activeLane==="master"){caseTime=0;activeLane="a";}
      grid=!grid;seekCase(caseTime);
    };
    document.querySelectorAll("[data-case-time]").forEach(button=>{button.onclick=()=>seekCase(button.dataset.caseTime);});
    new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)playCase(false);}).observe($("case-workspace"));
    renderCase();
  }
  let casePromise=null;
  $("execution-records").ontoggle=()=>{
    if(!$("execution-records").open){playCase(false);return;}
    if(!casePromise)casePromise=initCase().catch(()=>{$("workspace-phase").textContent="案例素材暂未加载，请检查网络连接。";});
  };

  function updateModel(state) {
    if(scene.state().owner!=="result")return;
    $("model-gear").textContent=state.label;
    $("model-ratio").textContent=Math.abs(state.input)>.01?state.ratio.toFixed(2):"—";
    $("model-seek").max=state.duration;$("model-seek").value=state.time;$("model-clock").textContent=clock(state.time);
    $("model-play").innerHTML=`${state.playing?"Ⅱ":icon("play")} ${state.playing?"暂停回放":"运动回放"}`;
    $("model-play").setAttribute("aria-label",state.playing?"暂停运动记录":"播放运动记录");
    document.querySelectorAll("[data-gear]").forEach(button=>button.setAttribute("aria-pressed",String(+button.dataset.gear===state.gear)));
  }
  window.addEventListener("gearbox-update",event=>updateModel(event.detail));
  scene.ready.then(viewer=>{
    if(!viewer)return;
    window.gearboxData.labels.forEach((label,index)=>{
      const button=document.createElement("button");button.textContent=label;button.dataset.gear=index;
      button.setAttribute("aria-label",label==="R"?"倒挡":label==="P"?"驻车挡":`${label} 挡`);
      button.onclick=()=>viewer.setGear(index);$("gear-controls").append(button);
    });
    $("model-play").onclick=()=>{
      if(viewer.snapshot().time>=viewer.snapshot().duration)viewer.seek(0);
      viewer.play(!viewer.snapshot().playing);
    };
    $("model-seek").oninput=event=>viewer.seek(+event.target.value);
    $("model-zoom-in").onclick=()=>viewer.zoom(.85);$("model-zoom-out").onclick=()=>viewer.zoom(1.15);
    $("model-xray").onclick=()=>{
      const next=!viewer.snapshot().xray;viewer.setXray(next);$("model-xray").setAttribute("aria-pressed",String(next));
    };
    document.querySelectorAll("[data-view]").forEach(button=>{button.onclick=()=>{
      viewer.setView(button.dataset.view);
      document.querySelectorAll("[data-view]").forEach(item=>item.setAttribute("aria-pressed",String(item===button)));
    };});
  });
  let resultNear=false;
  new IntersectionObserver(entries=>{
    resultNear=entries[0].isIntersecting;
    if(resultNear)scene.ready.then(()=>{if(resultNear)scene.mountResult();});
    else if(scene.state().owner==="result")scene.viewer?.play(false);
  },{rootMargin:"200px"}).observe($("result"));
  const film=$("film-player");
  film.onplay=()=>{playCase(false);scene.viewer?.play(false);};
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)film.pause();}).observe(film);
  document.addEventListener("visibilitychange",()=>{if(document.hidden){playCase(false);scene.viewer?.play(false);film.pause();}});
  window.showcase={seekCase,playCase,selectLane,get viewer(){return scene.viewer;},get videos(){return videos;},state:()=>({...scene.state(),activeLane,caseTime,casePlaying,grid})};
})();
