/* One offline scene: source geometry, reconstructed assembly, recorded joint playback. */
"use strict";
window.GearboxViewer = {
  create(mount, options = {}) {
    const T = window.THREE, D = window.gearboxData, A = D.trace;
    const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
    const ease = v => {v = clamp(v); return v * v * (3 - 2 * v);};
    const quat = q => new T.Quaternion(q[1], q[2], q[3], q[0]);
    const themes = {
      warm: {sky:0xfff6df, ground:0x7c8775, key:0xfff2df, fill:0xdce9f4, exposure:1.12, frame:0xd6d2bc, gear:0x737b75},
      noir: {sky:0xe0eaff, ground:0x34353a, key:0xffe6ca, fill:0x8da9d5, exposure:1.16, frame:0x454e56, gear:0xb7bdbb},
      atlas:{sky:0xe8f0f4, ground:0x6f7a7d, key:0xf7fbff, fill:0xd6e1ea, exposure:1.12, frame:0xbcc5c4, gear:0x687378},
    };
    const theme = themes[options.theme || "warm"], scene = new T.Scene(), model = new T.Group();
    scene.add(model, new T.HemisphereLight(theme.sky, theme.ground, 2.4));
    const key = new T.DirectionalLight(theme.key, 3.5);
    key.position.set(0.04,-0.22,0.42); key.castShadow = true;
    key.shadow.mapSize.set(1024,1024); key.shadow.camera.left = -0.42; key.shadow.camera.right = 0.42;
    key.shadow.camera.top = 0.4; key.shadow.camera.bottom = -0.4;
    key.shadow.camera.near = 0.01; key.shadow.camera.far = 1.4;
    key.shadow.bias = -0.00015; key.shadow.normalBias = 0.0003; key.shadow.radius = 3;
    key.target.position.set(-0.06,0,0); scene.add(key,key.target);
    const fill = new T.DirectionalLight(theme.fill, 1.9); fill.position.set(-0.3,0.22,0.22); scene.add(fill);
    const rim = new T.DirectionalLight(0xffffff, 1.3); rim.position.set(-0.2,0.08,0.4); scene.add(rim);
    const renderer = new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.5));
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = theme.exposure; renderer.setClearColor(0x000000,0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const canvas = renderer.domElement; canvas.setAttribute("aria-label","318 件变速箱，可拖动旋转");
    canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab";
    const camera = new T.PerspectiveCamera(33,1,0.001,5); camera.up.set(0,0,1);
    function stl(encoded) {
      const bytes = Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)), view = new DataView(bytes.buffer);
      const count = view.getUint32(80,true), p = new Float32Array(count*9), n = new Float32Array(count*9);
      for(let i=0;i<count;i++) for(let v=0;v<3;v++) for(let k=0;k<3;k++) {
        p[i*9+v*3+k]=view.getFloat32(84+i*50+12+v*12+k*4,true);
        n[i*9+v*3+k]=view.getFloat32(84+i*50+k*4,true);
      }
      const g = new T.BufferGeometry(); g.setAttribute("position",new T.BufferAttribute(p,3));
      g.setAttribute("normal",new T.BufferAttribute(n,3)); g.computeBoundingSphere(); return g;
    }
    const geometries = Object.fromEntries(Object.entries(D.meshes).map(([name,b])=>[name,stl(b)]));
    const materials = new Map(), bodies = [], records = [], byIndex = new Map();
    const placements = new Map(A.events.filter(e=>e.kind==="place").map(e=>[e.native_index,e]));
    const modules = new Map(A.modules.map(m=>[m.id,m]));
    for(const description of D.bodies) {
      const body = new T.Group(); body.name=description.name;
      body.position.set(...description.pos); body.quaternion.copy(quat(description.quat));
      (description.parent<0?model:bodies[description.parent]).add(body); bodies.push(body);
      body.userData={basePos:body.position.clone(),baseQuat:body.quaternion.clone(),axis:description.axis?new T.Vector3(...description.axis):null};
      for(const p of description.parts) {
        const role=p.assembly.role, color=role==="frame"?theme.frame:role==="gear"?theme.gear:p.assembly.color.hex;
        const materialKey=`${color}/${p.frame}`;
        if(!materials.has(materialKey)) materials.set(materialKey,new T.MeshPhysicalMaterial({
          color,roughness:0.31,metalness:0.015,clearcoat:0.24,clearcoatRoughness:0.32,side:T.DoubleSide,
        }));
        const mesh=new T.Mesh(geometries[p.mesh],materials.get(materialKey)); mesh.name=p.assembly.id;
        mesh.castShadow=true;mesh.receiveShadow=true;mesh.position.set(...p.pos);mesh.quaternion.copy(quat(p.quat));body.add(mesh);
        const record={mesh,body,p,basePos:mesh.position.clone(),baseQuat:mesh.quaternion.clone(),event:placements.get(p.assembly.native_index)};
        records.push(record);byIndex.set(p.assembly.native_index,record);
      }
    }
    const firstPose=D.samples[0].slice(4,4+D.joints.length), turn=new T.Quaternion(), shift=new T.Vector3();
    function applyPose(pose) {
      D.bodies.forEach((d,i)=>{
        if(d.joint===undefined)return;const body=bodies[i],q=pose[d.joint];
        if(d.type==="slide")body.position.copy(body.userData.basePos).add(shift.copy(body.userData.axis).multiplyScalar(q).applyQuaternion(body.userData.baseQuat));
        else body.quaternion.copy(body.userData.baseQuat).multiply(turn.setFromAxisAngle(body.userData.axis,q));
      });model.updateMatrixWorld(true);
    }
    applyPose(firstPose);
    for(const r of records) {
      r.inverseParent=r.body.getWorldQuaternion(new T.Quaternion()).invert();
      r.twist=r.baseQuat.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...r.event.orientation_twist_local_rad)));
    }
    const bounds=new T.Box3().setFromObject(model), ground=new T.Mesh(new T.PlaneGeometry(2.4,2.4),new T.ShadowMaterial({opacity:0.15}));
    ground.position.set(-0.06,0,bounds.min.z-0.002);ground.receiveShadow=true;scene.add(ground);
    const presets={
      overall:{target:[-0.065,0.014,0.020],yaw:-1.20,elevation:0.55,radius:0.44},
      shift:{target:[-0.062,0.022,0.036],yaw:-1.15,elevation:0.70,radius:0.185},
      output:{target:[-0.139,0.003,0.025],yaw:-2.20,elevation:0.50,radius:0.21},
    };
    let mode="product",time=0,playing=false,xray=false,exploded=false,gear=0,frameIndex=0,playbackRate=1;
    let yaw=-1.20,elevation=0.55,radius=0.44,selectedView="overall",target=new T.Vector3(...presets.overall.target);
    let host=mount,intersecting=true,visible=true,raf=0,lastClock=0,lastNotify=-Infinity,destroyed=false;
    let stats={placed:D.pieces,visible:D.pieces,input:0,output:0,ratio:0,pose:firstPose};
    const offset=new T.Vector3(), tmp=new T.Vector3();
    function duration(){return mode==="assembly"?A.motion_start:mode==="motion"?D.samples.at(-1)[0]:0;}
    function updateState() {
      let pose=firstPose,input=0,output=0;
      if(mode==="motion") {
        if(time<D.samples[frameIndex][0])frameIndex=0;
        while(frameIndex+1<D.samples.length-1&&D.samples[frameIndex+1][0]<=time)frameIndex++;
        const a=D.samples[frameIndex],b=D.samples[Math.min(frameIndex+1,D.samples.length-1)],w=clamp((time-a[0])/(b[0]-a[0]||1));
        pose=firstPose.map((_,j)=>a[4+j]+(b[4+j]-a[4+j])*w);
        input=a[2]+(b[2]-a[2])*w;output=a[3]+(b[3]-a[3])*w;gear=a[1];
      }
      applyPose(pose);let placed=0,count=0;
      for(const r of records) {
        r.mesh.position.copy(r.basePos);r.mesh.quaternion.copy(r.baseQuat);r.mesh.visible=true;
        if(mode==="assembly") {
          const e=r.event,p=clamp((time-e.start)/e.duration);r.mesh.visible=time>e.start;
          if(p>=1)placed++;if(!r.mesh.visible)continue;
          const m=modules.get(e.module),dock=m.dock_start===undefined?0:ease((time-m.dock_start)/m.dock_duration);
          offset.fromArray(e.entry_offset_world_m).lerp(tmp.fromArray(e.approach_offset_world_m),ease(p/0.66));
          if(p>0.66)offset.fromArray(e.approach_offset_world_m).multiplyScalar(1-ease((p-0.66)/0.34));
          offset.add(tmp.fromArray(m.offset).multiplyScalar(1-dock));
          if(m.dock_start!==undefined)offset.z+=0.025*Math.sin(Math.PI*dock);
          r.mesh.position.add(offset.applyQuaternion(r.inverseParent));r.mesh.quaternion.copy(r.twist).slerp(r.baseQuat,ease(p/0.66));
        } else {
          placed++;
          if(exploded) {
            const m=modules.get(r.p.assembly.module);offset.fromArray(m.offset).multiplyScalar(0.45);
            if(m.id==="finish")offset.z=0.035;
            r.mesh.position.add(offset.applyQuaternion(r.inverseParent));
          }
        }
        count++;
      }
      stats={placed,visible:count,input,output,ratio:Math.abs(input)>0.01?output/input:0,pose};
    }
    function snapshot(){return {
      pieces:D.pieces,visible:stats.visible,placed:stats.placed,mode,time,duration:duration(),playing,playbackRate,
      camera:{yaw,elevation,radius,target:target.toArray()},gear,label:mode==="motion"?D.labels[gear]:"—",
      ratio:stats.ratio,input:stats.input,output:stats.output,xray,exploded,playbackOnly:true,
    };}
    function notify(force=false) {
      const now=performance.now();if(options.onUpdate&&(force||now-lastNotify>100)){lastNotify=now;options.onUpdate(snapshot());}
    }
    function resize() {
      const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
      const scale=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*scale)||canvas.height!==Math.floor(h*scale)) {
        renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
      }
    }
    function paint() {
      resize();camera.position.set(target.x+radius*Math.cos(yaw)*Math.cos(elevation),target.y+radius*Math.sin(yaw)*Math.cos(elevation),target.z+radius*Math.sin(elevation));
      camera.lookAt(target);renderer.render(scene,camera);
    }
    function tick(now) {
      raf=0;if(destroyed||!visible||!intersecting)return;
      if(playing&&mode!=="product") {
        const elapsed=lastClock?Math.min((now-lastClock)/1000,mode==="assembly"?1:0.1):0;
        time=Math.min(duration(),time+elapsed*playbackRate);
        if(time>=duration())playing=false;
      }
      lastClock=now;updateState();paint();notify();if(playing&&mode!=="product")render();
    }
    function render(){if(!destroyed&&visible&&intersecting&&!raf)raf=requestAnimationFrame(tick);}
    function setCamera(values) {
      if(values.yaw!==undefined)yaw=values.yaw;if(values.elevation!==undefined)elevation=values.elevation;
      if(values.radius!==undefined)radius=values.radius;if(values.target)target.fromArray(values.target);render();
    }
    function setView(name) {selectedView=name;setCamera(presets[name]);}
    function setMode(next) {
      if(mode===next)return;mode=next;time=0;frameIndex=0;lastClock=0;
      if(mode==="product")playing=false;
      setCamera(mode==="assembly"?{target:[-0.03,0.005,0.015],yaw:-1.15,elevation:0.94,radius:0.84}:presets.overall);
      updateState();notify(true);render();
    }
    function seek(value){time=clamp(value,0,duration());lastClock=0;updateState();notify(true);render();}
    function play(value){playing=Boolean(value)&&mode!=="product";lastClock=0;notify(true);render();}
    function setPlaybackRate(value){playbackRate=value;lastClock=0;}
    function setGear(index){setMode("motion");seek(D.completed[index].time-1);}
    function setXray(value) {
      xray=Boolean(value);for(const r of records)if(r.p.frame){r.mesh.material.transparent=xray;r.mesh.material.opacity=xray?0.15:1;r.mesh.material.depthWrite=!xray;}
      notify(true);render();
    }
    function setExploded(value){exploded=Boolean(value);if(mode!=="assembly")setCamera({...presets.overall,radius:exploded?0.68:0.44});updateState();notify(true);render();}
    function setVisible(value){visible=Boolean(value);lastClock=0;if(visible)render();else if(raf){cancelAnimationFrame(raf);raf=0;}}
    const observer=new IntersectionObserver(entries=>{intersecting=entries[0].isIntersecting;lastClock=0;if(intersecting)render();},{threshold:0});
    const resizer=new ResizeObserver(()=>render());
    function moveTo(next) {
      observer.disconnect();resizer.disconnect();host=next;host.appendChild(canvas);intersecting=true;
      observer.observe(host);resizer.observe(host);render();
    }
    let pointer=null;
    canvas.addEventListener("pointerdown",e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);canvas.style.cursor="grabbing";});
    canvas.addEventListener("pointermove",e=>{
      if(!pointer)return;yaw-=(e.clientX-pointer[0])*0.008;elevation=clamp(elevation+(e.clientY-pointer[1])*0.006,-0.7,1.4);
      pointer=[e.clientX,e.clientY];render();
    });
    function release(){pointer=null;canvas.style.cursor="grab";notify(true);}
    canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);
    function destroy(){destroyed=true;if(raf)cancelAnimationFrame(raf);observer.disconnect();resizer.disconnect();renderer.dispose();
      Object.values(geometries).forEach(g=>g.dispose());materials.forEach(m=>m.dispose());ground.geometry.dispose();ground.material.dispose();canvas.remove();}
    moveTo(mount);updateState();notify(true);
    return {moveTo,setMode,seek,play,setPlaybackRate,setGear,setXray,setExploded,setView,setCamera,setVisible,resize,render,snapshot,destroy,
      zoom:factor=>{radius=clamp(radius*factor,0.07,1.5);render();},resetView:()=>setView(selectedView),canvas,scene,renderer};
  },
};
