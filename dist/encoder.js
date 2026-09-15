export const WIDTH=320,HEIGHT=240,RATE=16000;
// Robot36: VIS=8, 150 ms/line, alternating Cr/Cb. Timings verified against pySSTV.
export function encodeRobot36(rgba,rate=RATE){
 if(rgba.length!==WIDTH*HEIGHT*4)throw Error('Fotoğraf 320 × 240 olmalı.');
 const output=new Float32Array(Math.ceil(rate*38));let time=0,pos=0,phase=0;
 function tone(freq,seconds){time+=seconds;const end=Math.round(time*rate),step=2*Math.PI*freq/rate;while(pos<end){output[pos++]=freq?Math.sin(phase)*.75:0;phase=(phase+step)%(2*Math.PI);}}
 tone(0,.15);tone(1900,.3);tone(1200,.01);tone(1900,.3);tone(1200,.03);
 let parity=0;for(let bit=0;bit<7;bit++){const one=(8>>bit)&1;parity^=one;tone(one?1100:1300,.03);}tone(parity?1100:1300,.03);tone(1200,.03);
 for(let y=0;y<HEIGHT;y++){
  const luma=new Float64Array(WIDTH),chroma=new Float64Array(WIDTH);
  for(let x=0;x<WIDTH;x++){const p=(y*WIDTH+x)*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];luma[x]=.299*r+.587*g+.114*b;chroma[x]=128+(y%2?-.168736*r-.331264*g+.5*b:.5*r-.418688*g-.081312*b);}
  tone(1200,.009);tone(1500,.003);
  for(const v of luma)tone(1500+800*Math.max(0,Math.min(255,v))/255,.088/WIDTH);
  tone(y%2?2300:1500,.0045);tone(1900,.0015);
  for(const v of chroma)tone(1500+800*Math.max(0,Math.min(255,v))/255,.044/WIDTH);
 }
 tone(1500,.04);tone(0,.2);return output.slice(0,pos);
}
export function makeWav(samples,rate=RATE){
 const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);
 const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);return buffer;
}
