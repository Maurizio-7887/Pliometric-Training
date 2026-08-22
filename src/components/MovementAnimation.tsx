import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MoveKind } from '../types';

interface Props { kind: MoveKind; active?: boolean; id?: string; showFullscreen?: boolean; }
type Point = [number, number];
type Pose = { head: Point; shoulder: Point; hip: Point; le: Point; lw: Point; re: Point; rw: Point; lk: Point; la: Point; rk: Point; ra: Point };

const P = (head:Point, shoulder:Point, hip:Point, le:Point, lw:Point, re:Point, rw:Point, lk:Point, la:Point, rk:Point, ra:Point):Pose => ({head,shoulder,hip,le,lw,re,rw,lk,la,rk,ra});
const stand = P([160,42],[160,67],[160,103],[142,82],[132,101],[178,82],[188,101],[148,127],[145,151],[172,127],[177,151]);
const poses: Record<MoveKind, Pose[]> = {
  warmup:[
    P([146,42],[148,67],[153,102],[130,80],[121,96],[169,79],[183,70],[139,124],[132,151],[174,119],[190,134]),
    P([158,39],[157,64],[160,99],[139,76],[127,65],[176,77],[189,94],[146,120],[139,145],[176,124],[184,151]),
    P([171,42],[169,67],[165,102],[151,79],[138,70],[188,80],[198,98],[147,119],[131,135],[177,125],[184,151])
  ],
  pogo:[
    P([160,43],[160,68],[160,103],[143,83],[136,103],[177,83],[184,103],[151,126],[151,151],[169,126],[169,151]),
    P([160,27],[160,52],[160,87],[143,67],[136,87],[177,67],[184,87],[151,110],[149,134],[169,110],[171,134]),
    P([160,40],[160,65],[160,100],[143,80],[136,100],[177,80],[184,100],[151,124],[151,148],[169,124],[169,148])
  ],
  squat:[
    P([160,50],[160,75],[154,104],[137,82],[121,91],[183,82],[199,91],[132,119],[126,151],[176,119],[187,151]),
    P([160,25],[160,50],[160,85],[142,61],[126,51],[178,61],[194,51],[148,108],[142,132],[172,108],[178,132]),
    P([160,47],[160,72],[158,103],[141,84],[126,98],[179,84],[194,98],[139,122],[128,151],[177,122],[189,151])
  ],
  broad:[
    P([105,54],[108,78],[118,106],[91,83],[76,70],[130,82],[146,65],[94,123],[83,151],[137,124],[151,151]),
    P([158,27],[164,50],[174,82],[146,55],[128,47],[183,61],[199,74],[156,99],[141,116],[190,99],[205,116]),
    P([215,51],[212,76],[204,105],[194,84],[178,96],[229,83],[243,97],[187,122],[176,151],[222,121],[235,151])
  ],
  lateral:[
    P([105,48],[111,72],[120,103],[91,82],[76,100],[130,80],[145,69],[101,122],[83,151],[143,119],[162,137]),
    P([160,30],[160,55],[160,89],[143,67],[128,78],[177,67],[192,78],[148,109],[139,132],[172,109],[181,132]),
    P([215,48],[209,72],[200,103],[190,80],[175,69],[229,82],[244,100],[177,119],[158,137],[219,122],[237,151])
  ],
  split:[
    P([160,45],[160,70],[160,103],[142,83],[132,102],[178,83],[188,102],[137,119],[113,151],[180,120],[202,151]),
    P([160,23],[160,48],[160,82],[143,60],[128,48],[177,60],[192,48],[143,102],[126,124],[177,102],[194,124]),
    P([160,45],[160,70],[160,103],[142,83],[132,102],[178,83],[188,102],[140,120],[118,151],[183,119],[207,151])
  ],
  bounds:[
    P([112,47],[119,70],[133,101],[99,76],[84,65],[139,76],[153,91],[116,117],[91,133],[150,117],[174,143]),
    P([161,27],[168,50],[181,81],[148,55],[131,45],[188,58],[201,75],[160,96],[140,112],[196,98],[215,117]),
    P([210,44],[216,67],[226,99],[196,73],[180,90],[236,74],[250,62],[211,115],[191,142],[243,114],[263,145])
  ],
  feet:[
    P([160,43],[160,68],[160,103],[142,82],[130,96],[178,82],[190,96],[148,126],[139,151],[171,126],[177,143]),
    P([160,40],[160,65],[160,100],[142,79],[130,93],[178,79],[190,93],[148,123],[143,143],[172,123],[181,151]),
    P([160,43],[160,68],[160,103],[142,82],[130,96],[178,82],[190,96],[148,126],[142,145],[171,126],[181,151])
  ],
  sprint:[
    P([135,46],[144,68],[162,98],[124,72],[106,82],[162,74],[178,91],[143,112],[119,128],[181,110],[203,136]),
    P([156,43],[165,65],[183,95],[145,70],[129,58],[183,71],[198,87],[164,108],[143,135],[200,108],[218,125]),
    P([177,46],[186,68],[204,98],[166,74],[150,91],[204,72],[222,82],[185,110],[163,136],[223,112],[244,129])
  ],
  calf:[
    stand,
    P([160,34],[160,59],[160,94],[142,74],[132,94],[178,74],[188,94],[151,117],[151,143],[169,117],[176,130]),
    P([160,42],[160,67],[160,102],[142,82],[132,101],[178,82],[188,101],[151,126],[151,151],[169,125],[176,138])
  ],
  cooldown:[
    P([145,43],[146,68],[151,103],[129,82],[117,99],[164,81],[176,96],[139,126],[130,151],[169,124],[180,145]),
    P([160,42],[160,67],[160,102],[142,82],[132,98],[178,82],[188,98],[149,125],[142,146],[171,126],[177,151]),
    P([175,43],[174,68],[169,103],[156,81],[144,96],[191,82],[203,99],[151,124],[140,145],[181,126],[190,151])
  ]
};
const speeds:Record<MoveKind,number>={warmup:1150,pogo:650,squat:1500,broad:1750,lateral:1450,split:1450,bounds:1300,feet:520,sprint:720,calf:1250,cooldown:2000};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const blend=(a:Pose|undefined,b:Pose|undefined,t:number):Pose=>{
  if(!a && !b) return stand;
  if(!a) return b as Pose;
  if(!b) return a;
  return Object.fromEntries(Object.keys(a).map(k=>[k,[lerp(a[k as keyof Pose][0],b[k as keyof Pose][0],t),lerp(a[k as keyof Pose][1],b[k as keyof Pose][1],t)]])) as unknown as Pose;
};

