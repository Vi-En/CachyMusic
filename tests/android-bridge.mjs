import assert from 'node:assert/strict';import {AndroidSoulseekBridge} from '../scripts/modules/android-soulseek-bridge.js';
const sent=[];const bridge=new AndroidSoulseekBridge({enqueueSoulseekApi(...a){sent.push(a);return true;}},{timeout:100,maxPending:2,idPrefix:'test'});
const a=bridge.request('login','{}',''),b=bridge.request('status','{}','');
await assert.rejects(bridge.request('status','{}',''),/busy/);assert.equal(bridge.accept('unknown','{}'),false);
bridge.accept(sent[1][0],'{"ok":true}');bridge.accept(sent[0][0],'{"connected":true}');assert.equal(JSON.parse(await a).connected,true);assert.equal(JSON.parse(await b).ok,true);
const invalid=bridge.request('status','{}','');bridge.accept(sent.at(-1)[0],'not json');await assert.rejects(invalid,/JSON/);
await assert.rejects(bridge.request('status','{}',''),/timed out/);assert.equal(bridge.pending.size,0);
const closed=bridge.request('status','{}','');bridge.close();await assert.rejects(closed,/closed/);assert.equal(bridge.pending.size,0);
console.log('PASS async Android Soulseek bridge: concurrent response routing, backpressure, malformed reply, timeout, cleanup');
