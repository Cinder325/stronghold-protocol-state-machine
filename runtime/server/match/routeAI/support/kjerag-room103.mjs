// Native temp queues may refill a sold hand slot immediately. An accepted sale
// is not proof that a purchase is now legal. Restore/equip first, then re-read.
export function ensurePurchaseRoom103({observe,equip=()=>null,restore=()=>{},surplus=()=>null,act,active=()=>true,maxSteps=48}){
 const seen=new Set(),receipt={ok:false,steps:0,stop:'bounded'};
 for(let n=0;n<maxSteps&&active();n++){
  let p=observe();if(p.hand.some(u=>u==null)){receipt.ok=true;receipt.stop='real-hand-slot';return receipt;}
  const key=JSON.stringify([p.hand,p.temp,p.board]);if(seen.has(key)){receipt.stop='unchanged-visible-capacity';return receipt;}seen.add(key);
  const equipment=equip(p);if(equipment){if(!act(equipment,'capacity-use-owned-equipment'))return receipt;receipt.steps++;continue;}
  restore();p=observe();if(p.hand.some(u=>u==null)){receipt.ok=true;receipt.stop='restored-selected-roster';return receipt;}
  const candidate=surplus(p);if(!candidate){receipt.stop='only-protected-assets';return receipt;}
  if(!act({t:'g.sell',uid:candidate.uid},'capacity-surplus-rechecked'))return receipt;receipt.steps++;
 }
 return receipt;
}
