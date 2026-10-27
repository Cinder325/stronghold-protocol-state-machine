// Research-only opening opportunities over the current private view. Native prices,
// whole-shop freeze and explicit coin storage only; no stock, RNG or future offers.
const CORE='kjeragShip';
const COIN='chess_item_1_03_e_a';
const owned=p=>[...(p.board||[]),...(p.hand||[]),...(p.temp||[])].filter(u=>u?.kind==='chess');

/**
 * Return null or {intent,task,reason,slot,stopAfter,...}. Call again after an
 * accepted native mutation. `offers` are optional {slot,s,group,score} priority
 * hints from the caller; ids/prices always come from p.shop.slots. `needsCore`
 * is a boolean route requirement, never a prediction of future availability.
 * A freeze recommendation has stopAfter:true: finish prep without refreshing or
 * toggling freeze again. g.freeze freezes ALL unsold slots, not just `slot`.
 * A coin recommendation is only g.buy; redeeming it requires a separate g.equip.
 */
export function openingOpportunity47(gd,p,{round=1,offers=[],needsCore=true}={}){
  if(!p||p.alive===false||p.ready||p.personalChoice||p.shop?.rewardOffer
    ||!Number.isInteger(round)||round<1||round>2||!Array.isArray(p.shop?.slots))return null;
  const hints=new Map();
  for(const o of Array.isArray(offers)?offers:[]){
    if(Number.isInteger(o?.slot)&&o.s?.id===p.shop.slots[o.slot]?.id)
      hints.set(o.slot,{group:Number.isFinite(o.group)?o.group:0,score:Number.isFinite(o.score)?o.score:0});
  }
  const units=owned(p),funds=Number.isFinite(p.funds)?p.funds:0;
  const handRoom=Array.isArray(p.hand)&&p.hand.some(u=>u==null);
  const rows=p.shop.slots.flatMap((s,slot)=>{
    if(!s||s.sold||!Number.isFinite(s.price)||s.price<0)return [];
    const rec=s.kind==='chess'?gd.chess(s.id):s.kind==='item'?gd.item(s.id):null;
    if(!rec||rec.isDiy)return [];
    const hint=hints.get(slot)||{group:0,score:0};
    const neededCore=needsCore!==false&&s.kind==='chess'&&rec.bonds?.includes(CORE);
    return [{s,slot,rec,...hint,neededCore}];
  });
  const recommend=(r,intent,task,reason,stopAfter=false)=>({intent,task,reason,slot:r.slot,
    id:r.s.id,price:r.s.price,stopAfter,source:'current-private-shop',
    ...(intent.t==='g.freeze'?{freezeScope:'all-unsold-slots'}:{})});
  const cheap=rows.filter(r=>r.neededCore&&r.s.price<=1&&r.s.price<=funds&&handRoom)
    .sort((a,b)=>Number(!units.some(u=>gd.baseIdOf(u.id)===gd.baseIdOf(b.s.id)))
      -Number(!units.some(u=>gd.baseIdOf(u.id)===gd.baseIdOf(a.s.id)))
      ||b.group-a.group||b.score-a.score||a.slot-b.slot)[0];
  if(cheap)return recommend(cheap,{t:'g.buy',slot:cheap.slot},'opening-cheap-core',
    'An actually displayed needed Kjerag body costs at most one native coin, including after a level-up.');
  // Let the main policy execute another visible affordable project before banking
  // or freezing. No unseen draw is treated as an opportunity.
  if(handRoom&&rows.some(r=>r.group>0&&r.s.price<=funds))return null;
  const coins=rows.filter(r=>r.s.kind==='item'&&r.s.id===COIN&&r.rec.kind==='consume_on_equip');
  const keepsFunds=Array.isArray(gd.leftoverKeptBands)&&gd.leftoverKeptBands.includes(p.bandId);
  const bank=round===1&&!keepsFunds&&units.length>=2&&handRoom
    ?coins.find(r=>r.s.price===funds&&r.s.price<=1):null;
  if(bank)return recommend(bank,{t:'g.buy',slot:bank.slot},'opening-bank-coin',
    'Bank the otherwise expiring last opening coin as a real hand item; do not equip or consume it now.');
  if(p.shop.frozen)return null;
  const needed=rows.filter(r=>r.neededCore||r.group>=3)
    .filter(r=>r.s.price>funds||!handRoom)
    .sort((a,b)=>Number(b.neededCore)-Number(a.neededCore)||b.group-a.group||b.score-a.score||a.s.price-b.s.price||a.slot-b.slot)[0];
  if(needed)return recommend(needed,{t:'g.freeze'},'opening-freeze-needed-offer',
    'Preserve an actually displayed needed offer that cannot currently be bought; native freeze holds the whole shop.',true);
  const frozenCoin=round===1&&!keepsFunds&&units.length>=2?coins.find(r=>r.s.price>funds||!handRoom):null;
  if(frozenCoin)return recommend(frozenCoin,{t:'g.freeze'},'opening-freeze-coin',
    'Preserve the actually displayed normal coin for a later native purchase; this grants no current or future cash.',true);
  return null;
}
