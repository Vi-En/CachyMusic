import assert from 'node:assert/strict';
import {bindDisclosure,syncVolumeSliders} from '../scripts/modules/control-ui.js';
import {peerBitrate,describePeerAudio,comparePeerBitrate} from '../scripts/modules/soulseek-result-metadata.js';
class Control extends EventTarget {
    constructor(){super();this.hidden=true;this.attrs={};this.styles={};this.classes=new Set();this.classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};this.style={setProperty:(k,v)=>this.styles[k]=v};this.min='0';this.max='1.5';}
    setAttribute(k,v){this.attrs[k]=v;}
}
const button=new Control(),panel=new Control(); const dispose=bindDisclosure(button,panel);
assert.equal(button.attrs['aria-expanded'],'false');button.dispatchEvent(new Event('click'));assert.equal(panel.hidden,false);assert.equal(button.attrs['aria-expanded'],'true');button.dispatchEvent(new Event('click'));assert.equal(panel.hidden,true);dispose();button.dispatchEvent(new Event('click'));assert.equal(panel.hidden,true);
const a=new Control(),b=new Control();syncVolumeSliders(1.2,a,b);assert.equal(a.value,'1.2');assert.equal(b.value,'1.2');assert.equal(a.attrs['aria-valuetext'],'120 percent');assert(a.classes.has('amplified'));assert(Math.abs(parseFloat(a.styles['--volume-fill'])-80)<.00001);syncVolumeSliders(.8,a,b);assert(!b.classes.has('amplified'));assert.equal(b.attrs['aria-valuetext'],'80 percent');
assert.equal(peerBitrate({filename:'Track 192 FLAC',isLossless:true}).value,null);assert.equal(describePeerAudio({filePath:'24bit 192kHz'}).sample,'');assert.equal(describePeerAudio({bitrate:1411,bitrateSource:'reported',sampleRate:44100,bitDepth:16}).bitrate,'1411 kbps');assert.equal(describePeerAudio({size:4000000,duration:100}).bitrate,'≈ 320 kbps');assert.equal(describePeerAudio({bitrate:320,bitrateSource:'estimated'}).bitrate,'≈ 320 kbps');assert.equal(describePeerAudio({sampleRate:null,bitDepth:null}).sample,'');for(const dir of [-1,1])assert.equal(comparePeerBitrate({}, {bitrate:320},dir),1);
console.log('PASS disclosure lifecycle, shared volume range/ARIA, honest peer audio metadata and unknown-last sorting');
