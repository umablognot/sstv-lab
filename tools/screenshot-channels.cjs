const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:1280,height:900}});
await page.addInitScript(()=>localStorage.setItem('sstv-lang','tr'));
await page.goto('http://127.0.0.1:5188');
await page.waitForFunction(()=>document.documentElement.dataset.i18nReady==='1');
await page.locator('#devicesTab').click();
await page.waitForTimeout(400);
await page.screenshot({path:'test-output/devices.png',fullPage:true});
// English + RTL Arabic spot checks
await page.selectOption('#langSelect','en');
await page.waitForTimeout(300);
await page.screenshot({path:'test-output/devices-en.png',fullPage:true});
await page.selectOption('#langSelect','ar');
await page.waitForTimeout(300);
await page.screenshot({path:'test-output/devices-ar.png',fullPage:true});
// about page
await page.goto('http://127.0.0.1:5188/about.html');
await page.waitForFunction(()=>document.documentElement.dataset.i18nReady==='1');
await page.screenshot({path:'test-output/about.png',fullPage:true});
console.log('screens saved');
}finally{await browser.close();}
})();
