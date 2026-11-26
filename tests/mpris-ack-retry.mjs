import assert from 'node:assert/strict';
import {createMprisClient} from '../scripts/modules/mpris-client.js';
const host=new EventTarget();host.location={origin:'http://localhost'};
const s={allTracks:[{title:'Fixture'}],currentTrackIndex:0,audio:{paused:true,currentTime:0,duration:10,volume:.5}};
const id='1'.repeat(32), id2='2'.repeat(32), id3='3'.repeat(32);
let calls=[], receipts=[], polls=0, acks=0, next=0, pause=0, failed=0;
const response=data=>({ok:true,json:async()=>data});
const fetchRequest=async(url,opts)=>{
  const action=url.split('=').at(-1);calls.push(action);
  if(action==='update_state')return {ok:true};
  const body=JSON.parse(opts.body);
  if(action==='get_command'){
    polls++;
    if(polls===1)return response({command:'Next',id,lease_ms:15000});
    if(polls===2)return response({command:'Pause',id:id2,lease_ms:0});
    if(polls===3)return response({command:'Pause',id:id2,lease_ms:15000});
    if(polls===4)return response({command:'Next',id:id3,lease_ms:15000});
    return response({command:null});
  }
  if(action==='ack_command'){
    receipts.push(body);acks++;
    if(acks===1)throw Error('lost acknowledgement');
    return response({success:true,id:body.id,outcome:body.outcome});
  }
  throw Error('Unexpected request');
};
const client=createMprisClient({state:s,actions:{nextTrack(){if(++next===2){failed++;throw Error('fixture');}},pauseAudio(){pause++;}},fetchRequest,host,page:{hidden:false}});
client.start();try{
  const deadline=Date.now()+7000;
  while(receipts.length<4&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
  assert.equal(receipts.length,4);assert.equal(next,2);assert.equal(pause,1);assert.equal(failed,1);
  assert.deepEqual(receipts.map(x=>[x.id,x.outcome]),[[id,'dispatched'],[id,'dispatched'],[id2,'dispatched'],[id3,'failed']]);
  assert.equal(receipts[0].client,receipts[1].client);
  const c=calls.filter(x=>x!=='update_state');assert.deepEqual(c.slice(0,4),['get_command','ack_command','ack_command','get_command']);
}finally{client.dispose();}
console.log('PASS lost ACK retry without redispatch, stale lease rejection, failed synchronous action acknowledgement');
