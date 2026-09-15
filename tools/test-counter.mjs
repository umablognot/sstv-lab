import assert from 'node:assert/strict';
import {test} from 'node:test';

let iteration = 0;
async function fixture({origin='https://altunsumerve.github.io', pathname='/sstv-lab/', stored=false, reply} = {}) {
 const elements = Object.fromEntries(['stats','statVisitors','statAttempts'].map(id => [id,{hidden:true,textContent:'—'}]));
 const requests = [], storage = new Map(stored ? [['sstv-lab-visitor','1']] : []);
 globalThis.location = {origin, pathname};
 globalThis.document = {getElementById:id => elements[id]};
 globalThis.localStorage = {getItem:key => storage.get(key), setItem:(key,value) => storage.set(key,value)};
 globalThis.fetch = async (url, options) => {
  requests.push({url,options});
  return reply ? reply(url) : {ok:true,status:200,json:async () => ({value:'12'})};
 };
 const api = await import(`../dist/counter.js?case=${iteration++}`);
 return {api,elements,requests,storage};
}

await test('accepts API string values, counts first visit once, omits cookies and referrer', async () => {
 const f = await fixture();
 await Promise.all([f.api.initStats(),f.api.initStats()]);
 assert.equal(f.requests.length,2);
 assert.equal(f.elements.statVisitors.textContent,'12');
 assert.equal(f.elements.stats.hidden,false);
 assert.equal(f.storage.get('sstv-lab-visitor'),'1');
 assert.ok(f.requests[0].url.includes('/hit/'));
 assert.equal(f.requests[0].options.credentials,'omit');
 assert.equal(f.requests[0].options.referrerPolicy,'no-referrer');
 await f.api.countReceiveAttempt();
 assert.ok(f.requests[2].url.endsWith('/hit/sstvlab_altunsumerve_receive_attempts'));
});

await test('returning browser only reads counts', async () => {
 const f = await fixture({stored:true});
 await f.api.initStats();
 assert.ok(f.requests.every(r => r.url.includes('/get/')));
});

await test('missing read counter is zero, but a failed increment is not a successful visit', async () => {
 const f = await fixture({reply:async () => ({ok:false,status:404})});
 await f.api.initStats();
 assert.equal(f.storage.size,0);
 assert.equal(f.elements.statAttempts.textContent,'0');
 assert.equal(f.elements.statVisitors.textContent,'—');
});

await test('visitor is remembered even when the independent attempt request fails', async () => {
 const f = await fixture({reply:async url => {
  if (url.includes('_receive_attempts')) throw Error('offline');
  return {ok:true,status:200,json:async () => ({value:9})};
 }});
 await f.api.initStats();
 assert.equal(f.storage.size,1);
 assert.equal(f.elements.stats.hidden,false);
 assert.equal(f.elements.statVisitors.textContent,'9');
});

await test('offline or malformed results do not display fake counts or break the app', async () => {
 for (const value of [null,'',-1,'NaN','12oops',Infinity,Number.MAX_SAFE_INTEGER+1]) {
  const f = await fixture({reply:async () => ({ok:true,status:200,json:async () => ({value})})});
  await f.api.initStats();
  await f.api.countReceiveAttempt();
  assert.equal(f.elements.stats.hidden,true);
  assert.equal(f.storage.size,0);
 }
 const f = await fixture({reply:async () => {throw Error('offline');}});
 await f.api.initStats();
 await f.api.countReceiveAttempt();
 assert.equal(f.elements.stats.hidden,true);
});

await test('local preview, temporary HTTPS tunnel and forks never increment production counters', async () => {
 for (const origin of ['http://127.0.0.1:5188','http://192.168.1.115:5188','https://demo.trycloudflare.com','https://someone.github.io']) {
  const f = await fixture({origin});
  await f.api.initStats();
  await f.api.countReceiveAttempt();
  assert.equal(f.requests.length,0);
 }
 const f = await fixture({pathname:'/another-project/'});
 await f.api.initStats();
 assert.equal(f.requests.length,0);
});

await test('storage restrictions do not prevent displaying counts', async () => {
 const f = await fixture();
 globalThis.localStorage = {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 await f.api.initStats();
 assert.equal(f.elements.stats.hidden,false);
});
