import { encodeRobot36, makeWav, RATE } from './encoder.js';
import { initStats, countReceiveAttempt } from './counter.js';
import i18n, { t, init as initI18n, setLanguage, getLanguage, onChange } from './i18n.js';
import { QrSender, QrReceiver, renderReceivedPhoto } from './features/qr-transfer.js';
import { BtSession, pickAudioOutput, routeContextTo, btSupported, audioOutputSupported } from './features/bluetooth.js';
import { nfcSupported, writeInvite, readInvite, applyInviteRole } from './features/nfc.js';
import { ToneTester } from './features/audioio.js';

const $ = id => document.getElementById(id);
const receiverCanvas = $('receiveCanvas'), senderCanvas = $('sendCanvas');
let stream = null, rxContext = null, worker = null, capture = null, rxSource = null, wakeLock = null, requestId = 0, listening = false, rows = 0, receivedComplete = false;
let selected = false, encoded = null, txContext = null, txSource = null, txGain = null, txFrame = 0, txStarted = 0, txDuration = 0, loading = false, photoRequest = 0;

function showMessage(text) { $('message').textContent = text; $('message').hidden = !text; }

function setTab(send, devices = false) {
  stopListening(); stopPlayback();
  $('receivePanel').hidden = send || devices;
  $('sendPanel').hidden = !send || devices;
  $('devicesPanel').hidden = !devices;
  $('receiveTab').classList.toggle('active', !send && !devices);
  $('sendTab').classList.toggle('active', send && !devices);
  $('devicesTab').classList.toggle('active', devices);
  $('receiveTab').setAttribute('aria-pressed', String(!send && !devices));
  $('sendTab').setAttribute('aria-pressed', String(send && !devices));
  $('devicesTab').setAttribute('aria-pressed', String(devices));
  showMessage('');
}
$('receiveTab').onclick = () => setTab(false);
$('sendTab').onclick = () => setTab(true);
$('devicesTab').onclick = () => setTab(false, true);

