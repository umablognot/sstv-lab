class CaptureProcessor extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(1024);this.offset=0;}
 process(inputs){const input=inputs[0]?.[0];if(input){let energy=0,peak=0;for(const v of input){energy+=v*v;peak=Math.max(peak,Math.abs(v));this.buffer[this.offset++]=v;if(this.offset===this.buffer.length){const full=this.buffer;this.port.postMessage({samples:full},[full.buffer]);this.buffer=new Float32Array(1024);this.offset=0;}}}return true;}
}
registerProcessor('sstv-capture',CaptureProcessor);
