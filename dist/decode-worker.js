import {RobotReceiver} from './receiver.js';
let decoder;
self.onmessage=({data})=>{try{if(data.type==='init')decoder=new RobotReceiver(data.rate,event=>{const out={...event};if(event.pixels)out.pixels=event.pixels.slice();self.postMessage(out,out.pixels?[out.pixels.buffer]:[]);});else if(data.type==='samples')decoder?.process(data.samples);}catch(error){self.postMessage({type:'error',message:error.message});}};
