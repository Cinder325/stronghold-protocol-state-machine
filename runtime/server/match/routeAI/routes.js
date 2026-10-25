// SPDX-License-Identifier: GPL-3.0-or-later
// Policy preferences only; all real eligibility and economy remain owned by the host.
export const PERSONA='unified';
export const ROUTES=Object.freeze([
 {id:'laterano',name:'拉特兰',core:'lateranoShip',band:'band_paganini',needs:['skillfulShip','preciShip','visiShip']},
 {id:'kjerag',name:'谢拉格',core:'kjeragShip',band:'band_sciurus',needs:['skillfulShip','arcaneShip']},
 {id:'sargon',name:'萨尔贡',core:'sargonShip',band:'band_pepe',needs:['preciShip','swiftShip']},
 {id:'siracusa',name:'叙拉古',core:'siracusaShip',band:'band_chiave',needs:['swiftShip','miraShip']},
].map(Object.freeze));
export const REQUIRED_BONDS=Object.freeze([...new Set(ROUTES.flatMap(r=>[r.core,...r.needs]))].sort());
export const ECONOMY_BANDS=Object.freeze(['band_orchid','band_jesica','band_kirara','band_justin','band_cathy','band_makiri','band_mlyss']);
export const isUnifiedBot=(m,ps)=>ps?.isBot===true&&(m.opts?.seats||[]).some(s=>s.playerId===ps.playerId&&s.botPersona===PERSONA);
export function routeAvailability(m,route){
 const banned=new Set(m.bannedChess||[]),off=m.gd.modeInactiveBonds||new Set();
 const usable=(m.gd.visibleChess||[]).filter(id=>!banned.has(id)&&m.gd.chess(id)?.bonds?.includes(route.core)).length;
 const restrictions=[...(off.has(route.core)?[route.core]:[]),...(m.drawnDisabledBonds||m.disabledBonds||[]).filter(b=>[route.core,...route.needs].includes(b))];
 return {usable,restricted:restrictions.length>0,restrictions,score:usable*50+(off.has(route.core)?-100000:1000)-(restrictions.includes(route.core)?700:0)-restrictions.length*60};
}
export function ensureAssignments(m){
 const seats=(m.opts.seats||[]).filter(s=>s.isBot&&s.botPersona===PERSONA).sort((a,b)=>a.seat-b.seat);
 if(m.opts.routeAIAssignments&&seats.every(s=>ROUTES.some(r=>r.id===m.opts.routeAIAssignments[s.playerId])))return m.opts.routeAIAssignments;
 if(seats.length>4)throw Error('At most four coordinated AI seats are supported');
 let best=null;const visit=(chosen,left,score)=>{if(chosen.length===seats.length){if(!best||score>best.score)best={chosen,score};return;}for(const route of left){const own=m.players?.get(seats[chosen.length].playerId),held=own?.allChess?.()||[];
  const affinity=held.filter(u=>m.gd.chess(u.id)?.bonds?.includes(route.core)).length*20;visit([...chosen,route],left.filter(r=>r!==route),score+routeAvailability(m,route).score+affinity);}};
 visit([],ROUTES,0);m.opts.routeAIAssignments=Object.fromEntries(seats.map((s,i)=>[s.playerId,best.chosen[i].id]));return m.opts.routeAIAssignments;
}
export function routeFor(m,ps){if(!isUnifiedBot(m,ps))return null;return ROUTES.find(r=>r.id===ensureAssignments(m)[ps.playerId])||null;}
export function selectBand(m,ps){
 const route=routeFor(m,ps);if(!route)return null;
 const free=id=>m.gd.bandAllowed(id)&&!m.bandTaken(id,ps.playerId);
 if(free(route.band))return route.band;
 return ECONOMY_BANDS.find(free)||m.gd.bandIds().find(free)||m.gd.defaultBandId;
}
export function routeIdentity(m,ps){const r=routeFor(m,ps);return r?{id:r.id,name:r.name,preferredBand:r.band,preferredBandActive:ps.bandId===r.band,...routeAvailability(m,r)}:null;}
