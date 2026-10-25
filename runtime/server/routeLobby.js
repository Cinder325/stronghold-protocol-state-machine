// SPDX-License-Identifier: GPL-3.0-or-later
// Teammate seats and an observer-only four-bot test room; never human-seat automation.
import {randomBytes} from 'node:crypto';
import {ERR,MAX_SPECTATORS,modeIdFor} from '../shared/constants.js';
import {getData} from './data.js';
import {GameData} from './match/gamedata.js';
import {setInterval as setRouteIntervalRuntime} from './match/routeAI/index.js';
import {nativeBanChoices,validateProtectedBonds} from './match/routeAI/testBans.js';

const OK=Object.freeze({ok:true});
const fail=(error,detail)=>({error,...(detail?{detail}:{})});
export const ROUTE_REQUIREMENTS=Object.freeze(['lateranoShip','kjeragShip','sargonShip','siracusaShip','skillfulShip','preciShip','swiftShip','arcaneShip','visiShip','miraShip']);
const nativeDataByMode=new Map();
function nativeRoomData(room){
 const id=modeIdFor('coop',room.difficulty);
 if(!nativeDataByMode.has(id))nativeDataByMode.set(id,new GameData(getData(),id));
 return nativeDataByMode.get(id);
}
function roomSelection(room){return [...(room.routeAIRequiredBonds??ROUTE_REQUIREMENTS)];}
export function routeSeatIdentity(seat){return seat?.isBot?{botPersona:seat.botPersona==='unified'?'unified':'vanilla'}:{};}
export function publicRouteRoom(room){
 if(room.mode!=='coop')return {};
 const gd=nativeRoomData(room);
 return {routeAI:{test:room.routeAITest===true,intervalMs:room.routeAIIntervalMs??0,banProtection:room.routeAIBanProtection===true,requiredBonds:roomSelection(room),availableBonds:nativeBanChoices(gd),banCounts:gd.bans(gd.difficulty)}};
}
export function routeMatchOptions(room){return room.mode==='coop'?{routeAITest:room.routeAITest===true,routeAIIntervalMs:room.routeAIIntervalMs??0,routeAIBanProtection:room.routeAIBanProtection===true,routeAIRequiredBonds:roomSelection(room)}:{};}
function checkedRoom(lobby,session,{before=false}={}){
 const room=lobby.roomOf(session);
 if(!room)return {error:fail(ERR.NOT_IN_ROOM)};
 if(room.hostId!==session.playerId)return {error:fail(ERR.NOT_HOST)};
 if(before&&room.match)return {error:fail(ERR.ROOM_STARTED)};
 if(room.mode!=='coop'||room.modded||(room.version&&room.version!=='act2autochess'))return {error:fail(ERR.BAD_TARGET,'Coordinated AI requires an original-content Alliance co-op room')};
 return {room};
}
function newBot(room,index,persona='unified'){
 let playerId;do{playerId='ai_'+randomBytes(4).toString('hex');}while(room.seatOf(playerId));
 return {seat:index,playerId,name:persona==='unified'?'协同AI':'原有AI',isBot:true,botPersona:persona,ready:true,connected:true,left:false};
}
function renumber(room){
 for(const persona of ['unified']){
  const seats=room.seats.filter(s=>s?.isBot&&(s.botPersona||'vanilla')===persona);
  seats.forEach((s,i)=>{s.name=(persona==='unified'?'协同AI':'原有AI')+(seats.length>1?String(i+1):'');});
 }
}
export function addRouteBot(lobby,session,{persona='unified'}={}){
 if(persona==='vanilla')return lobby.addBot(session);
 const checked=checkedRoom(lobby,session,{before:true});if(checked.error)return checked.error;
 const {room}=checked;
 if(!['unified','vanilla'].includes(persona))return fail(ERR.BAD_MSG,'Unknown teammate AI');
 const index=room.freeSeat();if(index<0)return fail(ERR.ROOM_FULL);
 lobby.dropReplay(room,session.playerId);
 room.seats[index]=newBot(room,index,persona);renumber(room);lobby.broadcastState(room);return OK;
}
export function setRouteTest(lobby,session,{on}){
 const checked=checkedRoom(lobby,session,{before:true});if(checked.error)return checked.error;
 const {room}=checked;if(typeof on!=='boolean')return fail(ERR.BAD_MSG);
 if(on&&(room.activeHumans().length!==1||!room.seatOf(session.playerId)))return fail(ERR.BAD_TARGET,'Four-AI test requires the host to be the only human player');
 lobby.dropReplay(room,session.playerId);room.routeAITest=on;
 if(on)room.difficulty='ABYSS';
 for(const seat of room.activeHumans())if(seat.playerId!==room.hostId)seat.ready=false;
 lobby.broadcastState(room);return OK;
}
export function setRouteBans(lobby,session,{on,requiredBonds}){
 const checked=checkedRoom(lobby,session,{before:true});if(checked.error)return checked.error;
 const {room}=checked;if(typeof on!=='boolean')return fail(ERR.BAD_MSG);
 let selected;
 try{
  // Disabling must stay possible even after a difficulty change makes the saved
  // selection too broad; the remembered IDs do not affect a native unfiltered draw.
  if(on===false&&requiredBonds===undefined)selected=roomSelection(room);
  else{
   const gd=new GameData(lobby.dataFor(room),modeIdFor(room.mode,room.difficulty));
   selected=validateProtectedBonds(gd,requiredBonds===undefined?roomSelection(room):requiredBonds);
  }
 }catch(error){return fail(ERR.BAD_MSG,error.message);}
 lobby.dropReplay(room,session.playerId);
 room.routeAIBanProtection=on;room.routeAIRequiredBonds=selected;
 for(const seat of room.activeHumans())if(seat.playerId!==room.hostId)seat.ready=false;
 lobby.broadcastState(room);return OK;
}
export function setRouteInterval(lobby,session,{intervalMs}){
 const checked=checkedRoom(lobby,session);if(checked.error)return checked.error;
 const {room}=checked;
 if(!Number.isInteger(intervalMs)||intervalMs<0||intervalMs>5000)return fail(ERR.BAD_MSG);
 room.routeAIIntervalMs=intervalMs;
 if(room.match)setRouteIntervalRuntime(room.match,intervalMs);
 lobby.broadcastState(room);return OK;
}
// Called only after all normal room.start authorization/rate/readiness checks succeeded.
export function adaptTestRoom(lobby,room,session){
 if(room.routeAIBanProtection===true){
  if(room.mode!=='coop'||room.modded||(room.version&&room.version!=='act2autochess'))return fail(ERR.BAD_TARGET,'Protected bonds require original-content Alliance co-op');
  try{validateProtectedBonds(new GameData(lobby.dataFor(room),modeIdFor(room.mode,room.difficulty)),roomSelection(room));}
  catch(error){return fail(ERR.BAD_TARGET,error.message);}
 }
 if(room.routeAITest!==true)return OK;
 if(room.mode!=='coop'||room.modded||(room.version&&room.version!=='act2autochess')||room.difficulty!=='ABYSS')return fail(ERR.BAD_TARGET,'Four-AI test requires original Alliance highest difficulty');
 const humans=room.activeHumans(),host=room.seatOf(session.playerId);
 if(humans.length!==1||humans[0]!==host||room.hostId!==session.playerId)return fail(ERR.BAD_TARGET,'Four-AI test requires the host to be the only human player');
 if(room.spectators.length>=MAX_SPECTATORS)return fail(ERR.ROOM_FULL,'No observer seat is available');
 room._routeAIOriginalSeats=room.seats.slice();
 room.spectators.push({playerId:host.playerId,name:host.name,connected:host.connected});
 room.seats=room.seats.map((_,index)=>newBot(room,index));renumber(room);return OK;
}
export function restoreRouteHost(lobby,room){
 const seats=room._routeAIOriginalSeats;if(!seats)return;
 const host=seats.find(s=>s&&!s.isBot&&s.playerId===room.hostId);
 if(host){
  const observer=room.spectatorOf(host.playerId);
  if(observer){host.connected=observer.connected;room.spectators=room.spectators.filter(s=>s.playerId!==host.playerId);}
  host.ready=false;
 }
 room.seats=seats;delete room._routeAIOriginalSeats;
}
