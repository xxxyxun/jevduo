/* Shared opening: existing assembly reconstruction, then the complete interactive object. */
"use strict";
window.GearboxIntro = {
  create(viewer, {camera}) {
    const $=id=>document.getElementById(id), end=window.gearboxData.trace.motion_start;
    const startCamera={target:[-.03,.005,.015],yaw:-1.15,elevation:.94,radius:.92};
    let active=false,manualCamera=false;
    const total=window.gearboxData.pieces;
    function controls(s) {
      $("intro-count").textContent=`${s.placed} / ${total} 件`;
      $("intro-seek").value=active?s.time:end;
      $("intro-play").disabled=!active;
      $("intro-play").textContent=active?(s.playing?"Ⅱ 暂停":"▶ 继续"):"✓ 已完成";
      $("intro-play").setAttribute("aria-label",active?(s.playing?"暂停首屏装配":"继续首屏装配"):"首屏装配已完成");
      $("intro-status").textContent=!active?"完整成品 · 拖动观察":
        s.time<150?"逐件搭建 · 四路模块逐渐成形":s.time<172?"模块汇合 · 连接到同一机构":"最后连接 · 完整总装";
    }
    function finish() {
      const saved=viewer.snapshot().camera;
      active=false;
      viewer.play(false);viewer.setPlaybackRate(1);viewer.setMode("product");
      viewer.setXray(false);viewer.setExploded(false);
      viewer.setCamera(manualCamera?saved:camera);
      controls(viewer.snapshot());
    }
    function frame(s) {
      const p=Math.max(0,Math.min(1,(s.time-145)/35)),w=p*p*(3-2*p);
      if(!manualCamera)viewer.setCamera({
        target:startCamera.target.map((v,i)=>v+(camera.target[i]-v)*w),
        yaw:startCamera.yaw+(camera.yaw-startCamera.yaw)*w,
        elevation:startCamera.elevation+(camera.elevation-startCamera.elevation)*w,
        radius:startCamera.radius+(camera.radius-startCamera.radius)*w,
      });
    }
    function update(s) {
      if(!active||s.mode!=="assembly")return;
      if(s.time>=end){finish();return;}
      frame(s);controls(s);
    }
    function start() {
      active=true;manualCamera=false;
      viewer.play(false);viewer.setXray(false);viewer.setExploded(false);
      viewer.setPlaybackRate(end/25);viewer.setMode("assembly");viewer.seek(0);
      viewer.setCamera(startCamera);
      if(matchMedia("(prefers-reduced-motion: reduce)").matches)finish();
      else viewer.play(true);
    }
    function pause(){viewer.play(false);}
    $("intro-seek").max=end;
    $("intro-seek").addEventListener("input",event=>{
      const requestedTime=+event.target.value;
      active=true;viewer.play(false);viewer.setPlaybackRate(end/25);viewer.setMode("assembly");
      viewer.seek(requestedTime);update(viewer.snapshot());
    });
    $("intro-play").addEventListener("click",()=>viewer.play(!viewer.snapshot().playing));
    $("intro-replay").addEventListener("click",start);
    $("intro-skip").addEventListener("click",finish);
    viewer.canvas.addEventListener("pointerdown",()=>{if(active)manualCamera=true;});
    return {start,finish,pause,update,get active(){return active;}};
  },
};