const professionalVideos: Record<string, {src:string; label:string; aria:string}> = {
  pogo:{src:'./videos/esercizi/pogo.mp4',label:'TECNICA · POGO JUMPS',aria:'Video professionale: pogo jumps'},
  squat:{src:'./videos/esercizi/squat.mp4',label:'TECNICA · SQUAT JUMP',aria:'Video professionale: squat jump'},
  broad:{src:'./videos/esercizi/broad.mp4',label:'TECNICA · SALTO IN LUNGO',aria:'Video professionale: salto in lungo da fermo'},
  lateral:{src:'./videos/esercizi/lateral.mp4',label:'TECNICA · SKATER BOUNDS',aria:'Video professionale: skater bounds'},
  lateralfeet:{src:'./videos/esercizi/lateralfeet.mp4',label:'TECNICA · PIEDI RAPIDI LATERALI',aria:'Video professionale: piedi rapidi laterali'},
  split:{src:'./videos/esercizi/split.mp4',label:'TECNICA · SPLIT SQUAT JUMP',aria:'Video professionale: split squat jump'},
  bounds:{src:'./videos/balzi-alternati-bounding.mp4',label:'TECNICA · BALZI ALTERNATI',aria:'Video professionale: balzi alternati bounding'},
  feet:{src:'./videos/piedi-rapidi-quick-feet.mp4',label:'TECNICA · PIEDI RAPIDI',aria:'Video professionale: piedi rapidi quick feet'},
  sprint:{src:'./videos/accelerazione-sprint.mp4',label:'TECNICA · ACCELERAZIONE SPRINT',aria:'Video professionale: accelerazione sprint'},
  calf:{src:'./videos/calf-raise-esplosivo-monopodalico.mp4',label:'TECNICA · CALF RAISE MONOPODALICO',aria:'Video professionale: calf raise esplosivo monopodalico'}
};

