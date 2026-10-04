const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{
assert.ok(fs.existsSync('test-output/microphone.wav'),'Run npm test first to generate the microphone fixture.');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined,headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve('test-output/microphone.wav')+'%noloop']});
try{
const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:900}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Force Turkish so string assertions below stay deterministic.
await page.addInitScript(()=>{localStorage.setItem('sstv-lang','tr');document.modelContext={registered:[],registerTool(tool){this.registered.push(tool);}};});
await page.goto('http://127.0.0.1:5188');
await page.waitForFunction(()=>document.documentElement.dataset.i18nReady==='1');
await page.screenshot({path:'test-output/desktop.png',fullPage:true});
assert.equal(await page.locator('#listenButton').isEnabled(),true);
const status=await page.evaluate(async()=>{const t=document.modelContext.registered[0];return {name:t.name,result:await t.execute({}),invalid:await Promise.resolve().then(()=>t.execute({wrong:true})).then(()=>false,()=>true)};});assert.equal(status.name,'get_sstv_status');assert.equal(status.result.listening,false);assert.equal(status.invalid,true);
// language switch smoke check (EN catalog)
await page.selectOption('#langSelect','en');await page.waitForFunction(()=>document.documentElement.lang==='en');
assert.equal((await page.locator('#playButton').textContent()).trim(),'Play sound · Send photo');
await page.selectOption('#langSelect','tr');await page.waitForFunction(()=>document.documentElement.lang==='tr');
await page.getByRole('button',{name:'Fotoğraf gönder'}).click();await page.getByRole('button',{name:'Fotoğrafsız dene: renk kartını seç'}).click();assert.equal(await page.locator('#playButton').isEnabled(),true);
const downloadPromise=page.waitForEvent('download');await page.locator('#wavButton').click();const download=await downloadPromise;await download.saveAs('test-output/downloaded.wav');const wav=fs.readFileSync('test-output/downloaded.wav');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),16000);
await page.screenshot({path:'test-output/sender.png',fullPage:true});
await page.locator('#playButton').click();await page.waitForFunction(()=>document.querySelector('#sendTime').textContent!=='00:00');await page.locator('#playButton').click();assert.equal(await page.locator('#playButton').textContent(),'Sesi çal · Fotoğrafı gönder');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Fotoğraf al'}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-output/mobile.png',fullPage:true});
await page.locator('#listenButton').click();await page.waitForFunction(()=>document.querySelector('#receiveStatus').textContent==='Fotoğraf alındı!',{},{timeout:55000});
assert.equal(await page.locator('#lineLabel').textContent(),'240 / 240 satır');assert.equal(await page.locator('#saveButton').isEnabled(),true);await page.screenshot({path:'test-output/received.png',fullPage:true});
const rx=await page.evaluate(()=>Array.from(document.querySelector('#receiveCanvas').getContext('2d').getImageData(0,0,320,240).data));fs.writeFileSync('test-output/browser-received.rgba',Buffer.from(rx));
await page.locator('#resetButton').click();assert.equal(await page.locator('#lineLabel').textContent(),'0 / 240 satır');assert.equal(await page.locator('#saveButton').isEnabled(),false);
// devices tab smoke check: QR sender renders frames from the test card
await page.setViewportSize({width:1280,height:900});
await page.locator('#devicesTab').click();await page.getByRole('button',{name:'QR ile gönder'}).click();
await page.waitForFunction(()=>document.querySelector('#qrSendStatus').textContent.includes('kare'),{},{timeout:10000});
await page.getByRole('button',{name:'QR akışını durdur'}).click();
assert.deepEqual(errors,[]);
console.log(JSON.stringify({browser:process.env.PLAYWRIGHT_CHANNEL||'Chromium',desktop:true,mobile:true,download:true,playStop:true,microphonePipeline:'240/240 rows',webmcpContract:true,i18nSwitch:true,qrSender:true,errors}));
const deniedContext=await browser.newContext();await deniedContext.grantPermissions([]);const denied=await deniedContext.newPage();await denied.addInitScript(()=>{localStorage.setItem('sstv-lang','tr');navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});await denied.goto('http://127.0.0.1:5188');await denied.waitForFunction(()=>document.documentElement.dataset.i18nReady==='1');await denied.locator('#listenButton').click();await denied.waitForFunction(()=>!document.querySelector('#message').hidden);assert.ok((await denied.locator('#message').textContent()).includes('Mikrofon izni verilmedi'));console.log('Microphone denial: PASS');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
