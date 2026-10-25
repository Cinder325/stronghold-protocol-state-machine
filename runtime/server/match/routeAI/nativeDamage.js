// SPDX-License-Identifier: GPL-3.0-or-later
// The original host moved this API in 0.3.3. The AI imports its installed implementation.
let api;
try{api=await import('../../sim/damage.js');}
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;api=await import('../../sim/attack.js');}
export const mitigate=api.mitigate;
