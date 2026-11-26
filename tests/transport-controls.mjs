import assert from 'node:assert/strict';
import {bindTransportControls} from '../scripts/modules/transport-controls.js';
function button(){const handlers={}, attrs={};return {attrs,classList:{toggle(){}},addEventListener:(name,cb)=>handlers[name]=cb,setAttribute:(k,v)=>attrs[k]=v,click:()=>handlers.click({type:'click'}),blur:()=>{throw Error('keyboard focus must not be discarded')}}}
const controls=Array.from({length:11},button),calls=[];
const [p,mp,prev,mpr,next,mn,mute,mmute,shuffle,shufflePlay,repeat]=controls;
const state={audio:{muted:false},isShuffle:false,repeatMode:'all',currentVolumeValue:.65,isHardwareGain:true};const volumeLevel={textContent:''};
bindTransportControls({state,play:(...args)=>calls.push(['play',args]),previous:()=>calls.push('prev'),next:()=>calls.push('next'),setVolume:(...args)=>calls.push(['volume',args]),syncVolume:()=>calls.push('sync'),updateVolumeIcon:v=>calls.push(['icon',v]),volumeLevel,onOrderChange:()=>calls.push('order'),updateRepeat:()=>calls.push('repeat'),playButtons:[p,mp],previousButtons:[prev,mpr],nextButtons:[next,mn],muteButtons:[mute,mmute],shuffleBtn:shuffle,shufflePlayBtn:shufflePlay,repeatBtn:repeat});
p.click();mp.click();prev.click();mpr.click();next.click();mn.click();assert.deepEqual(calls.slice(0,6),[['play',[]],['play',[]],'prev','prev','next','next']);
shuffle.click();assert.equal(shuffle.attrs['aria-pressed'],'true');shuffle.click();assert.equal(shuffle.attrs['aria-pressed'],'false');shufflePlay.click();assert.equal(shuffle.attrs['aria-pressed'],'true');repeat.click();assert.equal(state.repeatMode,'one');repeat.click();assert.equal(state.repeatMode,'off');repeat.click();assert.equal(state.repeatMode,'all');
mute.click();assert.equal(state.audio.muted,true);assert.equal(volumeLevel.textContent,'0%');mmute.click();assert.equal(state.audio.muted,false);assert.deepEqual(calls.at(-1),['volume',[.65,true,false,{preserveMute:true,dispatchSystem:false}]]);
console.log('PASS shared transport: main/mini actions, keyboard focus, shuffle ARIA, repeat cycle, independent application mute');
