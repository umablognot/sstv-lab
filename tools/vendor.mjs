import fs from 'node:fs';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
const reference=path.resolve('../work/sstv-decoder-reference');
fs.mkdirSync('dist/vendor',{recursive:true});
for(const name of ['fm-demodulator','sync-detector']){
 let source=fs.readFileSync(path.join(reference,'src/lib/sstv',name+'.ts'),'utf8');
 source=source.replace(/^\s*console\.log\([^\n]*\);\r?$/gm,'');
 if(name==='sync-detector')source=source.replace('syncPulse20msSeconds + syncPulse5msSeconds','0.050').replace('    frequencyOffset,\n','    frequencyOffset,\n');
 let js=stripTypeScriptTypes(source,{mode:'transform'}).replace(/from '([^']+)'/g,(_,p)=>`from '${p}.js'`);
 fs.writeFileSync('dist/vendor/'+name+'.js','// Adapted from smolgroot/sstv-decoder (0BSD). See THIRD_PARTY.txt.\n'+js);
}
fs.writeFileSync('dist/THIRD_PARTY.txt','SSTV demodulation and sync detection adapted from smolgroot/sstv-decoder, based on xdsopl/robot36.\nhttps://github.com/smolgroot/sstv-decoder\n\n'+fs.readFileSync(path.join(reference,'LICENSE'),'utf8')+'\nChanges: TypeScript converted to JavaScript; debug console output removed; extended sync window for contiguous Robot36 VIS stop/first-line sync. Image assembly and encoder are separate implementations.\n');
