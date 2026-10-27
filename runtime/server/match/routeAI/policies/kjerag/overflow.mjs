// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {IDS47,base,is,own} from "./model.mjs";
import {pieceBonds} from "../../../bondsMeta.js";
import {protectedSale47} from "./procurement.mjs";
import {selectRoster47,unitValue47} from "./roster.mjs";
import {equipStep47} from "./equipment.mjs";
import {legalTiles,placeClass} from "../../../board.js";


// Select three DISTINCT actual investor bases, preferring Saint SilverAsh's dual
// combat/economy use. A fourth different investor is not itself a mandatory fourth slot.
export function investorReserve54(gd,p){
  const units=own(p),where=u=>p.board.some(v=>v.uid===u.uid)?0:p.hand.some(v=>v?.uid===u.uid)?1:2;
  const byBase=new Map();
  for(const u of units.filter(u=>pieceBonds(gd,u).includes('investShip'))
    .sort((a,b)=>Number(is(gd,b,IDS47.sa))-Number(is(gd,a,IDS47.sa))
      ||where(a)-where(b)||Number(gd.isGolden(b.id))-Number(gd.isGolden(a.id))||a.uid-b.uid))
    if(!byBase.has(base(gd,u)))byBase.set(base(gd,u),u);
  return new Set([...byBase.values()].slice(0,3).map(u=>u.uid));
}

export function overflowKey54(gd,p,u,chosen,investors){
  if(u.kind==='item')return true;
  if(u.kind!=='chess')return false; // summon stacks return next round natively
  if(chosen.some(v=>v.uid===u.uid))return true;
  if(investors.has(u.uid))return true;
  const reason=protectedSale47(gd,p,u,chosen);
  if(reason==='investor-project-member')return false; // excess fourth member only
  return !!reason;
}


// Native PREP expiry destroys unresolved due cards (not a paid sell). Rescue keys
// into normal storage, then sell dispensable due bodies before Ready. Every step
// reobserves native state because refills, gifts and merges can change the queue.
export function rescueOverflow54(m,ps,{observe,handle,note=()=>{},maxSteps=80,allowDeploy=true}={}){
  const gd=ps.gd||m.gd,receipt={kind:'native-prep-overflow-rescue',steps:[],unresolved:[],settled:false};
  const due=p=>p.temp.filter(u=>u&&u.kind!=='token'&&(!ps.tempDue||ps.tempDue(u)<=ps.prepsEnded));
  const act=(intent,task,purpose)=>{
    const result=handle(intent,`fsm54:${task}`,{task,purpose});receipt.steps.push({intent,task,purpose,accepted:result?.ok===true,result});
    return result?.ok===true;
  };
  const seen=new Set();
  for(let step=0;step<maxSteps;step++){
    const p=observe().match.private,expired=due(p);if(!expired.length)break;
    const sig=JSON.stringify([p.board,p.hand,p.temp]);if(seen.has(sig))break;seen.add(sig);
    const chosen=selectRoster47(gd,p),investors=investorReserve54(gd,p),keys=expired.filter(u=>overflowKey54(gd,p,u,chosen,investors));
    const equips=equipStep47(gd,p,{round:m.round});
    if(equips&&expired.some(u=>u.uid===equips.itemUid)){
      if(!act(equips,'consume-due-item','使用即将到期的有效道具并重新检查招募溢出'))break;continue;
    }
    const key=keys[0];
    if(key){
      const free=p.hand.findIndex(x=>x==null);
      if(free>=0){if(!act({t:'g.move',uid:key.uid,to:{area:'hand',idx:free}},'rescue-key-to-hand','将临时区关键牌移入正式手牌'))break;continue;}
      // A native hand/temp swap rescues the key without depending on the refill
      // queue's order; the displaced non-key is explicitly sold on the next pass.
      const replace=p.hand.map((u,idx)=>({u,idx})).filter(({u})=>u?.kind==='chess'
        &&!overflowKey54(gd,p,u,chosen,investors)&&!u.items?.length)
        .sort((a,b)=>unitValue47(gd,p,a.u)-unitValue47(gd,p,b.u)||a.u.uid-b.u.uid)[0];
      if(replace){
        if(!act({t:'g.move',uid:key.uid,to:{area:'hand',idx:replace.idx}},'swap-key-out-of-overflow','关键牌换入手牌，非关键单张移至待清理区'))break;continue;
      }
      if(allowDeploy&&key.kind==='chess'&&chosen.some(u=>u.uid===key.uid)){
        const legal=legalTiles(ps.deployMap(),placeClass(ps,gd.chess(key.id)));
        const target=legal.find(([r,c])=>!p.board.some(u=>u.row===r&&u.col===c)&&p.board.filter(u=>u.kind==='chess').length<p.deployCap)
          ||legal.find(([r,c])=>p.board.some(u=>u.row===r&&u.col===c&&u.kind==='chess'
            &&!overflowKey54(gd,p,u,chosen,investors)&&!u.items?.length));
        if(target){if(!act({t:'g.move',uid:key.uid,to:{area:'board',row:target[0],col:target[1]},dir:'RIGHT'},
          'deploy-overflow-key','先部署关键干员，随后统一重排真实阵容'))break;continue;}
      }
      // Existing useful equipment may free an ordinary slot without liquidating a key.
      if(equips){if(!act(equips,'equip-to-free-hand','装备已有有效道具为关键牌腾出正式空间'))break;continue;}
      break;
    }
    const surplus=expired.filter(u=>u.kind==='chess'&&!u.items?.length).sort((a,b)=>unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid)[0];
    if(!surplus)break;
    if(!act({t:'g.sell',uid:surplus.uid},'sell-due-non-key','到期前回收非关键单张，避免原生到期销毁'))break;
  }
  const p=observe().match.private,chosen=selectRoster47(gd,p),investors=investorReserve54(gd,p);
  receipt.unresolved=due(p).map(u=>({uid:u.uid,id:u.id,kind:u.kind,key:overflowKey54(gd,p,u,chosen,investors)}));
  receipt.safe=receipt.unresolved.length===0;
  receipt.reason=receipt.safe?'No due operator/item remains in temp':'No safe native capacity operation remains; do not Ready and silently lose keys';
  note('fsm-overflow-rescue54',receipt);return receipt;
}
