// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Current-wave personal bounty previews only. No next-wave guesses, live gains or UID draws.
import {Battle} from "../../../sim/Battle.js";
import {rehearsalCap} from "../../../sim/rehearsal.js";
import {bountyBattles} from "../../choices.js";
import {normalPreviewOptions48} from "./kjerag-preview48.mjs";

const RNGS=['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'];
const snapshot=(m,ps)=>JSON.stringify({private:ps.privateView(),bounties:ps.bounties,
  uid:m.uidSeq,rng:RNGS.map(k=>m[k]?.state?.()),pool:[...m.pool.entries],
  itemPool:{debt:[...m.itemPool.debt],held:m.order.map(p=>({id:p.playerId,
    board:[...p.board],hand:p.hand,temp:p.temp,funds:p.funds,pendingFunds:p.pendingFunds,layers:p.layers}))},wave:m.wave});
const idOf=c=>c?.effectId??c?.id;
const coinOf=c=>Math.max(0,Math.trunc(Number(c?.coin)||0));

/** Native own-wave diagnostic. index:null explicitly abstains; caller owns any fallback. */
export function selectBounty47(m,ps,cards,indices,{note=()=>{}}={}){
  const receipt={kind:'current-wave-personal-bounty-preview',round:m?.round??null,
    source:'isolated-native-battle',baseline:null,candidates:[],selected:null,
    rewardTiming:'Future pendingFunds at native settlement; never current spendable funds',
    riskScope:'Own counted leaks only; unknown teammate rescue is not credited',abstain:null};
  const done=(index,reason=null)=>{receipt.selected=index;receipt.abstain=reason;note('fsm-bounty-preview',receipt);return {index,receipt};};
  if(m?.phase!=='PREP'||!m.wave||!Array.isArray(m.wave.spawns)||!ps?.alive||ps.ready)
    return done(null,'No actionable current PREP wave; never inspect or predict a future draft wave');
  if(!ps.personalChoice||ps.personalChoice.round!==m.round||!Array.isArray(ps.personalChoice.cards)||!Array.isArray(cards)||!Array.isArray(indices))
    return done(null,'No actual pending personal bounty choice');
  const before=snapshot(m,ps),gd=ps.gd||m.gd;
  if(Number.isInteger(gd.bossRound)&&m.round>=gd.bossRound)
    return done(null,'Normal-wave bounty preview is unavailable on boss or hidden rounds');
  const run=card=>{
    const copy=Object.create(ps);copy.bounties=structuredClone(ps.bounties||[]);
    let probeId=null;
    if(card){
      probeId=`preview47:${ps.playerId}:${m.round}:${idOf(card)}`;
      while(copy.bounties.some(b=>b.id===probeId))probeId+=':probe';
      copy.bounties.push({id:probeId,card:{effectId:idOf(card),name:card.name,enemyKey:card.enemyKey,
        count:Math.max(1,Math.min(20,Number.isInteger(card.count)?card.count:1)),coin:coinOf(card),
        payout:card.payout==='perfect'?'perfect':'kill',rounds:bountyBattles(card)},roundsLeft:bountyBattles(card)});
    }
    const projected=normalPreviewOptions48(m,copy,{board:ps.board}),opts=projected.opts,battle=m.newBattle(opts,{preview:true});
    if(!(battle instanceof Battle))throw Error('Native Battle unavailable or preview construction failed');
    let killedBounty=0,creditedBountyCoins=0;
    battle.on('death',({unit,reason,killer})=>{
      if(probeId&&reason==='killed'&&unit?.mods?.bountyId===probeId){
        killedBounty++;
        if(unit.bounty?.coins>0&&battle._bountyPayee(unit,killer)===ps.playerId)
          creditedBountyCoins+=unit.bounty.coins;
      }
    });
    const cap=rehearsalCap(opts.timeLimit);let ticks=0;
    while(!battle.finished&&ticks++<cap)battle.step();
    if(!battle.finished||battle.errorCount>0)throw Error('Incomplete or errored native preview');
    const own=battle.result().perPlayer?.[ps.playerId];if(!own)throw Error('Missing own native result');
    const countedLeaks=(own.leaked||[]).filter(l=>l&&l.counted!==false).length;
    const perfect=countedLeaks===0&&own.perfect!==false;
    const perfectCoins=perfect?copy.bounties.filter(b=>b.card.payout==='perfect').reduce((s,b)=>s+coinOf(b.card),0):0;
    const spawnedBounty=(opts.spawns||[]).filter(s=>probeId&&s.mods?.bountyId===probeId)
      .reduce((n,s)=>n+(Number.isInteger(s.count)?s.count:1),0);
    return {finished:true,ticks,killed:own.killed,countedLeaks,cappedLoss:Math.min(gd.lpCapPerRound,countedLeaks),
      preparationProjection:projected.receipt,
      perfect,spawnedBounty,killedBounty,creditedBountyCoins,
      newBountyCoins:creditedBountyCoins+(card?.payout==='perfect'&&perfect?coinOf(card):0),
      totalFutureCoins:Math.max(0,Math.trunc(Number(own.coins)||0))+perfectCoins};
  };
  let selected=null,error=null;
  try{
    receipt.baseline=run(null);
    for(const index of [...new Set(indices)].filter(Number.isInteger)){
      const card=cards[index],actual=ps.personalChoice.cards[index];
      if(!card||!actual||idOf(card)!==idOf(actual)||card.enemyKey!==actual.enemyKey||!gd.enemy(actual.enemyKey)){
        receipt.candidates.push({index,valid:false,reason:'Not the actual currently offered bounty'});continue;
      }
      // Use the native pending card, never caller-modified payout/count/price fields.
      const outcome=run(actual),safe=outcome.countedLeaks<=receipt.baseline.countedLeaks&&outcome.cappedLoss<ps.lp;
      receipt.candidates.push({index,id:idOf(actual),valid:true,...outcome,safe,
        incrementalFutureCoins:outcome.totalFutureCoins-receipt.baseline.totalFutureCoins});
    }
    const ranked=receipt.candidates.filter(c=>c.valid&&c.safe&&c.spawnedBounty>0&&c.newBountyCoins>0)
      .sort((a,b)=>b.newBountyCoins-a.newBountyCoins||a.countedLeaks-b.countedLeaks
        ||b.incrementalFutureCoins-a.incrementalFutureCoins||a.index-b.index);
    selected=ranked[0]?.index??null;
  }catch(e){error=e.message;}
  receipt.liveStateUnchanged=snapshot(m,ps)===before;
  if(!receipt.liveStateUnchanged)return done(null,'Live-state invariant failed; discard preview');
  if(error)return done(null,error);
  return done(selected,selected==null?'No paying offered bounty is independently safe against the baseline':null);
}