// --- receiver ----------------------------------------------------------------
function clearImage() {
  rows = 0; receivedComplete = false;
  receiverCanvas.getContext('2d').clearRect(0, 0, 320, 240);
  $('emptyState').hidden = false;
  $('progressFill').style.width = '0%';
  $('lineLabel').textContent = t('rx.lines', { rows: 0 });
  $('percentLabel').textContent = t('rx.percent', { percent: 0 });
  $('scanline').hidden = true;
  $('saveButton').disabled = true;
}
function resetImage() {
  clearImage();
  if (worker && rxContext) worker.postMessage({ type: 'init', rate: rxContext.sampleRate });
  $('receiveStatus').textContent = listening ? t('rx.status.waiting') : t('rx.status.ready');
}
function releaseWake() { wakeLock?.release().catch(() => {}); wakeLock = null; }
async function acquireWake() {
  try { if (navigator.wakeLock && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function stopListening(complete = false) {
  requestId++; listening = false;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  capture?.disconnect(); capture = null;
  rxSource?.disconnect(); rxSource = null;
  worker?.terminate(); worker = null;
  rxContext?.close().catch(() => {}); rxContext = null;
  releaseWake();
  $('listenButton').disabled = false;
  $('listenButton').textContent = t('rx.button.start');
  $('listenButton').classList.remove('recording');
  $('levelMeter').value = 0;
  $('levelLabel').textContent = t('rx.level.off');
  $('signalHint').textContent = t('rx.hint.off');
  $('scanline').hidden = true;
  if (!complete) $('receiveStatus').textContent = rows ? t('rx.status.stopped') : t('rx.status.ready');
}
function onDecoded(event) {
  const d = event.data;
  if (d.type === 'error') { stopListening(); showMessage(t('rx.error.decode')); return; }
  if (d.type === 'start') { clearImage(); $('receiveStatus').textContent = t('rx.status.found'); return; }
  if (d.type === 'lost') {
    $('receiveStatus').textContent = t('rx.status.lost');
    $('receiveHint').textContent = t('rx.hint.lost'); return;
  }
  if (!d.pixels) return;
  rows = d.rows;
  receiverCanvas.getContext('2d').putImageData(new ImageData(d.pixels, 320, 240), 0, 0);
  $('emptyState').hidden = true; $('saveButton').disabled = false;
  const progress = rows / 240 * 100;
  $('progressFill').style.width = progress + '%';
  $('percentLabel').textContent = t('rx.percent', { percent: Math.round(progress) });
  $('lineLabel').textContent = t('rx.lines', { rows });
  $('scanline').hidden = false; $('scanline').style.top = progress + '%';
  $('receiveStatus').textContent = t('rx.status.building');
  $('receiveHint').textContent = t('rx.hint.building');
  if (d.type === 'incomplete') {
    stopListening(true);
    $('receiveStatus').textContent = t('rx.status.incomplete');
    $('receiveHint').textContent = t('rx.hint.incomplete');
  }
  if (d.type === 'complete') {
    receivedComplete = true; stopListening(true);
    $('receiveStatus').textContent = t('rx.status.done');
    $('receiveHint').textContent = t('rx.hint.done');
  }
}
async function startListening() {
  if (listening) { stopListening(); return; }
  stopPlayback(); showMessage('');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showMessage(t('rx.error.secure')); return;
  }
  const id = ++requestId;
  $('listenButton').disabled = true;
  $('listenButton').textContent = t('rx.button.permission');
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('unsupported');
    const context = new Audio(); rxContext = context;
    await context.resume();
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false
    });
    if (id !== requestId) { mic.getTracks().forEach(track => track.stop()); await context.close().catch(() => {}); return; }
    stream = mic;
    await context.resume();
    if (id !== requestId) return;
    worker = new Worker(new URL('./decode-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onDecoded;
    worker.onerror = () => { stopListening(); showMessage(t('rx.error.worker')); };
    worker.postMessage({ type: 'init', rate: context.sampleRate });
    const sendSamples = samples => {
      if (!listening) return;
      let sum = 0, peak = 0;
      for (const n of samples) { sum += n * n; peak = Math.max(peak, Math.abs(n)); }
      const rms = Math.sqrt(sum / samples.length);
      $('levelMeter').value = Math.min(1, rms * 4);
      $('levelLabel').textContent = rms > .00001 ? Math.round(20 * Math.log10(rms)) + ' dBFS' : t('rx.level.silent');
      $('signalHint').textContent = peak > .98 ? t('rx.signal.loud')
        : rms < .002 ? t('rx.signal.quiet')
        : rows ? t('rx.signal.receiving') : t('rx.signal.open');
      worker?.postMessage({ type: 'samples', samples }, [samples.buffer]);
    };
    rxSource = context.createMediaStreamSource(mic);
    if (context.audioWorklet) {
      await context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      if (id !== requestId) return;
      capture = new AudioWorkletNode(context, 'sstv-capture');
      capture.port.onmessage = e => sendSamples(e.data.samples);
    } else if (context.createScriptProcessor) {
      capture = context.createScriptProcessor(1024, 1, 1);
      capture.onaudioprocess = e => { e.outputBuffer.getChannelData(0).fill(0); sendSamples(e.inputBuffer.getChannelData(0).slice()); };
    } else throw new Error('unsupported');
    if (id !== requestId) return;
    clearImage(); listening = true;
    rxSource.connect(capture); capture.connect(context.destination);
    countReceiveAttempt();
    $('listenButton').disabled = false;
    $('listenButton').textContent = t('rx.button.stop');
    $('listenButton').classList.add('recording');
    $('receiveStatus').textContent = t('rx.status.waiting');
    $('receiveHint').textContent = t('rx.hint.ready');
    await acquireWake();
  } catch (error) {
    if (id !== requestId) return;
    stopListening();
    const messages = {
      NotAllowedError: t('rx.error.notallowed'),
      NotFoundError: t('rx.error.notfound'),
      NotReadableError: t('rx.error.notreadable')
    };
    showMessage(messages[error.name] || t('rx.error.generic'));
  }
}
$('listenButton').onclick = startListening;
$('resetButton').onclick = resetImage;
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$('saveButton').onclick = () => receiverCanvas.toBlob(blob => { if (blob) download(blob, 'ses-fotograf.png'); }, 'image/png');

// --- sender --------------------------------------------------------------------
function selectReady(name) {
  selected = true; encoded = null;
  $('sendEmpty').hidden = true;
  $('fileLabel').textContent = name;
  $('playButton').disabled = false;
  $('wavButton').disabled = false;
  $('sendStatus').textContent = t('tx.status.ready');
  $('sendProgress').style.width = '0%';
  $('sendTime').textContent = '00:00';
}
async function loadPhotoFile(file, input) {
  if (!file) return;
  const id = ++photoRequest;
  stopPlayback(); showMessage('');
  if (file.size > 25 * 1024 * 1024) { showMessage(t('tx.error.size')); return; }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    if (id !== photoRequest) return;
    const c = senderCanvas.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, 320, 240);
    const scale = Math.min(320 / img.naturalWidth, 240 / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    c.drawImage(img, (320 - w) / 2, (240 - h) / 2, w, h);
    selectReady(file.name);
  } catch { showMessage(t('tx.error.open')); }
  finally { URL.revokeObjectURL(url); if (input) input.value = ''; }
}
$('photoInput').onchange = e => loadPhotoFile(e.target.files?.[0], e.target);
$('cameraInput').onchange = e => loadPhotoFile(e.target.files?.[0], e.target);
function selectSample() {
  photoRequest++; stopPlayback();
  const c = senderCanvas.getContext('2d');
  const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
  colors.forEach((color, i) => { c.fillStyle = color; c.fillRect(i * 40, 0, 40, 160); });
  for (let x = 0; x < 320; x++) {
    c.fillStyle = `rgb(${x / 319 * 255},${x / 319 * 255},${x / 319 * 255})`;
    c.fillRect(x, 160, 1, 80);
  }
  c.fillStyle = '#101412'; c.fillRect(38, 88, 244, 57);
  c.fillStyle = '#ffffff'; c.font = 'bold 28px Arial'; c.textAlign = 'center';
  c.fillText('MERHABA!', 160, 125);
  selectReady(t('tx.sample.name'));
}
$('sampleButton').onclick = selectSample;
// drag & drop + clipboard paste land in the send panel
const dropZone = $('sendPanel');
['dragover', 'dragenter'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone.addEventListener('drop', e => loadPhotoFile(e.dataTransfer?.files?.[0]));
window.addEventListener('paste', e => {
  const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
  if (item) { const file = item.getAsFile(); if (file) { setTab(true); loadPhotoFile(file); } }
});
function getEncoded() {
  if (!selected) throw Error(t('tx.error.encode'));
  if (!encoded) encoded = encodeRobot36(senderCanvas.getContext('2d').getImageData(0, 0, 320, 240).data);
  return encoded;
}
function stopPlayback() {
  cancelAnimationFrame(txFrame); txFrame = 0;
  if (txSource) {
    txSource.onended = null;
    try { txSource.stop(); } catch {}
    txSource.disconnect(); txSource = null;
  }
  txContext?.close().catch(() => {}); txContext = null; txGain = null;
  releaseWake();
  $('playButton').textContent = t('tx.button.play');
  $('playButton').classList.remove('recording');
  if (selected) $('sendStatus').textContent = t('tx.status.resend');
}
function updateSendProgress() {
  if (!txContext) return;
  const elapsed = Math.min(txDuration, txContext.currentTime - txStarted);
  $('sendProgress').style.width = elapsed / txDuration * 100 + '%';
  $('sendTime').textContent = '00:' + String(Math.floor(elapsed)).padStart(2, '0') + ' / 00:' + Math.ceil(txDuration);
  txFrame = requestAnimationFrame(updateSendProgress);
}
async function play() {
  if (txSource) { stopPlayback(); return; }
  if (!selected || loading) return;
  stopListening(); showMessage('');
  try {
    loading = true; $('playButton').disabled = true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    txContext = new Audio();
    try { await routeContextTo(txContext, chosenOutputId); } catch {}
    await txContext.resume();
    const data = getEncoded();
    const buffer = txContext.createBuffer(1, data.length, RATE);
    buffer.copyToChannel(data, 0);
    txSource = txContext.createBufferSource(); txSource.buffer = buffer;
    txGain = txContext.createGain(); txGain.gain.value = Number($('volume').value) / 100;
    txSource.connect(txGain); txGain.connect(txContext.destination);
    txDuration = data.length / RATE; txStarted = txContext.currentTime;
    txSource.onended = () => { stopPlayback(); $('sendProgress').style.width = '100%'; $('sendStatus').textContent = t('tx.status.done'); };
    txSource.start();
    $('playButton').textContent = t('tx.button.stop');
    $('playButton').classList.add('recording');
    $('sendStatus').textContent = t('tx.status.sending');
    updateSendProgress();
    await acquireWake();
  } catch {
    stopPlayback(); showMessage(t('tx.error.play'));
  } finally { loading = false; $('playButton').disabled = !selected; }
}
$('playButton').onclick = play;
$('wavButton').onclick = () => {
  try {
    download(new Blob([makeWav(getEncoded())], { type: 'audio/wav' }), 'fotograf-robot36-16khz.wav');
    $('sendStatus').textContent = t('tx.status.wav');
  } catch (e) { showMessage(e.message); }
};
$('volume').oninput = () => {
  $('volumeLabel').textContent = '%' + $('volume').value;
  if (txGain) txGain.gain.value = Number($('volume').value) / 100;
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (listening || txSource)) {
    stopListening(); stopPlayback();
    showMessage(t('tx.bg.hidden'));
  }
});
window.addEventListener('pagehide', () => { stopListening(); stopPlayback(); });

