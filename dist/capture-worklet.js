class CaptureProcessor extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(1024);this.offset=0;}
 process(inputs,outputs){const input=inputs[0]?.[0];const length=input?.length??outputs[0]?.[0]?.length??128;for(let i=0;i<length;i++){this.buffer[this.offset++]=input?.[i]??0;if(this.offset===this.buffer.length){const full=this.buffer;this.port.postMessage({samples:full},[full.buffer]);this.buffer=new Float32Array(1024);this.offset=0;}}return true;}
}
registerProcessor('sstv-capture',CaptureProcessor);
