import assert from 'node:assert/strict';
import {RobotReceiver} from '../dist/receiver.js';
import {encodeRobot36} from '../dist/encoder.js';

const rate = 16000, pixels = new Uint8ClampedArray(320*240*4);
// Different content on every row detects vertical compression and colour swaps
// that a vertically uniform colour-bar fixture cannot reveal.
for (let y=0;y<240;y++) for (let x=0;x<320;x++)
 pixels.set([x/319*255,y/239*255,((x>>5)+(y>>4))%2*255,255],(y*320+x)*4);
const source = encodeRobot36(pixels,rate);
function feed(receiver,samples) {
 for(let p=0;p<samples.length;p+=1024) receiver.process(samples.subarray(p,p+1024));
 return receiver;
}
function check(name,samples,limit) {
 const receiver=feed(new RobotReceiver(rate),samples);
 let error=0;
 for(let i=0;i<pixels.length;i++) if(i%4!==3) error+=Math.abs(receiver.pixels[i]-pixels[i]);
 error/=320*240*3;
 assert.equal(receiver.rows,240,name);
 assert.equal(receiver.done,true,name);
 assert.ok(error<limit,`${name}: colour/row alignment error ${error}`);
 console.log(`${name}: 240 rows, mean error ${error.toFixed(2)}/255`);
}

const faded=source.slice();
for(let line=25;line<220;line+=11){
 const start=Math.round((1.06+line*.15)*rate);
 faded.fill(0,start,start+Math.round(rate*.009));
}
check('18 missing sync pulses preserve every row',faded,10);
check('8 ms reflection does not lose the frame',source.map((s,i)=>.3*(s+.65*(source[i-128]||0))),35);
for(const factor of [.999,1.001]){
 const changed=new Float32Array(Math.round(source.length/factor));
 for(let i=0;i<changed.length;i++){
  const p=i*factor,j=Math.floor(p),a=p-j;
  changed[i]=(source[j]||0)*(1-a)+(source[j+1]||0)*a;
 }
 check(`Sound clock ratio ${factor}`,changed,10);
}
assert.equal(feed(new RobotReceiver(rate),source.slice(Math.round(rate*1.06))).rows,0,'no image without a valid VIS header');
const badHeader=source.slice();badHeader.fill(0,Math.round(rate*.90),Math.round(rate*.94));
assert.equal(feed(new RobotReceiver(rate),badHeader).rows,0,'invalid VIS must not be accepted');
let starts=0,lost=0;
const receiver=new RobotReceiver(rate,event=>{if(event.type==='start')starts++;if(event.type==='lost')lost++;});
feed(receiver,source.slice(0,rate*5));feed(receiver,new Float32Array(rate));
assert.equal(receiver.done,false,'truncated frame plus silence must not complete');
assert.equal(lost,1,'interruption is reported');
feed(receiver,source);
assert.equal(starts,2,'next header starts a fresh image');
assert.equal(receiver.done,true,'fresh transmission completes after interruption');
console.log('VIS validation and recovery after interruption: PASS');