// --- channels: QR ---------------------------------------------------------------
const qrSender = new QrSender($('qrCanvas'));
let qrReceiver = null;
async function pngBytesFromCanvas(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? blob.arrayBuffer().then(b => resolve(new Uint8Array(b)), reject) : reject(new Error('blob')),
    'image/png'));
}
$('qrSendButton').onclick = async () => {
  qrSender.stop(); $('qrStopButton').disabled = true;
  if (!selected) { $('qrSendStatus').textContent = t('dv.qr.needPhoto'); return; }
  try {
    $('qrSendStatus').textContent = t('dv.qr.generating');
    const bytes = await pngBytesFromCanvas(senderCanvas);
    if (bytes.length > 1024 * 1024) { $('qrSendStatus').textContent = t('dv.qr.tooBig'); return; }
    const total = await qrSender.loadPayload(bytes, { chunkSize: 250 });
    qrSender.start({
      intervalMs: Number($('qrSpeed').value),
      onFrame: (index, frames) => { $('qrSendStatus').textContent = t('dv.qr.frameOf', { index, frames }); },
      onDone: () => {}
    });
    $('qrStopButton').disabled = false;
    $('qrSendStatus').textContent = t('dv.qr.frameOf', { index: 1, frames: total });
  } catch { $('qrSendStatus').textContent = t('dv.qr.generating'); }
};
$('qrStopButton').onclick = () => { qrSender.stop(); $('qrStopButton').disabled = true; };
$('qrReceiveButton').onclick = async () => {
  if (qrReceiver?.running) { qrReceiver.stop(); $('qrReceiveButton').textContent = t('dv.qr.receive'); return; }
  qrReceiver ??= new QrReceiver($('qrVideo'), {
    onProgress: (got, total) => {
      $('qrReceiveStatus').textContent = t('dv.qr.progress', { got, total });
      $('qrProgress').style.width = (got / total * 100) + '%';
    },
    onDone: async bytes => {
      $('qrReceiveButton').textContent = t('dv.qr.receive');
      $('qrVideo').classList.add('hidden');
      $('qrReceiveCanvas').classList.remove('hidden');
      await renderReceivedPhoto($('qrReceiveCanvas'), bytes);
      $('qrSaveButton').classList.remove('hidden');
      $('qrReceiveStatus').textContent = t('dv.qr.done');
      $('qrProgress').style.width = '100%';
    },
    onError: () => { $('qrReceiveStatus').textContent = t('dv.qr.noCamera'); }
  });
  if (!qrReceiver.supported) { $('qrReceiveStatus').textContent = t('dv.qr.unsupported'); return; }
  try {
    $('qrReceiveCanvas').classList.add('hidden');
    $('qrVideo').classList.remove('hidden');
    $('qrReceiveStatus').textContent = t('dv.qr.hint');
    await qrReceiver.start();
    $('qrReceiveButton').textContent = t('dv.qr.receiveStop');
  } catch {
    $('qrReceiveStatus').textContent = t('dv.qr.noCamera');
  }
};
$('qrSaveButton').onclick = () => $('qrReceiveCanvas').toBlob(blob => { if (blob) download(blob, 'qr-fotograf.png'); }, 'image/png');

