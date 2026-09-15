import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

// Exercise the real UI handlers with deterministic microphone/worker doubles.
// No microphone hardware, network requests or production counters are used.
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8')
 .replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',"'https://example.test/app.js'");
function fixture({deny=false}={}) {
 const elements=new Map(), workers=[];
 let attempts=0;
 const element=id=>{
  if(!elements.has(id))elements.set(id,{
   classList:{toggle(){},add(){},remove(){}},style:{},setAttribute(){},
   getContext:()=>({clearRect(){},putImageData(){}})
  });
  return elements.get(id);
 };
 class AudioContext {
  sampleRate=48000;
  audioWorklet={async addModule(){}};
  async resume(){}
  async close(){}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
 }
 class Worker {
  constructor(){workers.push(this);}
  postMessage(){}
  terminate(){}
 }
 const context={
  document:{getElementById:element,addEventListener(){},visibilityState:'visible'},
  window:{isSecureContext:true,AudioContext,addEventListener(){}},
  navigator:{mediaDevices:{async getUserMedia(){
   if(deny){const error=new Error('denied');error.name='NotAllowedError';throw error;}
   return {getTracks:()=>[{stop(){}}]};
  }}},
  Worker,AudioWorkletNode:class{port={};connect(){}disconnect(){}},
  ImageData:class{},URL,location:{hash:''},cancelAnimationFrame(){},
  initStats(){},countReceiveAttempt(){attempts++;}
 };
 vm.runInNewContext(source,context);
 return {element,workers,get attempts(){return attempts;}};
}

await test('zero-row and interrupted attempts count once when listening starts',async()=>{
 const f=fixture();
 await f.element('listenButton').onclick();
 assert.equal(f.attempts,1,'microphone started, no image needed');
 f.element('resetButton').onclick();
 assert.equal(f.attempts,1,'clearing while listening is not a new session');
 const worker=f.workers.at(-1);
 worker.onmessage({data:{type:'start'}});
 worker.onmessage({data:{type:'image',rows:32,pixels:new Uint8ClampedArray(320*240*4)}});
 worker.onmessage({data:{type:'lost',rows:32}});
 assert.equal(f.attempts,1,'partial rows and loss do not double-count');
 await f.element('listenButton').onclick();
 assert.equal(f.attempts,1,'stopping does not count');
 await f.element('listenButton').onclick();
 assert.equal(f.attempts,2,'a new listening session is another attempt');
});

await test('completing a frame does not increment a second time',async()=>{
 const f=fixture();
 await f.element('listenButton').onclick();
 f.workers.at(-1).onmessage({data:{type:'complete',rows:240,pixels:new Uint8ClampedArray(320*240*4)}});
 assert.equal(f.attempts,1);
 assert.equal(f.element('receiveStatus').textContent,'Fotoğraf alındı!');
});

await test('denied microphone access does not count as an attempt',async()=>{
 const f=fixture({deny:true});
 await f.element('listenButton').onclick();
 assert.equal(f.attempts,0);
 assert.match(f.element('message').textContent,/Mikrofon izni verilmedi/);
});
