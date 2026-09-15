import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encodeRobot36,makeWav} from '../dist/encoder.js';
import {RobotReceiver} from '../dist/receiver.js';
fs.mkdirSync('test-output',{recursive:true});
const colors=[[255,255,255],[255,255,0],[0,255,255],[0,255,0],[255,0,255],[255,0,0],[0,0,255],[0,0,0]];
const pixels=new Uint8ClampedArray(320*240*4);for(let y=0;y<240;y++)for(let x=0;x<320;x++){const p=(y*320+x)*4,c=colors[Math.floor(x/40)];pixels.set([...c,255],p);}
fs.writeFileSync('test-output/source.rgba',pixels);
function errorMetric(decoded){let sum=0,n=0;for(let y=8;y<232;y++)for(let x=8;x<312;x++){if(x%40<8||x%40>32)continue;for(let k=0;k<3;k++){sum+=Math.abs(decoded[(y*320+x)*4+k]-pixels[(y*320+x)*4+k]);n++;}}return sum/n;}
function run(name,samples,rate){let updates=0;const d=new RobotReceiver(rate,e=>{if(e.type==='image'||e.type==='complete')updates++;});let p=0;const started=performance.now();while(p<samples.length){const size=[128,1024,4096,333][Math.floor(p/3000)%4];d.process(samples.subarray(p,p+size));p+=size;}const error=errorMetric(d.pixels);fs.writeFileSync('test-output/'+name+'.rgba',d.pixels);console.log(JSON.stringify({name,rate,rows:d.rows,updates,done:d.done,error,processingMs:Math.round(performance.now()-started)}));assert.equal(d.rows,240,name+' must include final row');assert.ok(error<18,name+' color error too large');return d;}
for(const rate of [16000,44100,48000]){const samples=encodeRobot36(pixels,rate);run('roundtrip-'+rate,samples,rate);if(rate===48000)fs.writeFileSync('test-output/microphone.wav',Buffer.from(makeWav(samples,rate)));if(rate===16000){const noisy=samples.map((v,i)=>v*.35+.006*Math.sin(i*19.234)+.025*samples[Math.max(0,i-240)]);run('quiet-echo-noise',noisy,rate);}}
const silence=new RobotReceiver(48000);silence.process(new Float32Array(48000*2));assert.equal(silence.rows,0);console.log('Silence does not produce image: PASS');
const truncated=new RobotReceiver(16000);truncated.process(encodeRobot36(pixels).slice(0,16000*5));assert.equal(truncated.done,false);console.log('Truncated signal is not marked complete: PASS');
if(fs.existsSync('test-output/reference.wav')){const b=fs.readFileSync('test-output/reference.wav');let offset=12,rate=0,pcm;while(offset+8<=b.length){const tag=b.toString('ascii',offset,offset+4),size=b.readUInt32LE(offset+4);if(tag==='fmt ')rate=b.readUInt32LE(offset+12);if(tag==='data')pcm=b.subarray(offset+8,offset+8+size);offset+=8+size+(size%2);}const samples=new Float32Array(pcm.length/2+rate/10);for(let i=0;i<pcm.length/2;i++)samples[i]=pcm.readInt16LE(i*2)/32768;run('independent-pysstv',samples,rate);}
