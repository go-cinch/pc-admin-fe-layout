import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, readdir, rm, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
const root=process.cwd(), src=path.join(root,'src'), out=path.join(root,'dist');
const development=process.argv.includes('--development')||process.argv.includes('--watch');
const parseEnv=s=>Object.fromEntries(s.split(/\r?\n/).filter(s=>s.trim()&&!s.startsWith('#')).map(s=>{const at=s.indexOf('=');return [s.slice(0,at),s.slice(at+1).replace(/^["']|["']$/g,'')]}));
const readOptional=async(file,fallback='')=>readFile(file,'utf8').catch(()=>fallback);
async function compile(){
 const pkg=JSON.parse(await readFile('package.json','utf8'));
 const library=pkg.dependencies['antd-mini']?'antd-mini':'tdesign-miniprogram';
 const local=JSON.parse(await readOptional('mini.config.local','{}'));
 const env={...parseEnv(await readOptional('.env.production')),...(development?parseEnv(await readOptional('.env.development.local')):{})};
 const apiBase=development&&local.apiBase?local.apiBase:env.VITE_GLOB_AUTH_API_URL;
 if(!/^https?:\/\//.test(apiBase||''))throw new Error('Mini-program API base must be an absolute HTTPS URL (HTTP is allowed only in local development).');
 if(!development&&!apiBase.startsWith('https://'))throw new Error('Production API base must use HTTPS.');
 await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
 const defs={__MINI_CONFIG__:JSON.stringify({apiBase,variant:library==='antd-mini'?'ant':'tdesign'}),'process.env.NODE_ENV':JSON.stringify(development?'development':'production')};
 const done=new Set();
 const libraryRoot=path.join(root,'node_modules',library);
 const libraryPkg=JSON.parse(await readFile(path.join(libraryRoot,'package.json'),'utf8'));
 const nativeRoot=path.join(libraryRoot,libraryPkg.miniprogram);
 function destination(file){if(file.startsWith(src+path.sep))return path.join(out,path.relative(src,file));if(file.startsWith(nativeRoot+path.sep))return path.join(out,'miniprogram_npm',library,path.relative(nativeRoot,file));throw new Error('Unsupported component dependency: '+file)}
 function resolveComponent(ref,base){if(ref.startsWith('/components/'))return path.join(src,ref);if(ref.startsWith(library+'/'))return path.join(nativeRoot,ref.slice(library.length+1));if(ref.startsWith('.'))return path.resolve(path.dirname(base),ref);throw new Error('Unresolved component: '+ref)}
 async function copyStatic(file){
  if(file.endsWith('.wxss') && !(await stat(file).catch(()=>null)) && await stat(file.replace(/\.wxss$/,'.css')).catch(()=>null)) file=file.replace(/\.wxss$/,'.css');
  if(done.has(file))return;done.add(file);const target=destination(file).replace(/\.css$/,'.wxss');await mkdir(path.dirname(target),{recursive:true});
  let content=await readFile(file);
  if(file.endsWith('.wxss') && /@font-face/.test(content.toString())){const font=await readFile(path.join(src,'assets/icons.ttf'));const family=library==='antd-mini'?'antdmini-icon':'t';content=Buffer.from(content.toString().replace(/@font-face\s*\{[^}]*\}/g,`@font-face{font-family:${family};src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');}`));}
  if(file.endsWith('.wxml'))for(const condition of content.toString().matchAll(/wx:(?:if|elif)="([^"]*)"/g))if(!condition[1].startsWith('{{'))throw new Error('WXML condition must use a data binding: '+file);
  await writeFile(target,content);
  if(/\.(wxml|wxss|wxs|css)$/.test(file)){const text=content.toString();for(const match of text.matchAll(/(?:src\s*=\s*|@import\s+|require\s*\(\s*)["']([^"']+)["']/g)){if(match[1].startsWith('.')||(!match[1].includes(':')&&!match[1].startsWith('/')&&!match[1].includes('{{'))){const dep=path.resolve(path.dirname(file),match[1]);await copyStatic(dep)}}}
 }
 async function component(base){
  const jsonFile=base+'.json';if(done.has(jsonFile))return;done.add(jsonFile);
  const json=JSON.parse(await readFile(jsonFile,'utf8'));
  for(const [name,ref] of Object.entries(json.usingComponents||{})){const dep=resolveComponent(ref,base);await component(dep);json.usingComponents[name]='/'+path.relative(out,destination(dep)).split(path.sep).join('/')}
  const target=destination(base);await mkdir(path.dirname(target),{recursive:true});await writeFile(target+'.json',JSON.stringify(json));
  const entry=await stat(base+'.ts').then(()=>base+'.ts').catch(()=>base+'.js');
  await build({entryPoints:[entry],outfile:target+'.js',bundle:true,format:'cjs',platform:'browser',target:'es2018',minify:!development,define:defs,logLevel:'warning'});
  for(const ext of ['.wxml','.wxss'])if(await stat(base+ext).catch(()=>null))await copyStatic(base+ext);
 }
 const app=JSON.parse(await readFile(path.join(src,'app.json'),'utf8'));
 for(const page of app.pages)await component(path.join(src,page));
 await writeFile(path.join(out,'app.json'),JSON.stringify(app,null,2));
 await build({entryPoints:[path.join(src,'app.ts')],outfile:path.join(out,'app.js'),bundle:true,format:'cjs',platform:'browser',target:'es2018',minify:!development,define:defs});
 await copyStatic(path.join(src,'app.wxss'));
 await cp(path.join(src,'assets'),path.join(out,'static'),{recursive:true,filter:p=>path.basename(p)!=='icons.ttf'});
 await mkdir(path.join(out,'core'),{recursive:true});await cp(path.join(src,'core/theme.css'),path.join(out,'core/theme.wxss'));
 await writeFile('project.config.json',JSON.stringify({description:pkg.name,projectname:pkg.name,appid:local.appid||'touristappid',compileType:'miniprogram',miniprogramRoot:'dist/',libVersion:'3.8.12',setting:{es6:true,minified:true,postcss:true,urlCheck:!development}},null,2)+'\n');
 let bytes=0;async function size(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())await size(p);else bytes+=(await stat(p)).size}}await size(out);
 console.log(`${library}: ${app.pages.length} pages built, ${(bytes/1024).toFixed(0)} KiB → dist/`);
}
await compile();
if(process.argv.includes('--watch')){let timer;let running=false;let again=false;const rebuild=async()=>{if(running){again=true;return}running=true;try{await compile()}catch(e){console.error(e)}finally{running=false;if(again){again=false;void rebuild()}}};watch(src,{recursive:true},()=>{clearTimeout(timer);timer=setTimeout(rebuild,150)});console.log('Watching src/. Import this project directory into WeChat DevTools.');}
