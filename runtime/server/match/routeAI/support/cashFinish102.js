// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: native capacity actions and a configurable real-hand reserve.
// [ASSUMED] End-of-prep cash repair. Only visible quotes and native validated
// actions; no key liquidation, speculative gifts, currency writes or hidden rolls.
export function passiveCarrier102(gd,rec,unit){
 const body=unit&&gd.chess(unit.id);
 return !!rec&&!!body&&unit.row!=null&&(unit.items?.length||0)<gd.equipPerChess
  &&!(unit.items||[]).some(i=>gd.item(i.id)?.canGiveBond)
  &&(!(rec.params?.magic_resist_penetrate>0)||body.dmgType==='arts'||/法术伤害/.test(body.skill?.desc||''));
}
export function* cashFinishSteps102(m,ps,{rankOffer=()=>0,saleFor=()=>null,capacitySale=()=>null,capacityAction=()=>null,useOwned=()=>null,targetFor=()=>null,minimumChessRoom=2,note=()=>{},maxActions=32}={}){
 const gd=ps.gd,receipt={round:m.round,before:ps.funds,after:ps.funds,actions:[],stop:'complete'},initialBoard=[...ps.board.values()].filter(u=>u.kind==='chess').map(u=>[u.uid,u.id]);
 const record=()=>{receipt.after=ps.funds;ps._botCash102=receipt;note('cash-finish102',receipt);return receipt;};
 if(gd.leftoverKeptBands.includes(ps.bandId)){receipt.stop='native-cash-retained';return record();}
 const own=p=>[...p.board,...p.hand,...p.temp].filter(u=>u?.kind==='chess');
 const free=p=>p.hand.filter(x=>!x).length;
 const chessRoom=minimumChessRoom===1?1:2;
 const gear=r=>r?.itemType==='EQUIP'&&r.kind==='passive'&&!r.canGiveBond&&['STAT','SP','SURVIVAL'].includes(r.category);
 const reservedConversion=u=>(u.items||[]).some(i=>gd.item(i.id)?.canGiveBond);
 const myCore=new Set(gd.bandBondIds(ps.bandId).filter(id=>gd.bond(id)?.isCore));
 const allyCore=new Set(m.order.filter(p=>p!==ps&&p.alive).flatMap(p=>gd.bandBondIds(p.bandId)).filter(id=>gd.bond(id)?.isCore));
 const bankForAlly=slot=>{const ids=gd.chess(slot.id)?.bonds||[];return ids.some(id=>allyCore.has(id))&&!ids.some(id=>myCore.has(id));};
 const safeChess=id=>!(gd.chess(id)?.garrisonIds||[]).some(id=>{const g=gd.garrison(id);return g?.eventType==='SERVER_GAIN'&&!['SERVER_ADD_BOND_CHESS_ALL','SERVER_GAIN_FREE_REFRESH_COUNT'].includes(g.effectKey);});
 const act=(intent,reason)=>{
  const before=ps.funds,beforeUids=new Set(ps.allChess().map(u=>u.uid));let error=null,result;
  try{const args={ 'g.buy':['buy',[intent.slot]],'g.refresh':['refresh',[]],'g.sell':['sell',[intent.uid]],'g.equip':['equip',[intent.itemUid,intent.targetUid]],'g.destroy':['destroy',[intent.uid]],'g.art':['useArt',[intent.itemUid,intent.row,intent.col,intent.dir]] }[intent.t];result=ps[args[0]](...args[1]);if(result?.ok===false||result?.error)error=result.error||'rejected';}
  catch(e){error=e.code||e.message;}
  if(!error&&intent.t==='g.buy')for(const u of ps.allChess())if(!beforeUids.has(u.uid))purchased.add(u.uid);
  receipt.actions.push({intent,reason,fundsBefore:before,fundsAfter:ps.funds,accepted:!error,...(error?{error}:{})});return !error;
 };
 const purchased=new Set();let pending=null,funding=null;
 for(let step=0;receipt.actions.length<maxActions&&step<maxActions*2;step++){
  if(m.phase!=='PREP'||!ps.alive||ps.ready){receipt.stop='phase-or-control-ended';break;}
  const p=ps.privateView();
  if(pending){
   const item=[...p.hand,...p.temp].find(u=>u?.kind==='item'&&u.id===pending.id);
   const target=item&&targetFor(item,p),host=target&&own(p).find(u=>u.uid===target);
   if(item&&host&&!reservedConversion(host)&&(host.items?.length||0)<gd.equipPerChess){if(!act({t:'g.equip',itemUid:item.uid,targetUid:target},'use-purchased-passive'))break;yield;}
   pending=null;continue;
  }
  if(p.funds<=0)break;
  if(free(p)<chessRoom){
   const e=useOwned(p);if(e){if(!act(e,'use-owned-equipment-before-capacity-sale'))break;yield;continue;}
   const uid=capacitySale(p,purchased);if(uid){if(!act({t:'g.sell',uid},'release-unselected-unprotected-capacity'))break;yield;continue;}
   const action=receipt.actions.length+3<=maxActions?capacityAction(p):null;
   if(action){if(!act(action,'release-unusable-unprotected-tool'))break;yield;continue;}
  }
  if(funding){
   const slot=p.shop.slots[funding.slot];
   if(!slot||slot.sold||slot.id!==funding.id){funding=null;continue;}
   if(slot.price<=p.funds&&free(p)>=chessRoom){if(!act({t:'g.buy',slot:funding.slot},'complete-funded-visible-project'))break;funding=null;yield;continue;}
   const uid=saleFor(slot,p);if(uid){if(!act({t:'g.sell',uid},'continue-funded-visible-project'))break;yield;continue;}
   receipt.stop='funding-project-no-safe-continuation';break;
  }
  // Avoid consuming a chosen component's UID by a three-copy merge. Tail cards
  // stay in hand, and this repair never withdraws any deployed operator.
  const quotes=p.shop.slots.map((s,slot)=>({s,slot})).filter(({s})=>s?.kind==='chess'&&!s.sold&&s.price>0).map(o=>({...o,value:rankOffer(o.s,p)}));
  const cards=quotes.filter(({s})=>safeChess(s.id)
   &&own(p).filter(u=>!gd.isGolden(u.id)&&gd.baseIdOf(u.id)===gd.baseIdOf(s.id)).length<2);
  const meaningful=cards.filter(o=>o.value>0&&o.s.price<=p.funds&&free(p)>=chessRoom).sort((a,b)=>b.value-a.value||a.s.price-b.s.price||a.slot-b.slot)[0];
  const compatible=(rec,u)=>passiveCarrier102(gd,rec,u);
  const equipment=p.shop.slots.map((s,slot)=>({s,slot,rec:s?.kind==='item'?gd.item(s.id):null})).filter(o=>o.s&&!o.s.sold&&o.s.price>0&&o.s.price<=p.funds&&gear(o.rec)&&free(p)>0&&receipt.actions.length+2<=maxActions&&!ps.completesItemMerge(o.s.id))
   .map(o=>({...o,target:targetFor({kind:'item',uid:-1,id:o.s.id},p)})).find(o=>{const host=own(p).find(u=>u.uid===o.target);return host&&host.row!=null&&!reservedConversion(host)&&(host.items?.length||0)<gd.equipPerChess&&compatible(o.rec,host);});
  if(meaningful){if(!act({t:'g.buy',slot:meaningful.slot},'visible-growth-or-core'))break;yield;continue;}
  if(equipment){if(!act({t:'g.buy',slot:equipment.slot},'useful-passive-before-expiry'))break;pending={id:equipment.s.id};yield;continue;}
  const project=cards.filter(o=>o.value>0&&o.s.price>p.funds&&free(p)>=chessRoom).sort((a,b)=>b.value-a.value||a.s.price-b.s.price)[0];
  const sale=project&&saleFor(project.s,p);
  if(sale){funding={id:project.s.id,slot:project.slot};if(!act({t:'g.sell',uid:sale},'fund-visible-project-with-unselected-surplus'))break;yield;continue;}
  const bank=m.round<gd.bossRound&&cards.filter(o=>o.s.price<=p.funds&&gd.sellPrice(o.s.id)>0&&free(p)>=chessRoom&&!bankForAlly(o.s)).sort((a,b)=>gd.sellPrice(b.s.id)/b.s.price-gd.sellPrice(a.s.id)/a.s.price||a.slot-b.slot)[0];
  if(bank){if(!act({t:'g.buy',slot:bank.slot},'retain-resale-value-before-cash-reset'))break;yield;continue;}
  // No destructive capacity repair here. The main policy owns the selected roster,
  // investor trio and overflow safeguards. Record an explicit abstention instead.
  // A full native hand forbids purchases even when temp has room. Never
  // bypass that gate or liquidate a selected roster to force a purchase.
  if(free(p)<1){receipt.stop='capacity-abstention-no-key-sale';break;}
  if(p.shop.frozen&&quotes.some(o=>o.value>=100&&o.s.price>p.funds)){
   receipt.stop='frozen-key-no-safe-funding';break;
  }
  const cost=p.shop.freeRefreshes>0?0:p.shop.refreshPrice;
  if(cost>p.funds){receipt.stop='no-affordable-native-action';break;}
  if(!act({t:'g.refresh'},p.shop.frozen?'search-instead-of-losing-frozen-budget':'search-with-expiring-cash'))break;yield;
 }
 receipt.deployedIdentityChanges=initialBoard.filter(([uid,id])=>!ps.allChess().some(u=>u.uid===uid&&u.id===id));
 if(ps.funds>0&&receipt.stop==='complete')receipt.stop=receipt.actions.length>=maxActions?'action-bound':'native-action-rejected';
 return record();
}
export function cashFinish102(m,ps,options){const g=cashFinishSteps102(m,ps,options);let v;do{v=g.next();}while(!v.done);return v.value;}
