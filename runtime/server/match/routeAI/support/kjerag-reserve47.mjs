// A current visible project can survive to the next prep; no future stock/draw forecast.
export function reserveVisibleProject47(gd,p,quotes,{round=1,bossRound=14}={}){
  if(round<=2||round>bossRound||p.personalChoice||p.shop.rewardOffer||p.shop.frozen)return null;
  const wanted=quotes.filter(q=>q.s&&!q.s.sold&&q.s.price>p.funds&&(q.merge||q.group>=3))
    .sort((a,b)=>Number(b.merge)-Number(a.merge)||b.group-a.group||b.score-a.score||a.slot-b.slot)[0];
  if(!wanted)return null;
  if(quotes.some(q=>q.s&&!q.s.sold&&q.s.price<=p.funds&&q.group>0))return null;
  const coin=p.shop.slots.findIndex(s=>s&&!s.sold&&s.kind==='item'&&s.id==='chess_item_1_03_e_a'&&s.price<=p.funds);
  if(coin>=0&&p.hand.some(u=>u==null)&&!gd.leftoverKeptBands.includes(p.bandId))
    return {intent:{t:'g.buy',slot:coin},task:'bank-before-project-freeze',stopAfter:false,
      projectSlot:wanted.slot,reason:'Store actual remaining cash as an offered native coin; project stays visible and is frozen after this purchase'};
  return {intent:{t:'g.freeze'},task:'freeze-visible-unfunded-project',stopAfter:true,
    projectSlot:wanted.slot,reason:'Native whole-shop freeze retains an actual merge/core/growth offer that cannot currently be paid; no future offer assumed'};
}
