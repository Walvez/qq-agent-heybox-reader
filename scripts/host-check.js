// Run in a separate process with QQ_AGENT_DATA_DIR pointing to an empty temporary directory.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
if(!process.env.QQ_AGENT_DATA_DIR)throw Error('Set isolated QQ_AGENT_DATA_DIR first');
const host=path.resolve(process.argv[2]);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'heybox-host-'));
try{
 fs.mkdirSync(path.join(root,'skills'));fs.mkdirSync(path.join(root,'plugins'));
 fs.cpSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),path.join(root,'skills','heybox-reader'),{recursive:true,filter:p=>!p.includes('/.git')});
 const jingyu=fs.existsSync(path.join(host,'refactor/modules/extensions/plugin-loader.js'));
 const loader=await import(pathToFileURL(path.join(host,jingyu?'refactor/modules/extensions/plugin-loader.js':'src/plugin-loader.js')));
 const registry=await import(pathToFileURL(path.join(host,jingyu?'refactor/modules/act/index.js':'src/tool-registry.js')));
 const res=await loader.loadPlugins({roots:{skills:path.join(root,'skills'),plugins:path.join(root,'plugins')},log:()=>{}});
 assert.equal(res.failed.length,0,JSON.stringify(res.failed));
 const tool=registry.listTools({includeUnauthorized:true}).find(t=>(t.id||t.name)==='heybox-reader__read');assert.ok(tool);
 const bad=await tool.execute({visionEnabled:true},{url:'https://evil.test'});assert.equal(bad.isError,true);
 const all=registry.listTools({includeUnauthorized:true});for(const id of ['account','draft_reply','publish_reply','search','game','draft_post','publish_post','draft_like','set_like'])assert(all.some(t=>(t.id||t.name)==='heybox-reader__'+id));
 console.log(JSON.stringify({loaded:true,tools:10,invalidInputHandled:true}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