export const MovementAnimation:React.FC<Props> = ({kind,active=true,id,showFullscreen=true}) => {
  const [clock,setClock]=useState(0);
  const videoRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>{ if(!active){setClock(0);return;} let raf=0; const start=performance.now(); const tick=(now:number)=>{setClock(now-start);raf=requestAnimationFrame(tick)}; raf=requestAnimationFrame(tick); return()=>cancelAnimationFrame(raf); },[active,kind]);
  useEffect(()=>{
    const video=videoRef.current;
    if(!video)return;
    if(active)video.play().catch(()=>{}); else video.pause();
  },[active,kind]);
  const pose=useMemo(()=>{const list=poses[kind]?.length?poses[kind]:poses.warmup;const duration=speeds[kind]||1000;const safeClock=Number.isFinite(clock)&&clock>0?clock:0;const progress=(safeClock%duration)/duration*list.length;const i=((Math.floor(progress)%list.length)+list.length)%list.length;const t=(1-Math.cos((progress-Math.floor(progress))*Math.PI))/2;return blend(list[i],list[(i+1)%list.length],t)},[clock,kind]);
  const demo=id ? professionalVideos[id] : undefined;
  const openFullscreen=()=>{
    const video=videoRef.current as (HTMLVideoElement & {webkitEnterFullscreen?:()=>void}) | null;
    if(!video)return;
    if(video.requestFullscreen)void video.requestFullscreen();
    else video.webkitEnterFullscreen?.();
  };
  if(demo)return <div className={`move-stage move-video ${active?'is-moving':''}`} role="group" aria-label={demo.aria}>
    <video ref={videoRef} src={demo.src} autoPlay={active} loop muted playsInline preload="auto" />
    {showFullscreen && <button type="button" className="video-fullscreen" onClick={openFullscreen} aria-label="Guarda il video a schermo intero">⛶ SCHERMO INTERO</button>}
    <span className="move-caption">{demo.label}</span>
  </div>;
  const limb=(a:Point,b:Point,key:string)=><line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
  const directional=['broad','bounds','sprint'].includes(kind); const markers=['lateral','feet'].includes(kind);
  return <div className={`move-stage move-${kind} ${active?'is-moving':''}`} role="img" aria-label={`Dimostrazione tecnica animata: ${kind}`}>
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><linearGradient id={`floor-${kind}`} x1="0" x2="1"><stop stopColor="currentColor" stopOpacity="0"/><stop offset=".5" stopColor="currentColor" stopOpacity=".24"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      <line className="pro-ground" x1="22" y1="153" x2="298" y2="153" stroke={`url(#floor-${kind})`}/>
      <ellipse className="pro-shadow" cx={pose.hip[0]} cy="154" rx="27" ry="4"/>
      {markers&&<g className="pro-markers"><line x1="92" y1="148" x2="92" y2="157"/><line x1="228" y1="148" x2="228" y2="157"/></g>}
      {directional&&<g className="pro-direction"><path d="M55 92h42m-10-9 10 9-10 9"/></g>}
      <g className="pro-athlete">
        <path className="pro-torso" d={`M${pose.shoulder[0]-9},${pose.shoulder[1]} Q${pose.shoulder[0]},${pose.shoulder[1]-5} ${pose.shoulder[0]+9},${pose.shoulder[1]} L${pose.hip[0]+7},${pose.hip[1]} Q${pose.hip[0]},${pose.hip[1]+4} ${pose.hip[0]-7},${pose.hip[1]} Z`}/>
        <g className="pro-back">{limb(pose.shoulder,pose.re,'ra1')}{limb(pose.re,pose.rw,'ra2')}{limb(pose.hip,pose.rk,'rl1')}{limb(pose.rk,pose.ra,'rl2')}</g>
        <g>{limb(pose.shoulder,pose.le,'la1')}{limb(pose.le,pose.lw,'la2')}{limb(pose.hip,pose.lk,'ll1')}{limb(pose.lk,pose.la,'ll2')}</g>
        <circle className="pro-joint" cx={pose.shoulder[0]} cy={pose.shoulder[1]} r="4"/><circle className="pro-joint" cx={pose.hip[0]} cy={pose.hip[1]} r="4"/>
        <circle className="pro-head" cx={pose.head[0]} cy={pose.head[1]} r="12"/>
        <path className="pro-foot" d={`M${pose.la[0]-2},${pose.la[1]}l14,1`}/><path className="pro-foot" d={`M${pose.ra[0]-2},${pose.ra[1]}l14,1`}/>
      </g>
    </svg>
    <span className="move-caption">TECNICA · MOVIMENTO CONTROLLATO</span>
  </div>;
};
