import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json; charset=utf-8','.wav':'audio/wav','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.mo':'application/octet-stream','.po':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8'};
http.createServer((req,res)=>{const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,body)=>{res.writeHead(error?404:200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(error?'Not found':body);});}).listen(5188,'0.0.0.0',()=>{
  console.log('Local: http://127.0.0.1:5188');
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) {
        console.log(`Network: http://${address.address}:5188`);
      }
    }
  }
  console.log('Phone microphone requires trusted HTTPS; LAN HTTP only supports page preview and sending audio.');
});
