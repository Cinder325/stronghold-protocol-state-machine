// SPDX-License-Identifier: GPL-3.0-or-later
export {isUnifiedBot,routeIdentity as identity} from './routes.js';
export {selectTestBans} from './testBans.js';
export {startPrep,cancelBots,setInterval} from './driver.js';
import {selectBand,routeFor} from './routes.js';
export const pickBand=(m,ps)=>selectBand(m,ps);
// Native scoring reads this commitment too. Returning null delegates unhandled card families to the host.
export function pickCard(m,ps){const route=routeFor(m,ps);if(route){ps._botFocusId=route.core;ps._botCoreCommitted=true;delete ps._botFocus;}return null;}
