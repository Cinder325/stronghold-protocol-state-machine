// SPDX-License-Identifier: GPL-3.0-or-later
// Build exact, hash-pinned patches against a pristine supported host checkout.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROUTE_TRANSLATIONS} from './route-translations.mjs';

export function buildHostPatches(hostRoot){
 const patches=[];
 const add=(target,replacements)=>{
  const bytes=fs.readFileSync(path.join(hostRoot,target)),text=bytes.toString('utf8'),eol=text.includes('\r\n')?'\r\n':'\n';
  const entries=replacements.map(([find,replace])=>({find:find.replaceAll('\n',eol),replace:replace.replaceAll('\n',eol)}));
  let after=text;
  for(const entry of entries){const i=after.indexOf(entry.find);if(i<0||after.indexOf(entry.find,i+entry.find.length)>=0)throw Error(`Host patch anchor is not unique: ${target}: ${entry.find.slice(0,80)}`);after=after.slice(0,i)+entry.replace+after.slice(i+entry.find.length);}
  patches.push({target,sha256:[createHash('sha256').update(bytes).digest('hex')],replacements:entries});
 };
 add('server/match/bot.js',[
  ["import { ASPD_MIN }", "import {isUnifiedBot,pickBand as routePickBand,pickCard as routePickCard} from './routeAI/index.js';\nimport { ASPD_MIN }"],
  ['export function botPickBand(m, ps) {','export function botPickBand(m, ps) {\n  if(isUnifiedBot(m,ps))return routePickBand(m,ps);'],
  ['export function botPickCard(m, ps, cards, available) {','export function botPickCard(m, ps, cards, available) {\n  if(isUnifiedBot(m,ps)){const picked=routePickCard(m,ps,cards,available);if(picked!=null)return picked;}'],
  ['export class LayoutPlan extends Map {', 'export function layoutValue(m,ps,pieces,plan,params=LAYOUT_PARAMS){const model=fieldModel(m,ps),layout=new Layout(model,params);for(const p of pieces){const key=plan.get(p.uid);if(!key)continue;const rec=rangeRec(ps,chessRec(m,p.id,ps));if(rec){const [r,c]=parseKey(key);layout.units.push(unitOf(rec,key,r,c,plan.dirs?.get(p.uid)||pieceDir(p),model));}}return layout.value();}\n\nexport class LayoutPlan extends Map {'],
 ]);
 add('server/match/match/prep.js',[
  ["import { PHASE }", "import {startPrep as startRoutePrep,cancelBots as cancelRouteBots} from '../routeAI/index.js';\nimport { PHASE }"],
  ['  scheduleBotPrep(ps, i = 0) {','  scheduleBotPrep(ps, i = 0) {\n    if(startRoutePrep(this,ps,i))return;'],
  ['  endPrep() {\n    if (this.phase !== PHASE.PREP) return;', '  endPrep() {\n    if (this.phase !== PHASE.PREP) return;\n    cancelRouteBots(this);'],
 ]);
 add('server/match/match/phases.js',[
  ["import { PHASE, ERR }", "import {isUnifiedBot} from '../routeAI/index.js';\nimport { PHASE, ERR }"],
  ['    const token = this._turnToken;\n    this.later(0, () => {','    const token = this._turnToken;\n    const routeSeat=this.players.get(this.draftTurn());\n    const delay=isUnifiedBot(this,routeSeat)?Math.max(0,Math.min(5000,this.opts.routeAIIntervalMs||0)):0;\n    this.later(delay, () => {'],
 ]);
 add('server/match/match/spDraft.js',[
  ["import { PHASE, ERR }", "import {isUnifiedBot} from '../routeAI/index.js';\nimport { PHASE, ERR }"],
  ['    const token = this._turnToken;\n    this.later(this.scaled(DELAYS.BOT_ACTION), () => {','    const token = this._turnToken;\n    const routeSeat=this.players.get(this.spTurn());\n    const delay=isUnifiedBot(this,routeSeat)?Math.max(0,Math.min(5000,this.opts.routeAIIntervalMs||0)):this.scaled(DELAYS.BOT_ACTION);\n    this.later(delay, () => {'],
 ]);
 add('server/match/Match.js',[
  ["import { SharedPool, SharedItemPool, drawDisabledBonds } from './pool.js';", "import { SharedPool, SharedItemPool, drawDisabledBonds } from './pool.js';\nimport {selectTestBans} from './routeAI/index.js';"],
  ['    const bans = drawDisabledBonds(this.gd, this.rngSetup);','    const bans = selectTestBans(this.gd, this.rngSetup, this.opts);'],
 ]);
 add('server/match/match/setupVote.js',[
  ["import { drawDisabledBonds, SharedPool } from '../pool.js';", "import { drawDisabledBonds, SharedPool } from '../pool.js';\nimport {selectTestBans} from '../routeAI/index.js';"],
  ['      const bans = drawDisabledBonds(this.gd, rng);','      const bans = selectTestBans(this.gd, rng, this.opts);'],
 ]);
 add('server/match/match/platform.js',[
  ["import { PHASE", "import {cancelBots as cancelRouteBots} from '../routeAI/index.js';\nimport { PHASE"],
  ['  dispose() {\n    if (this.disposed) return;','  dispose() {\n    if (this.disposed) return;\n    cancelRouteBots(this);'],
 ]);
 add('server/match/match/settle.js',[
  ["import { PHASE", "import {cancelBots as cancelRouteBots} from '../routeAI/index.js';\nimport { PHASE"],
  ['    this.offersDispose();\n    this.ended = true;','    cancelRouteBots(this);\n    this.offersDispose();\n    this.ended = true;'],
 ]);
 add('shared/protocol.js',[
  ["  'room.addBot': {},", "  'room.addBot': {persona:v=>v==='unified'||v==='vanilla',$optional:['persona']},\n  'room.setRouteTest': {on:isBool},\n  'room.setRouteBans': {on:isBool,requiredBonds:v=>isList(v,64,isId),$optional:['requiredBonds']},\n  'room.setRouteInterval': {intervalMs:v=>isInt(v,0,5000)},"],
 ]);
 add('server/lobby.js',[
  ["import { randomBytes, randomInt } from 'node:crypto';", "import { randomBytes, randomInt } from 'node:crypto';\nimport {addRouteBot,setRouteTest,setRouteBans,setRouteInterval,publicRouteRoom,routeMatchOptions,routeSeatIdentity,adaptTestRoom,restoreRouteHost} from './routeLobby.js';"],
  ['      aiPicksLast: this.aiPicksLast,','      aiPicksLast: this.aiPicksLast,\n      ...publicRouteRoom(this),'],
  ['? { seat: s.seat, playerId: s.playerId, name: s.name, isBot: s.isBot, ready: s.ready, connected: s.connected && !s.left,','? { seat: s.seat, playerId: s.playerId, name: s.name, isBot: s.isBot, ready: s.ready, connected: s.connected && !s.left, ...routeSeatIdentity(s),'],
  ["      case 'room.addBot': return this.addBot(session);", "      case 'room.addBot': return addRouteBot(this,session,msg);\n      case 'room.setRouteTest': return setRouteTest(this,session,msg);\n      case 'room.setRouteBans': return setRouteBans(this,session,msg);\n      case 'room.setRouteInterval': return setRouteInterval(this,session,msg);"],
  ['    return this.startMatch(room, key);','    const routeReady=adaptTestRoom(this,room,session);\n    if(routeReady.error)return routeReady;\n    return this.startMatch(room, key);'],
  ['        seat: s.seat, playerId: s.playerId, name: s.name, isBot: s.isBot, connected: s.connected,','        seat: s.seat, playerId: s.playerId, name: s.name, isBot: s.isBot, connected: s.connected, ...routeSeatIdentity(s),'],
  ['        seats,\n        // the spectator seats','        seats,\n        ...routeMatchOptions(room),\n        // the spectator seats'],
  ['      this.disposeMatchCtx(ctx);\n      this.broadcastState(room);','      this.disposeMatchCtx(ctx);\n      restoreRouteHost(this,room);\n      this.broadcastState(room);'],
  ['    room.replay = this.buildReplay(room, ctx);','    room.replay = this.buildReplay(room, ctx);\n    restoreRouteHost(this,room);'],
 ]);
 add('public/js/screens/room.js',[
  ["import { useEffect,", "import {RouteOptions,routeAvatar} from '../routeAI.js';\nimport { useEffect,"],
  ['<${AvatarFrame} size="xl" name=${seat.name} seat=${index} bot=${seat.isBot}', '<${AvatarFrame} size="xl" src=${routeAvatar(seat)} name=${seat.name} seat=${index} bot=${seat.isBot}'],
  ['  const [busy, setBusy] = useState(null);','  const [routePersona,setRoutePersona]=useState(\'unified\');\n  const [busy, setBusy] = useState(null);'],
  ["  const addBot = () => run('add', () => net.request('room.addBot', {}));", "  const addBot = () => run('add', () => net.request('room.addBot', {persona:(room.version&&room.version!=='act2autochess')||room.content?.vanilla===false?'vanilla':routePersona}));"],
  ['    <${SpectatorBar} facts=${facts}', '    <${RouteOptions} room=${room} isHost=${facts.isHost} busy=${busy} persona=${routePersona} onPersona=${setRoutePersona} run=${run} />\n    <${SpectatorBar} facts=${facts}'],
 ]);
 add('public/js/main.js',[
  ["import { RoomScreen, TrustedNotice } from './screens/room.js';", "import { RoomScreen, TrustedNotice } from './screens/room.js';\nimport {RouteSpeedHUD} from './routeAI.js';"],
  ['    <${TrustedNotice} />','    <${RouteSpeedHUD} />\n    <${TrustedNotice} />'],
 ]);
 for(const [lang,entries] of Object.entries(ROUTE_TRANSLATIONS)){
  const target=`public/i18n/${lang}.json`,existing=JSON.parse(fs.readFileSync(path.join(hostRoot,target),'utf8'));
  const extra=Object.fromEntries(Object.entries(entries).filter(([key])=>!Object.hasOwn(existing,key)));
  if(Object.keys(extra).length){const lines=Object.entries(extra).map(([key,value])=>`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n');add(target,[['  "_meta": {',lines+'\n  "_meta": {']]);}
 }
 return patches;
}