// --- channels: Bluetooth ----------------------------------------------------------
let chosenOutputId = null;
const btSession = new BtSession();
$('btAudioButton').onclick = async () => {
  if (!audioOutputSupported) { $('btAudioStatus').textContent = t('dv.bt.audioFail'); return; }
  try {
    const device = await pickAudioOutput();
    chosenOutputId = device.id;
    $('btAudioStatus').textContent = t('dv.bt.audioOk', { name: device.name || 'Bluetooth' });
  } catch { $('btAudioStatus').textContent = t('dv.bt.audioFail'); }
};
$('btSendButton').onclick = async () => {
  if (!btSupported) { $('btStatus').textContent = t('dv.bt.unsupported'); return; }
  if (!selected) { $('btStatus').textContent = t('dv.qr.needPhoto'); return; }
  try {
    $('btStatus').textContent = t('dv.bt.connecting');
    await btSession.connect();
    $('btDisconnectButton').classList.remove('hidden');
    $('btStatus').textContent = t('dv.bt.connected', { name: btSession.device.name || 'Bluetooth' });
    const bytes = await pngBytesFromCanvas(senderCanvas);
    await btSession.sendPhoto(bytes, {
      onProgress: p => { $('btProgress').style.width = (p * 100) + '%'; $('btStatus').textContent = t('dv.bt.progress', { percent: Math.round(p * 100) }); }
    });
    $('btProgress').style.width = '100%';
    $('btStatus').textContent = t('dv.bt.done');
  } catch (e) {
    $('btStatus').textContent = e?.name === 'NotFoundError' ? t('dv.bt.failed') : t('dv.bt.failed');
  }
};
$('btReceiveButton').onclick = async () => {
  if (!btSupported) { $('btStatus').textContent = t('dv.bt.unsupported'); return; }
  try {
    $('btStatus').textContent = t('dv.bt.connecting');
    await btSession.connect({ forReceiving: true });
    $('btDisconnectButton').classList.remove('hidden');
    $('btStatus').textContent = t('dv.bt.connected', { name: btSession.device.name || 'Bluetooth' });
    await btSession.receivePhoto({
      onProgress: p => { $('btProgress').style.width = (p * 100) + '%'; },
      onDone: async bytes => {
        $('qrReceiveCanvas').classList.remove('hidden');
        await renderReceivedPhoto($('qrReceiveCanvas'), bytes);
        $('qrSaveButton').classList.remove('hidden');
        $('btProgress').style.width = '100%';
        $('btStatus').textContent = t('dv.bt.received');
      }
    });
    $('btStatus').textContent = t('dv.bt.listening');
  } catch { $('btStatus').textContent = t('dv.bt.failed'); }
};
$('btDisconnectButton').onclick = () => {
  btSession.disconnect();
  $('btDisconnectButton').classList.add('hidden');
  $('btStatus').textContent = t('dv.bt.disconnected');
};

