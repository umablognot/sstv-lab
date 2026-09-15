import {SyncDetector,SyncPulseWidth} from './vendor/sync-detector.js';
export class RobotReceiver{
 constructor(rate,onUpdate=()=>{}){this.rate=rate;this.onUpdate=onUpdate;this.sync=new SyncDetector(rate);this.buffer=new Float32Array(Math.ceil(rate*3));this.pixels=new Uint8ClampedArray(320*240*4);for(let i=3;i<this.pixels.length;i+=4)this.pixels[i]=255;this.position=0;this.previous=null;this.pending=null;this.locked=false;this.rows=0;this.done=false;this.lastSync=0;this.even=null;this.dropped=0;}
 read(pos){return this.buffer[((Math.round(pos)%this.buffer.length)+this.buffer.length)%this.buffer.length];}
 mean(start,length){let sum=0;const n=Math.max(1,Math.round(length));for(let i=0;i<n;i++)sum+=this.read(start+i);return sum/n;}
 process(samples){
  if(this.done||this.blocked)return;
  // Limit chunks so the sync detector never needs to report more than one pulse.
  for(let p=0;p<samples.length;p+=512){const input=samples.subarray(p,p+512),demod=new Float32Array(input.length),result=this.sync.process(input,demod);for(let i=0;i<demod.length;i++)this.buffer[(this.position+i)%this.buffer.length]=demod[i];this.position+=input.length;
   if(result.detected&&(result.width===SyncPulseWidth.NineMilliSeconds||result.width===SyncPulseWidth.TwentyMilliSeconds)){
    const candidate={end:this.position-input.length+result.offset,offset:result.frequencyOffset};
    const interval=this.previous?(candidate.end-this.previous.end)/this.rate:0;
    if(!this.locked){if(interval>.140&&interval<.160){this.locked=true;this.pending=this.previous;this.lastSync=candidate.end;
      // The VIS parity/stop bits may merge with the very first line sync.
      // Recover that first even line only when its separator AND sync are present.
      const priorEnd=this.previous.end-this.rate*.150;
      const firstSeparator=this.mean(this.previous.end+this.rate*.092,this.rate*.002)-this.previous.offset;
      const priorSync=this.mean(priorEnd-this.rate*.005,this.rate*.002)-this.previous.offset;
      if(firstSeparator>.65&&priorEnd>0&&Math.abs(priorSync+1.75)<.2)this.decodeLine({end:priorEnd,offset:this.previous.offset});
      this.finishPending();this.pending=candidate;}this.previous=candidate;}
    else if((candidate.end-this.lastSync)/this.rate>.12){const gap=(candidate.end-this.lastSync)/this.rate;if(gap>.22){this.dropped+=Math.max(1,Math.round(gap/.15)-1);this.even=null;}this.finishPending();this.lastSync=candidate.end;this.pending=candidate;}
   }
   if(this.locked&&this.pending&&this.position-this.pending.end>=this.rate*.143)this.finishPending();
   if(this.locked&&!this.done&&this.position-this.lastSync>this.rate*1.2){this.locked=false;this.blocked=true;this.pending=null;this.previous=null;this.onUpdate({type:'lost',rows:this.rows,dropped:this.dropped});}
  }
 }
 finishPending(){if(!this.pending||this.position-this.pending.end<this.rate*.141)return;const line=this.pending;this.pending=null;this.decodeLine(line);}
 decodeLine({end,offset}){
  if(this.done)return;
  const separator=this.mean(end+this.rate*.092,this.rate*.002)-offset;const isEven=separator<0;
  if(Math.abs(separator)<.65||Math.abs(separator)>1.35)return;
  const y=new Float32Array(320),c=new Float32Array(320);
  for(let x=0;x<320;x++){y[x]=this.level(end+this.rate*(.003+(x+.5)*.088/320),offset);c[x]=this.level(end+this.rate*(.097+(x+.5)*.044/320),offset);}
  if(isEven){this.even={y,c};return;}
  if(!this.even)return;
  for(let row=0;row<2;row++)for(let x=0;x<320;x++){const Y=row?y[x]:this.even.y[x],cb=c[x]-128,cr=this.even.c[x]-128,p=((this.rows+row)*320+x)*4;this.pixels[p]=Y+1.402*cr;this.pixels[p+1]=Y-.344136*cb-.714136*cr;this.pixels[p+2]=Y+1.772*cb;this.pixels[p+3]=255;}
  this.rows=Math.min(240,this.rows+2);this.even=null;this.done=this.rows===240;this.onUpdate({type:this.done?'complete':'image',rows:this.rows,pixels:this.pixels,dropped:this.dropped});
 }
 level(pos,offset){return Math.max(0,Math.min(255,(this.mean(pos-1,3)-offset+1)*127.5));}
}
