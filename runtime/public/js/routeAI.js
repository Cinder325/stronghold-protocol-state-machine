// SPDX-License-Identifier: GPL-3.0-or-later
// Native lobby and observer controls. The image comes from the host's own asset manifest.
import {useState} from '../vendor/hooks.module.js';
import {html} from './ui/components.js';
import {assets} from './assets.js';
import {net} from './net.js';
import {useStore} from './store.js';
import {toastError} from './ui/toasts.js';
import {t} from '../../shared/i18n.js';
import {DEFAULT_ROUTE_BONDS,readRouteBonds,rememberRouteBonds,availableRouteBonds,legalRouteBonds} from './routeBanMemory.js';

export const routeAvatar=seat=>seat?.isBot&&seat.botPersona==='unified'?assets.avatar('char_245_cello'):null;
export function RouteOptions({room,isHost,busy,persona,onPersona,run}){
 if(room.mode!=='coop')return null;
 const cfg=room.routeAI||{},locked=!isHost||!!busy||room.inMatch;
 return html`<section style="margin:10px 24px;padding:12px;border:1px solid #65bba466;display:flex;gap:16px;flex-wrap:wrap;align-items:center" aria-label=${t('协同四路线AI设置')}>
  <label>${t('添加队友类型')} <select value=${persona} disabled=${locked} onChange=${e=>onPersona(e.currentTarget.value)}>
   <option value="unified">${t('协同四路线AI（推荐）')}</option><option value="vanilla">${t('原有AI')}</option>
  </select></label>
  <label><input type="checkbox" checked=${cfg.test===true} disabled=${locked} onChange=${e=>run('routeTest',()=>net.request('room.setRouteTest',{on:e.currentTarget.checked}))} /> ${t('四AI终极模拟测试（房主观战）')}</label>
  <${IntervalControl} value=${cfg.intervalMs??0} disabled=${!isHost||!!busy} onSet=${ms=>run('routeSpeed',()=>net.request('room.setRouteInterval',{intervalMs:ms}))} />
  <${RouteBanControl} key=${room.code} cfg=${cfg} locked=${locked} isHost=${isHost} run=${run} />
  ${cfg.test?html`<small style="flex-basis:100%">${t('四席由AI控制，使用原版队友列表切换观察；回合时限仍生效。盟约保护由独立开关控制。')}</small>`:null}
 </section>`;
}
function RouteBanControl({cfg,locked,isHost,run}){
 const [remembered,setRemembered]=useState(()=>readRouteBonds());
 const available=cfg.availableBonds||[],active=cfg.banProtection===true;
 // Server state controls an active room. Inactive room defaults must never overwrite browser memory.
 const selected=active||!isHost?(cfg.requiredBonds||[]):remembered,visible=availableRouteBonds(selected,available);
 const valid=legalRouteBonds(visible,available,cfg.banCounts);
 const save=next=>{rememberRouteBonds(next);setRemembered(next);};
 const change=async(on,next)=>{
  const chosen=availableRouteBonds(next,available);
  if(on&&!legalRouteBonds(chosen,available,cfg.banCounts)){toastError(new Error(t('所选盟约过多，无法按原规则生成禁用位；请减少勾选。')));return;}
  await run('routeBans',async()=>{
   await net.request('room.setRouteBans',on?{on:true,requiredBonds:chosen}:{on:false});
   save(on?chosen:next);
  });
 };
 const select=next=>active?change(true,next):save(next);
 return html`<div style="flex-basis:100%;border-top:1px solid #65bba433;padding-top:10px">
  <label><input aria-label=${t('指定盟约不被禁用')} type="checkbox" checked=${active} disabled=${locked||!available.length} onChange=${e=>change(e.currentTarget.checked,selected)} /> ${t('指定盟约不被禁用')}</label>
  <small style="margin-left:12px">${t('默认关闭；仅记忆勾选项，关闭或重启不会清除。')}</small>
  <details open=${active} style="margin-top:8px">
   <summary>${t('已选择 {n} 个盟约',{n:visible.length})}</summary>
   <small>${t('保留原有禁用数量，只筛选可能出现的组合；选中盟约仍可能因地图或规则不可用。')}</small>
   ${['core','addon'].map(category=>html`<div style="margin-top:8px"><strong>${category==='core'?t('核心盟约'):t('附加盟约')}</strong><div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:6px">${available.filter(b=>!!b.isCore===(category==='core')).map(b=>html`<label key=${b.id}><input type="checkbox" checked=${visible.includes(b.id)} disabled=${locked} onChange=${e=>select(e.currentTarget.checked?[...visible,b.id]:visible.filter(id=>id!==b.id))} /> ${t(b.name||b.id)}</label>`)}</div></div>`)}
   ${!valid?html`<small role="status" style="display:block;color:#ffcb8b;margin-top:8px">${t('所选盟约过多，无法按原规则生成禁用位；请减少勾选。')}</small>`:null}
   <button style="margin-top:10px" disabled=${locked} onClick=${()=>select(availableRouteBonds(DEFAULT_ROUTE_BONDS,available))}>${t('恢复四路线默认选择')}</button>
   ${!isHost?html`<small style="margin-left:10px">${t('仅房主可调整')}</small>`:null}
  </details>
 </div>`;
}
function IntervalControl({value,disabled,onSet}){
 const [draft,setDraft]=useState(null);
 const ms=draft??value;
 return html`<label style="display:flex;gap:8px;align-items:center">${t('AI每步间隔')} <input aria-label=${t('AI每步间隔')} type="range" min="0" max="5000" step="100" value=${ms} disabled=${disabled}
  onInput=${e=>setDraft(Number(e.currentTarget.value))} onChange=${e=>{const next=Number(e.currentTarget.value);setDraft(null);onSet(next);}} /> <output>${t('每步 {n} 秒',{n:(ms/1000).toFixed(1)})}</output></label>`;
}
export function RouteSpeedHUD(){
 const room=useStore(s=>s.room),me=useStore(s=>s.me),[busy,setBusy]=useState(false);
 if(!room?.inMatch||!room.routeAI||room.hostId!==me?.playerId||!room.seats?.some(s=>s?.botPersona==='unified'))return null;
 const send=async intervalMs=>{if(busy)return;setBusy(true);try{await net.request('room.setRouteInterval',{intervalMs});}catch(error){toastError(error);}finally{setBusy(false);}};
 return html`<aside style="position:fixed;right:16px;bottom:12px;z-index:140;background:#0c191eef;border:1px solid #7ed5ba;padding:10px;color:#d9f7ed;max-width:400px" aria-label=${t('协同AI观察设置')}>
  <small>${t('协同四路线AI · 点击原版队友栏切换观察对象')}</small>
  <${IntervalControl} value=${room.routeAI.intervalMs??0} disabled=${busy} onSet=${send} />
 </aside>`;
}
