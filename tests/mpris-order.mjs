import assert from 'node:assert/strict';
import {createMprisClient} from '../scripts/modules/mpris-client.js';
const host=new EventTarget();host.location={origin:'http://localhost'};
const s={allTracks:[{title:'Fixture'}],currentTrackIndex:0,audio:{paused:true,currentTime:0,duration:10,volume:.5},isShuffle:false,repeatMode:'off'};
const commands=[{command:'ToggleShuffle'},{command:'SetShuffle',shuffle:false},{command:'SetLoopStatus',loopStatus:'Track'}];
let repeatUpdates=0,changes=[],methods=[],seq=0;
const actions={orderChanged(){changes.push([s.isShuffle,s.repeatMode]);},updateRepeatUI(){repeatUpdates++;},updateShuffleButton(){},refreshNativeOrder(){}};
const fetchRequest=async(url,options)=>{if(url.endsWith('get_command')){methods.push(options.method);return {ok:true,json:async()=>{const c=commands.shift();return c?{...c,id:(++seq).toString(16).padStart(32,'0'),lease_ms:15000}:{command:null}} };}if(url.endsWith('ack_command')){const r=JSON.parse(options.body);return {ok:true,json:async()=>({success:true,id:r.id,outcome:r.outcome})};}return {ok:true};};
const client=createMprisClient({state:s,actions,fetchRequest,host,page:{hidden:false}});
client.start();try { const deadline=Date.now()+4000;while(commands.length && Date.now()<deadline)await new Promise(r=>setTimeout(r,25));await new Promise(r=>setTimeout(r,10));assert.deepEqual(changes,[[true,'off'],[false,'off'],[false,'one']]);assert.equal(repeatUpdates,1);assert.deepEqual(methods,['POST','POST','POST']); } finally {client.dispose();}
console.log('PASS desktop media-key shuffle/repeat uses the shared order invalidation boundary and POST mailbox consumption');
