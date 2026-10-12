import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../web');
function pages(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?pages(path.join(dir,entry.name)):entry.name==='index.html'?[path.join(dir,entry.name)]:[]);}
test('every independent application page loads shared contact, including anonymous and device pages',()=>{
 for(const file of pages(root).filter(file=>!file.includes('/settings/tools/')))assert.match(fs.readFileSync(file,'utf8'),/contact-modal\.js\?v=/,file);
 const source=fs.readFileSync(path.join(root,'shared/js/core/contact-modal.js'),'utf8');
 assert.match(source,/ensureContactEntryPoint/);assert.match(source,/contact-footer-entry--floating/);
 assert.match(source,/document\.querySelector\('\[data-contact-modal\], \.btn-contact-footer'\)/);
 const mail=fs.readFileSync(path.join(root,'mail/index.html'),'utf8');assert.match(mail,/<footer[^>]*>[\s\S]*data-contact-modal/);
});
