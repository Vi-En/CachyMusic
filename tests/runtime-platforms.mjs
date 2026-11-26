import assert from 'node:assert/strict';
import { detectRuntimeCapabilities } from '../scripts/modules/runtime-capabilities.js';
const nav = { userAgent:'Windows NT 10.0', platform:'Win32', maxTouchPoints:0 };
Object.defineProperty(globalThis,'navigator',{configurable:true,value:nav});
globalThis.window={location:{hostname:'127.0.0.1',origin:'http://127.0.0.1:8000'}, matchMedia:()=>({matches:false})};
function backend(data) { globalThis.fetch=async()=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}); }
backend({success:true,osFamily:'windows',hardwareGain:true,mprisBridge:true,lanUrl:null});
let rt=await detectRuntimeCapabilities(true);
assert.equal(rt.osFamily,'windows');assert.equal(rt.hasHardwareGain,false);assert.equal(rt.hasMprisBridge,false);
nav.userAgent='Linux';nav.platform='Linux x86_64';
backend({success:true,osFamily:'linux',hardwareGain:true,mprisBridge:false});
rt=await detectRuntimeCapabilities(true);assert.equal(rt.hasHardwareGain,true);assert.equal(rt.hasMprisBridge,false);
backend({success:true,osFamily:'linux',hardwareGain:false,mprisBridge:true});
rt=await detectRuntimeCapabilities(true);assert.equal(rt.hasHardwareGain,false);assert.equal(rt.hasMprisBridge,true);
nav.userAgent='Android';window.location.hostname='appassets.androidplatform.net';window.AndroidBridge={isAndroid:()=>true};
rt=await detectRuntimeCapabilities(true);assert.equal(rt.mode,'android-apk');assert.equal(rt.hasPhpBackend,false);assert.equal(rt.hasHardwareGain,true);
delete window.AndroidBridge;
rt=await detectRuntimeCapabilities(true);assert.equal(rt.mode,'standalone-pwa');assert.equal(rt.hasHardwareGain,false);
console.log('PASS Windows/Linux capability separation, opt-in MPRIS, Android bridge and PWA fallback');
