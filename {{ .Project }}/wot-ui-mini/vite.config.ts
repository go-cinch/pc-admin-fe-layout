import { defineConfig, loadEnv } from 'vite';
import uniModule from '@dcloudio/vite-plugin-uni';
import { readFileSync, existsSync } from 'node:fs';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 const local=existsSync('mini.config.local')?JSON.parse(readFileSync('mini.config.local','utf8')):{};
 const h5=process.env.UNI_PLATFORM==='h5';
 const apiBase=h5?(env.VITE_GLOB_AUTH_API_URL||'/api/auth'):(mode==='development'&&local.apiBase?local.apiBase:env.VITE_GLOB_AUTH_API_URL);
 const uni=(uniModule as any).default||uniModule;
 return {plugins:[uni()],define:{__MINI_CONFIG__:JSON.stringify({apiBase,variant:'wot'})},server:{host:'0.0.0.0',port:Number(env.VITE_PORT||5173),strictPort:true,allowedHosts:env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS?.split(',')||[],proxy:env.AUTH_PROXY_TARGET?{'/api/auth':{target:env.AUTH_PROXY_TARGET,changeOrigin:true,rewrite:(p:string)=>p.replace(/^\/api\/auth/,'')}}:{}}};
});
