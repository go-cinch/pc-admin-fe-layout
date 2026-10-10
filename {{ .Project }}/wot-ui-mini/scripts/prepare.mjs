import { readFileSync,writeFileSync,existsSync } from 'node:fs';
if(existsSync('mini.config.local')){const local=JSON.parse(readFileSync('mini.config.local','utf8'));const manifest=JSON.parse(readFileSync('src/manifest.json','utf8'));if(local.appid)manifest['mp-weixin'].appid=local.appid;writeFileSync('src/manifest.json',JSON.stringify(manifest,null,2)+'\n');}
