// SPDX-License-Identifier: GPL-3.0-or-later
// Remember bond identifiers only. Enabling protection is a per-room choice, never a saved preference.
export const ROUTE_BAN_MEMORY_KEY='stronghold.routeAI.keepBonds.v1';
export const DEFAULT_ROUTE_BONDS=Object.freeze(['lateranoShip','kjeragShip','sargonShip','siracusaShip','skillfulShip','preciShip','swiftShip','arcaneShip','visiShip','miraShip']);
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function normalizeRouteBonds(value){
 if(!Array.isArray(value)||value.length>128||value.some(id=>typeof id!=='string'||!/^[a-zA-Z][a-zA-Z0-9]*Ship$/.test(id)))return null;
 return [...new Set(value)];
}
export function readRouteBonds(storage=browserStorage()){
 try{const saved=JSON.parse(storage?.getItem(ROUTE_BAN_MEMORY_KEY)??'null'),selected=normalizeRouteBonds(saved?.requiredBonds);return selected??[...DEFAULT_ROUTE_BONDS];}
 catch{return [...DEFAULT_ROUTE_BONDS];}
}
export function rememberRouteBonds(requiredBonds,storage=browserStorage()){
 const selected=normalizeRouteBonds(requiredBonds);if(!selected)return false;
 try{if(!storage)return false;storage.setItem(ROUTE_BAN_MEMORY_KEY,JSON.stringify({requiredBonds:selected}));return true;}catch{return false;}
}
export function availableRouteBonds(selected,available){
 const known=new Set(available.map(b=>b.id));return (normalizeRouteBonds(selected)||[]).filter(id=>known.has(id));
}
export function legalRouteBonds(selected,available,counts){
 const keep=new Set(selected);
 return ['core','addon'].every(category=>available.filter(b=>!!b.isCore===(category==='core')&&!keep.has(b.id)).length>=Number(counts?.[category]??0));
}
