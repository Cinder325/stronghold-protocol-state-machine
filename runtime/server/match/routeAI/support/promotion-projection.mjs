// Read-only Doctor Projection proposals. All effects still require native intents.
// Priorities and the low-LP cash guard are [ASSUMED] Kjerag recipe choices, not rules.
const DELAYED='equip_round_start_upgrade_char',IMMEDIATE='use_equip_upgrade_char';
const CORE='kjeragShip',ARC='chess_char_3_21_a',HALO='chess_char_6_16_a';
export const PROJECTION_KEYS56=Object.freeze([
 'chess_char_6_02_a',HALO,'chess_char_6_19_a','chess_char_5_14_a',ARC,
]);
const owned=p=>[...(p.board||[]),...(p.hand||[]),...(p.temp||[])].filter(u=>u?.kind==='chess');
const loose=p=>[...(p.hand||[]),...(p.temp||[])].filter(u=>u?.kind==='item');
export function projectionKind56(gd,it){
 const rec=gd.item(it?.id);if(rec?.itemType!=='EQUIP')return null;
 if(rec.buffs?.some(b=>b.key===IMMEDIATE))return 'immediate';
 return rec.buffs?.some(b=>b.key===DELAYED)?'delayed':null;
}
const pending=(gd,u)=>(u.items||[]).some(it=>projectionKind56(gd,it)==='delayed');
const conversionItem=(gd,it)=>{const r=gd.item(it.id);return r?.canGiveBond?'morph':r?.giveBondId===CORE?'ice':null;};
function immediateConversion56(gd,p,u){
 if(![ARC,HALO].includes(gd.baseIdOf(u.id)))return false;
 const items=u.items||[],hasIce=items.some(it=>conversionItem(gd,it)==='ice');
 const hasMorph=items.some(it=>conversionItem(gd,it)==='morph');
 if(hasIce&&hasMorph)return false;
 const available=loose(p),needIce=!hasIce,needMorph=!hasMorph;
 return (!needIce||available.some(it=>conversionItem(gd,it)==='ice'))
  &&(!needMorph||available.some(it=>conversionItem(gd,it)==='morph'));
}
function visibleThird56(gd,p,u,price){
 const same=owned(p).filter(v=>v.id===u.id&&!gd.isGolden(v.id));if(same.length!==2)return null;
 const offers=[...(p.shop?.slots||[]),...(p.shop?.rewardOffer?.slots||[])];
 const third=offers.filter(s=>s?.kind==='chess'&&!s.sold&&s.id===u.id&&Number.isFinite(s.price)
  &&s.price>=0&&s.price<=price&&s.price<=p.funds).sort((a,b)=>a.price-b.price)[0];
 return third?{id:third.id,price:third.price}:null;
}
function targetRows56(gd,p,{delayed,price,round,lastGuaranteedPrepRound,targetUids}){
 const allowed=targetUids==null?null:new Set(targetUids),cap=gd.equipPerChess||2;
 return owned(p).filter(u=>PROJECTION_KEYS56.includes(gd.baseIdOf(u.id))&&(!allowed||allowed.has(u.uid))).map(u=>{
  const id=gd.baseIdOf(u.id),items=u.items||[],third=visibleThird56(gd,p,u,price);
  let reason=null;
  if(gd.isGolden(u.id))reason='already-elite';
  else if(pending(gd,u))reason='target-already-awaits-promotion';
  else if(items.length>=cap)reason='no-empty-slot-preserve-existing-equipment';
  else if(delayed&&round>=lastGuaranteedPrepRound)reason='no-confirmed-next-preparation';
  else if(delayed&&immediateConversion56(gd,p,u))reason='complete-visible-conversion-before-delayed-projection';
  else if(third)reason='visible-third-copy-no-dearer-and-immediate';
  const priority=PROJECTION_KEYS56.length-PROJECTION_KEYS56.indexOf(id);
  return {uid:u.uid,id,name:gd.chess(u.id)?.name,eligible:reason===null,reason,
   visibleThird:third,score:80+priority*4+(u.row!=null?5:0)+(delayed?0:5)-price};
 }).sort((a,b)=>b.score-a.score||a.uid-b.uid);
}

/** Quote a real visible item. lastGuaranteedPrepRound means the last known
 * scheduled prep IF this player/match survives; hidden R15 is not assumed. */
export function projectionQuote56(gd,p,slot,options={}){
 const kind=projectionKind56(gd,slot),delayed=kind==='delayed',round=options.round;
 const last=options.lastGuaranteedPrepRound??gd.bossRound;
 const quote={eligible:false,group:0,score:0,reason:'not-doctor-projection',targetUid:null,
  delayed,effectRound:kind?(delayed?round+1:round):null,price:slot?.price??null,candidates:[]};
 if(!kind||slot?.kind!=='item'||slot.sold)return quote;
 if(!Number.isInteger(round)||round<1||!Number.isInteger(last))return {...quote,reason:'unknown-round-horizon'};
 if(p.alive===false||p.ready)return {...quote,reason:'not-an-active-unreadied-preparation'};
 const price=slot.price;
 if(!Number.isFinite(price)||price<0)return {...quote,reason:'missing-real-price'};
 const reserve=Math.max(0,options.reserveFunds||0);
 if(!Number.isFinite(p.funds)||price>Math.max(0,p.funds-reserve))return {...quote,reason:'preserve-current-cash-reserve'};
 const all=owned(p),available=[...loose(p),...all.flatMap(u=>u.items||[])];
 if(options.ownedItemUid==null&&available.some(it=>projectionKind56(gd,it)))
  return {...quote,reason:'resolve-owned-projection-before-another-purchase'};
 if(delayed&&round>=last)return {...quote,reason:'no-confirmed-next-preparation'};
 if(delayed&&price>0&&p.lp<=(options.survivalHp??10)&&options.allowDelayedAtRisk!==true)
  return {...quote,reason:'delayed-promotion-is-not-current-wave-rescue'};
 quote.candidates=targetRows56(gd,p,{delayed,price,round,lastGuaranteedPrepRound:last,targetUids:options.targetUids});
 const target=quote.candidates.find(u=>u.eligible);
 if(!target)return {...quote,reason:quote.candidates[0]?.reason||'no-normal-key-target'};
 return {...quote,eligible:true,group:3,score:target.score,targetUid:target.uid,
  reason:delayed?'promote-owned-key-at-next-round-start':'promote-owned-key-immediately',
  followUp:{event:delayed?'onRoundStart':'onEquip',preservesOtherEquipment:true,
   reEquipRequired:false,check:'Confirm the same owned UID is elite and re-evaluate bonds before arranging the next prep',
   survivalConditional:delayed}};
}

/** Existing items have no new cash cost; equip without replacing any item. */
export function projectionEquip56(gd,p,options={}){
 const items=loose(p).filter(it=>projectionKind56(gd,it))
  .sort((a,b)=>Number(projectionKind56(gd,b)==='immediate')-Number(projectionKind56(gd,a)==='immediate')||a.uid-b.uid);
 for(const item of items){
  const quote=projectionQuote56(gd,p,{kind:'item',id:item.id,price:0}, {...options,ownedItemUid:item.uid});
  if(quote.eligible)return {intent:{t:'g.equip',itemUid:item.uid,targetUid:quote.targetUid},reason:quote.reason,quote};
 }
 return null;
}