// --- channels: NFC ------------------------------------------------------------------
$('nfcWriteButton').onclick = async () => {
  if (!nfcSupported) { $('nfcStatus').textContent = t('dv.nfc.unsupported'); return; }
  try {
    await writeInvite('rx', {
      onStatus: status => { if (status === 'wait') $('nfcStatus').textContent = t('dv.nfc.ready'); }
    });
    $('nfcStatus').textContent = t('dv.nfc.written');
  } catch { $('nfcStatus').textContent = t('dv.nfc.failed'); }
};
$('nfcReadButton').onclick = async () => {
  if (!nfcSupported) { $('nfcStatus').textContent = t('dv.nfc.unsupported'); return; }
  try {
    await readInvite({
      onInvite: invite => {
        $('nfcStatus').textContent = t('dv.nfc.readOk', { role: t(invite.role === 'rx' ? 'dv.nfc.role.rx' : 'dv.nfc.role.tx') });
        applyInviteRole(invite.role);
      },
      onStatus: status => {
        if (status === 'wait' || status === 'listening') $('nfcStatus').textContent = t('dv.nfc.ready');
        if (status === 'no-invite') $('nfcStatus').textContent = t('dv.nfc.failed');
        if (status === 'error') $('nfcStatus').textContent = t('dv.nfc.failed');
      }
    });
  } catch { $('nfcStatus').textContent = t('dv.nfc.failed'); }
};
window.addEventListener('sstv-invite', e => {
  const role = e.detail?.role;
  if (role === 'tx') setTab(true); else if (role === 'rx') setTab(false);
  showMessage(t('dv.nfc.readOk', { role: t(role === 'tx' ? 'dv.nfc.role.tx' : 'dv.nfc.role.rx') }));
});

