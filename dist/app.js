import {encodeRobot36,makeWav,RATE} from './encoder.js';
import {initStats,countReceiveAttempt} from './counter.js';
const $=id=>document.getElementById(id);
const receiverCanvas=$('receiveCanvas'),senderCanvas=$('sendCanvas');
let stream=null,rxContext=null,worker=null,capture=null,rxSource=null,wakeLock=null,requestId=0,listening=false,rows=0,receivedComplete=false;
let selected=false,encoded=null,txContext=null,txSource=null,txGain=null,txFrame=0,txStarted=0,txDuration=0,loading=false,photoRequest=0;
function showMessage(text){$('message').textContent=text;$('message').hidden=!text;}
function setTab(send){stopListening();stopPlayback();$('receivePanel').hidden=send;$('sendPanel').hidden=!send;$('receiveTab').classList.toggle('active',!send);$('sendTab').classList.toggle('active',send);$('receiveTab').setAttribute('aria-pressed',String(!send));$('sendTab').setAttribute('aria-pressed',String(send));showMessage('');}
$('receiveTab').onclick=()=>setTab(false);$('sendTab').onclick=()=>setTab(true);
function clearImage(){rows=0;receivedComplete=false;receiverCanvas.getContext('2d').clearRect(0,0,320,240);$('emptyState').hidden=false;$('progressFill').style.width='0%';$('lineLabel').textContent='0 / 240 satır';$('percentLabel').textContent='%0';$('scanline').hidden=true;$('saveButton').disabled=true;}
function resetImage(){clearImage();if(worker&&rxContext)worker.postMessage({type:'init',rate:rxContext.sampleRate});$('receiveStatus').textContent=listening?'Ses bekleniyor…':'Dinlemeye hazır';}
function releaseWake(){wakeLock?.release().catch(()=>{});wakeLock=null;}
async function acquireWake(){try{if(navigator.wakeLock&&document.visibilityState==='visible')wakeLock=await navigator.wakeLock.request('screen');}catch{}}
function stopListening(complete=false){requestId++;listening=false;stream?.getTracks().forEach(t=>t.stop());stream=null;capture?.disconnect();capture=null;rxSource?.disconnect();rxSource=null;worker?.terminate();worker=null;rxContext?.close().catch(()=>{});rxContext=null;releaseWake();$('listenButton').disabled=false;$('listenButton').textContent='Mikrofonla dinlemeyi başlat';$('listenButton').classList.remove('recording');$('levelMeter').value=0;$('levelLabel').textContent='Kapalı';$('signalHint').textContent='Mikrofon kapalı. Ses kaydı yapılmıyor.';$('scanline').hidden=true;if(!complete)$('receiveStatus').textContent=rows?'Dinleme durduruldu':'Dinlemeye hazır';}
function onDecoded(event){
 const d=event.data;
 if(d.type==='error'){stopListening();showMessage('Ses çözülemedi. Dinlemeyi yeniden başlat.');return;}
 if(d.type==='start'){clearImage();$('receiveStatus').textContent='Robot36 başlangıcı bulundu';return;}
 if(d.type==='lost'){$('receiveStatus').textContent='Sinyal kesildi';$('receiveHint').textContent='Dinleme açık. Sesi baştan çal; yeni fotoğrafın başlangıcı otomatik bulunacak.';return;}
 if(!d.pixels)return;
 rows=d.rows;receiverCanvas.getContext('2d').putImageData(new ImageData(d.pixels,320,240),0,0);$('emptyState').hidden=true;$('saveButton').disabled=false;
 const progress=rows/240*100;$('progressFill').style.width=progress+'%';$('percentLabel').textContent='%'+Math.round(progress);$('lineLabel').textContent=rows+' / 240 satır';$('scanline').hidden=false;$('scanline').style.top=progress+'%';
 $('receiveStatus').textContent='Fotoğraf oluşuyor…';$('receiveHint').textContent='Sesi kesmeden sonuna kadar çal. Telefonun ekranını açık tut.';
 if(d.type==='incomplete'){stopListening(true);$('receiveStatus').textContent='Bazı satırlar alınamadı';$('receiveHint').textContent='Sinyalde kesinti oldu. Dinlemeyi yeniden başlatıp sesi baştan çal.';}
 if(d.type==='complete'){receivedComplete=true;stopListening(true);$('receiveStatus').textContent='Fotoğraf alındı!';$('receiveHint').textContent='Ses görüntüye dönüştü. Fotoğrafı PNG olarak kaydedebilirsin.';}
}
async function startListening(){
 if(listening){stopListening();return;}stopPlayback();showMessage('');
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){showMessage('Mikrofon için bu sayfayı HTTPS bağlantısından Safari veya Chrome ile aç. Yerel ağdaki http:// adresi telefonda mikrofonu açamaz.');return;}
 const id=++requestId;$('listenButton').disabled=true;$('listenButton').textContent='Mikrofon izni bekleniyor…';
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('unsupported');
  const context=new Audio();rxContext=context;await context.resume();
  const mic=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
  if(id!==requestId){mic.getTracks().forEach(t=>t.stop());await context.close().catch(()=>{});return;}stream=mic;
  await context.resume();
  if(id!==requestId)return;
  worker=new Worker(new URL('./decode-worker.js',import.meta.url),{type:'module'});worker.onmessage=onDecoded;worker.onerror=()=>{stopListening();showMessage('Ses işleyicisi açılamadı. Sayfayı yenileyip tekrar dene.');};worker.postMessage({type:'init',rate:context.sampleRate});
  const sendSamples=samples=>{if(!listening)return;let sum=0,peak=0;for(const n of samples){sum+=n*n;peak=Math.max(peak,Math.abs(n));}const rms=Math.sqrt(sum/samples.length);$('levelMeter').value=Math.min(1,rms*4);$('levelLabel').textContent=rms>.00001?Math.round(20*Math.log10(rms))+' dBFS':'Çok sessiz';$('signalHint').textContent=peak>.98?'Ses fazla yüksek. Gönderen cihazın sesini biraz azalt.':rms<.002?'Çok az ses geliyor. Telefonu hoparlöre yaklaştır.':rows?'Ses alınıyor. Aktarım devam ediyor.':'Mikrofon açık. Robot36 başlangıcı bekleniyor.';worker?.postMessage({type:'samples',samples},[samples.buffer]);};
  rxSource=context.createMediaStreamSource(mic);
  if(context.audioWorklet){await context.audioWorklet.addModule(new URL('./capture-worklet.js',import.meta.url));if(id!==requestId)return;capture=new AudioWorkletNode(context,'sstv-capture');capture.port.onmessage=e=>sendSamples(e.data.samples);}
  else if(context.createScriptProcessor){capture=context.createScriptProcessor(1024,1,1);capture.onaudioprocess=e=>{e.outputBuffer.getChannelData(0).fill(0);sendSamples(e.inputBuffer.getChannelData(0).slice());};}
  else throw new Error('unsupported');
  if(id!==requestId)return;clearImage();listening=true;rxSource.connect(capture);capture.connect(context.destination);countReceiveAttempt();$('listenButton').disabled=false;$('listenButton').textContent='Dinlemeyi durdur';$('listenButton').classList.add('recording');$('receiveStatus').textContent='Ses bekleniyor…';$('receiveHint').textContent='Hazır. Şimdi diğer cihazdan fotoğrafın sesini baştan çal.';await acquireWake();
 }catch(error){if(id!==requestId)return;stopListening();const messages={NotAllowedError:'Mikrofon izni verilmedi. Tarayıcının site ayarlarından mikrofona izin verip tekrar dene.',NotFoundError:'Mikrofon bulunamadı. Bu sayfayı mikrofonu olan telefon veya bilgisayarda aç.',NotReadableError:'Mikrofon açılamadı. Mikrofonu kullanan başka uygulamaları kapatıp tekrar dene.'};showMessage(messages[error.name]||'Mikrofon başlatılamadı. Güncel Safari veya Chrome ile tekrar dene.');}
}
$('listenButton').onclick=startListening;$('resetButton').onclick=resetImage;
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('saveButton').onclick=()=>receiverCanvas.toBlob(blob=>{if(blob)download(blob,'ses-fotograf.png');},'image/png');
function selectReady(name){selected=true;encoded=null;$('sendEmpty').hidden=true;$('fileLabel').textContent=name;$('playButton').disabled=false;$('wavButton').disabled=false;$('sendStatus').textContent='Hazır. Önce telefonda dinlemeyi başlat, sonra burada sesi çal.';$('sendProgress').style.width='0%';$('sendTime').textContent='00:00';}
$('photoInput').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;const id=++photoRequest;stopPlayback();showMessage('');if(file.size>25*1024*1024){showMessage('Lütfen 25 MB’den küçük bir fotoğraf seç.');return;}const url=URL.createObjectURL(file);try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});if(id!==photoRequest)return;const c=senderCanvas.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,320,240);const scale=Math.min(320/img.naturalWidth,240/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;c.drawImage(img,(320-w)/2,(240-h)/2,w,h);selectReady(file.name);}catch{showMessage('Bu fotoğraf açılamadı. JPG, PNG veya WebP olarak tekrar seç.');}finally{URL.revokeObjectURL(url);event.target.value='';}};
function selectSample(){photoRequest++;stopPlayback();const c=senderCanvas.getContext('2d');const colors=['#ffffff','#ffff00','#00ffff','#00ff00','#ff00ff','#ff0000','#0000ff','#000000'];colors.forEach((color,i)=>{c.fillStyle=color;c.fillRect(i*40,0,40,160);});for(let x=0;x<320;x++){c.fillStyle=`rgb(${x/319*255},${x/319*255},${x/319*255})`;c.fillRect(x,160,1,80);}c.fillStyle='#101412';c.fillRect(38,88,244,57);c.fillStyle='#ffffff';c.font='bold 28px Arial';c.textAlign='center';c.fillText('MERHABA!',160,125);selectReady('Robot36 renk kartı');}
$('sampleButton').onclick=selectSample;
function getEncoded(){if(!selected)throw Error('Önce fotoğraf seç.');if(!encoded)encoded=encodeRobot36(senderCanvas.getContext('2d').getImageData(0,0,320,240).data);return encoded;}
function stopPlayback(){cancelAnimationFrame(txFrame);txFrame=0;if(txSource){txSource.onended=null;try{txSource.stop();}catch{}txSource.disconnect();txSource=null;}txContext?.close().catch(()=>{});txContext=null;txGain=null;releaseWake();$('playButton').textContent='Sesi çal · Fotoğrafı gönder';$('playButton').classList.remove('recording');if(selected)$('sendStatus').textContent='Hazır. Fotoğrafı tekrar gönderebilirsin.';}
function updateSendProgress(){if(!txContext)return;const elapsed=Math.min(txDuration,txContext.currentTime-txStarted);$('sendProgress').style.width=elapsed/txDuration*100+'%';$('sendTime').textContent='00:'+String(Math.floor(elapsed)).padStart(2,'0')+' / 00:'+Math.ceil(txDuration);txFrame=requestAnimationFrame(updateSendProgress);}
async function play(){if(txSource){stopPlayback();return;}if(!selected||loading)return;stopListening();showMessage('');try{loading=true;$('playButton').disabled=true;const Audio=window.AudioContext||window.webkitAudioContext;txContext=new Audio();await txContext.resume();const data=getEncoded();const buffer=txContext.createBuffer(1,data.length,RATE);buffer.copyToChannel(data,0);txSource=txContext.createBufferSource();txSource.buffer=buffer;txGain=txContext.createGain();txGain.gain.value=Number($('volume').value)/100;txSource.connect(txGain);txGain.connect(txContext.destination);txDuration=data.length/RATE;txStarted=txContext.currentTime;txSource.onended=()=>{stopPlayback();$('sendProgress').style.width='100%';$('sendStatus').textContent='Ses tamamlandı. Fotoğrafın alındığını telefondan kontrol et.';};txSource.start();$('playButton').textContent='Göndermeyi durdur';$('playButton').classList.add('recording');$('sendStatus').textContent='Fotoğraf ses olarak gönderiliyor. Arka planda başka ses çalma.';updateSendProgress();await acquireWake();}catch{stopPlayback();showMessage('Ses çalınamadı. Sayfayı Safari veya Chrome’da açıp tekrar dene.');}finally{loading=false;$('playButton').disabled=!selected;}}
$('playButton').onclick=play;$('wavButton').onclick=()=>{try{download(new Blob([makeWav(getEncoded())],{type:'audio/wav'}),'fotograf-robot36-16khz.wav');$('sendStatus').textContent='WAV hazır: 16 kHz · mono · 16 bit PCM.';}catch(e){showMessage(e.message);}};
$('volume').oninput=()=>{$('volumeLabel').textContent='%'+$('volume').value;if(txGain)txGain.gain.value=Number($('volume').value)/100;};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(listening||txSource)){stopListening();stopPlayback();showMessage('Sayfa arka plana geçtiği için aktarım durduruldu. Ekranı açık tutarak yeniden başlat.');}});
window.addEventListener('pagehide',()=>{stopListening();stopPlayback();});
if(location.hash==='#gonder')setTab(true);
initStats();
const modelContext=document.modelContext;
if(modelContext?.registerTool){const lifecycle=new AbortController();const expose=tool=>{try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};expose({name:'get_sstv_status',title:'SSTV durumunu oku',description:'Alınan satır sayısını ve alıcı/gönderici durumunu okur.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||Object.keys(input).length)throw Error('Parametre beklenmiyor.');return{listening,rows,complete:receivedComplete,photoSelected:selected,transmitting:!!txSource};}});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