// --- channels: tone test -------------------------------------------------------------
const toneTester = new ToneTester();
$('toneButton').onclick = async () => {
  if (toneTester.active) { toneTester.stop(); $('toneButton').textContent = t('dv.sound.play'); $('toneStatus').textContent = t('dv.sound.done'); return; }
  try {
    toneTester.setOutput(chosenOutputId);
    $('toneButton').textContent = t('dv.sound.stop');
    await toneTester.play({
      onTone: freq => { $('toneStatus').textContent = t('dv.sound.playing'); },
      onDone: () => { $('toneButton').textContent = t('dv.sound.play'); $('toneStatus').textContent = t('dv.sound.done'); }
    });
  } catch {
    $('toneButton').textContent = t('dv.sound.play');
    $('toneStatus').textContent = t('tx.error.play');
  }
};

// --- PWA: service worker, online badge, install ----------------------------------------
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
const netStatus = $('netStatus'), netLabel = $('netLabel');
function updateNet() {
  netStatus.hidden = false;
  const online = navigator.onLine;
  netStatus.classList.toggle('offline', !online);
  netLabel.textContent = t(online ? 'status.online' : 'status.offline');
}
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
let installEvent = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installEvent = event;
  $('installButton').hidden = false;
});
$('installButton').onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const choice = await installEvent.userChoice;
  if (choice?.outcome === 'accepted') $('installButton').hidden = true;
  installEvent = null;
};
window.addEventListener('appinstalled', () => { $('installButton').hidden = true; });

// --- keyboard shortcuts ------------------------------------------------------------------
window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) return;
  if (event.key === '1') setTab(false);
  else if (event.key === '2') setTab(true);
  else if (event.key === '3') setTab(false, true);
  else if (event.key === 'l' || event.key === 'L') { if (!$('receivePanel').hidden) startListening(); }
  else if (event.key === ' ') { if (!$('sendPanel').hidden && selected) { event.preventDefault(); play(); } }
});

// --- i18n boot ---------------------------------------------------------------------------
function populateLanguages() {
  const select = $('langSelect');
  select.value = getLanguage();
  select.onchange = () => setLanguage(select.value);
}
onChange(() => {
  populateLanguages();
  if (!navigator.onLine) updateNet(); else updateNet();
  if (listening) $('listenButton').textContent = t('rx.button.stop');
  if (txSource) $('playButton').textContent = t('tx.button.stop');
});

// --- routing: ?role= & ?lang= & #gonder / #cihazlar -----------------------------------------
function applyRouting() {
  const params = new URLSearchParams(location.search);
  const role = params.get('role');
  if (role === 'tx') setTab(true); else if (role === 'rx') setTab(false);
  if (location.hash === '#gonder') setTab(true);
  if (location.hash === '#cihazlar') setTab(false, true);
}

(async () => {
  const params = new URLSearchParams(location.search);
  const forcedLang = params.get('lang');
  if (forcedLang) await setLanguage(forcedLang, { persist: true });
  else await initI18n();
  populateLanguages();
  updateNet();
  applyRouting();
  initStats();
})();

// Model Context tool contract preserved (webmcp).
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const expose = tool => {
    try { Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
  };
  expose({
    name: 'get_sstv_status',
    title: 'SSTV durumunu oku',
    description: 'Alınan satır sayısını ve alıcı/gönderici durumunu okur.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute(input) {
      if (!input || Object.keys(input).length) throw Error('Parametre beklenmiyor.');
      return {
        listening, rows, complete: receivedComplete, photoSelected: selected,
        transmitting: !!txSource,
        qrSending: qrSender.active, qrReceiving: !!qrReceiver?.running,
        bluetooth: btSession.connected, language: getLanguage()
      };
    }
  });
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
window.sstvI18n = i18n;
