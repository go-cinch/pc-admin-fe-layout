#!/usr/bin/env python3
"""Render the shared screen into two native adapters and the uni-app adapter.
Only files carrying renderer ownership are written; core/business sources are handwritten.
"""
from pathlib import Path
import json,re,shutil
ROOT=Path(__file__).resolve().parents[2]
TEMPLATES=ROOT/'{{ .Project }}'
HERE=Path(__file__).parent
routes=['/dashboard/overview','/dashboard/workspace','/system/user','/system/role','/system/user-group','/system/action','/system/dictionary','/system/whitelist','/system/msg','/msg/inbox','/profile','/auth/login','/auth/register','/auth/reset-password']
icons={'users':'UserSetOutline','shield':'CheckShieldOutline','grid':'AppOutline','key':'KeyOutline','book':'TextOutline','check':'CheckOutline','bell':'BellOutline','home':'AppOutline','user':'UserOutline','back':'LeftOutline','more':'MoreOutline','search':'SearchOutline','refresh':'RedoOutline','density':'UnorderedListOutline','columns':'SetOutline','chevron':'RightOutline','close':'CloseOutline','moon':'MoonOutline','globe':'GlobalOutline','settings':'SetOutline'}
wicons={'users':'user-group','shield':'safe','grid':'apps','key':'lock','book':'book','check':'check','bell':'notification','home':'home','user':'user','back':'arrow-left','more':'more','search':'search-line','refresh':'refresh','density':'unordered-list','columns':'layout','chevron':'arrow-right','close':'close','moon':'moon','globe':'application','settings':'settings'}
ticons={'users':'usergroup','shield':'secured','grid':'app','key':'key','book':'book','check':'check','bell':'notification','home':'home','user':'user','back':'chevron-left','more':'more','search':'search','refresh':'refresh','density':'view-list','columns':'view-column','chevron':'chevron-right','close':'close','moon':'moon','globe':'earth','settings':'setting'}
markup=(HERE/'screen.wxml').read_text().replace('/assets/','/static/')
def write(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def dump(p,obj):write(p,json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
for ui,variant in [('ant-design-mini','ant'),('tdesign-mini','tdesign')]:
 root=TEMPLATES/ui;src=root/'src';ant=variant=='ant';prefix='ant' if ant else 't'
 write(root/'scripts/build.mjs',(HERE/'build-native.mjs').read_text())
 write(src/'app.ts','App({});\n')
 write(src/'app.wxss','page { height: 100%; background: #eef0f5; }\n')
 dump(src/'app.json',{'pages':['pages'+r+'/index' for r in routes],'window':{'navigationStyle':'custom','navigationBarTextStyle':'black','backgroundColor':'#f4f5f8'},'style':'v2','lazyCodeLoading':'requiredComponents'})
 write(src/'runtime.ts',f"import {{ Client }} from './core/client';\nimport {{ createNativePlatform, type MiniConfig }} from './core/platform';\ndeclare const __MINI_CONFIG__: MiniConfig;\nexport const variant = '{variant}' as const;\nexport const client = new Client(createNativePlatform(wx), __MINI_CONFIG__.apiBase);\n")
 for route in routes:
  page=src/('pages'+route)/'index'
  write(page.with_suffix('.ts'),f"Page({{ data: {{ route: '{route}', query: {{}} }}, onLoad(query: Record<string, string>) {{ this.setData({{ query }}) }} }});\n")
  dump(page.with_suffix('.json'),{'usingComponents':{'cinch-screen':'/components/screen/index'}})
  write(page.with_suffix('.wxml'),'<cinch-screen route="{{route}}" query="{{query}}" />\n')
  write(page.with_suffix('.wxss'),'/* Page presentation is shared by cinch-screen. */\n')
 write(src/'components/screen/index.ts',(HERE/'native-screen.ts').read_text())
 write(src/'components/screen/index.wxml',markup)
 write(src/'components/screen/index.wxss','@import "../../core/theme.wxss";\n')
 dump(src/'components/screen/index.json',{'component':True,'usingComponents':{f'c-{name}':f'../c-{name}/index' for name in ['button','input','textarea','switch','tag','icon']}})
 for name in ['button','input','textarea','switch','tag','icon']:
  folder=src/'components'/('c-'+name)
  component='Input/Textarea' if name=='textarea' else name.capitalize()
  library=f'antd-mini/{component}/index' if ant else f'tdesign-miniprogram/{name}/{name}'
  dump(folder/'index.json',{'component':True,'styleIsolation':'shared','usingComponents':{f'{prefix}-{name}':library}})
  write(folder/'index.wxss', ':host { display: inline-block; width: auto; flex-shrink: 0; }\n' if name in ['icon','tag','switch'] else ':host { display: block; width: 100%; }\n')
  if name=='button':
   write(folder/'index.ts',"Component({ options: { multipleSlots: true, styleIsolation: 'shared' }, properties: { action: String, arg: String, kind: String, disabled: Boolean, loading: Boolean }, methods: { press() { if (!this.data.disabled && !this.data.loading) this.triggerEvent('press', { action: this.data.action, arg: this.data.arg }) } } });\n")
   attrs='type="{{kind === \'primary\' ? \'primary\' : kind === \'text\' ? \'text\' : \'default\'}}" danger="{{kind === \'danger\'}}"' if ant else 'theme="{{kind === \'danger\' ? \'danger\' : kind === \'primary\' ? \'primary\' : \'default\'}}" variant="{{kind === \'text\' ? \'text\' : kind === \'primary\' ? \'base\' : \'outline\'}}"'
   write(folder/'index.wxml',f'<{prefix}-button style="width:100%;min-height:44px;border-radius:10px" {attrs} disabled="{{{{disabled}}}}" loading="{{{{loading}}}}" bindtap="press"><slot /></{prefix}-button>\n')
  elif name in ['input','textarea']:
   write(folder/'index.ts',"Component({ options: { styleIsolation: 'shared' }, properties: { name: String, label: String, value: { type: null, value: '' }, placeholder: String, password: Boolean, disabled: Boolean }, methods: { change(e: any) { const value = e.detail?.value ?? e.detail; this.triggerEvent('change', { name: this.data.name, value }) }, blur() { this.triggerEvent('blur') } } });\n")
   attrs='controlled="{{true}}" maxLength="{{-1}}"' if ant else 'maxlength="{{-1}}" borderless="{{true}}"'
   event='bind:change="change"' if ant else ('bind:change="change"' if name=='input' else 'bind:change="change"')
   if name=='input':attrs+= ' password="{{password}}" type="text"' if ant else ' type="{{password ? \'password\' : \'text\'}}"'
   extra = 'style="padding:12px;min-height:46px;box-sizing:border-box"' if ant else ''
   write(folder/'index.wxml',f'<{prefix}-{name} {extra} aria-label="{{{{label}}}}" value="{{{{value}}}}" placeholder="{{{{placeholder}}}}" disabled="{{{{disabled}}}}" {attrs} {event} bind:blur="blur" />\n')
  elif name=='switch':
   write(folder/'index.ts',"Component({ options: { styleIsolation: 'shared' }, properties: { name: String, checked: Boolean }, methods: { change(e: any) { this.triggerEvent('change', { name: this.data.name, value: e.detail?.value ?? e.detail }) } } });\n")
   control = 'controlled="{{true}}"' if ant else ''
   write(folder/'index.wxml',f'<{prefix}-switch {"checked" if ant else "value"}="{{{{checked}}}}" {control} bind:change="change" />\n')
  elif name=='tag':
   write(folder/'index.ts',"Component({ options: { styleIsolation: 'shared' }, properties: { tone: String } });\n")
   write(folder/'index.wxml',f'<{prefix}-tag '+('color="{{tone || \'primary\'}}" type="fill"' if ant else 'theme="{{tone || \'default\'}}" variant="light"')+f'><slot /></{prefix}-tag>\n')
  else:
   iconmap=icons if ant else ticons
   write(folder/'index.ts','const icons: Record<string,string> = '+json.dumps(iconmap)+';\nComponent({ options: { styleIsolation: \'shared\' }, properties: { name: { type: String, value: \'grid\', observer(name: string) { this.setData({ nativeName: icons[name] || icons.grid }) } } }, data: { nativeName: icons.grid } });\n')
   write(folder/'index.wxml',f'<{prefix}-icon {"type" if ant else "name"}="{{{{nativeName}}}}" '+('style="font-size:22px"' if ant else 'size="22px"')+' />\n')
 # Source license of the reused mobile business reference remains intact.
 shutil.copy(TEMPLATES/'tdesign-vue3-mobile/LICENSE_TDESIGN',root/'LICENSE_TDESIGN_REFERENCE')
# Wot UI: the same view model expressed through Vue/uni-app and real wd-* components.
root=TEMPLATES/'wot-ui-mini';src=root/'src'
for route in routes:
 p=src/('pages'+route)/'index.vue'
 import os
 relative=os.path.relpath(src/'components/CinchScreen.vue',p.parent).replace(os.sep,'/')
 write(p,f'''<script setup lang="ts">
import {{ ref }} from 'vue';
import {{ onLoad }} from '@dcloudio/uni-app';
import CinchScreen from '{relative}';
const query=ref<Record<string,string>>({{}});
onLoad((options:any)=>{{query.value=options||{{}}}});
</script>
<template><CinchScreen route="{route}" :query="query" /></template>
''')
def vue_tag(match):
 tag=match.group(0)
 if tag.startswith('</'):return tag
 arr=re.search(r'wx:for="{{(.*?)}}"',tag)
 if arr:
  alias=re.search(r'wx:for-item="([^"]+)"',tag);item=alias.group(1) if alias else 'item'
  index=re.search(r'wx:for-index="([^"]+)"',tag);idx=index.group(1) if index else 'index'
  key=re.search(r'wx:key="([^"]+)"',tag);keyval=key.group(1) if key else 'index'
  tag=re.sub(r'wx:for="{{.*?}}"',f'v-for="({item}, {idx}) in {arr.group(1)}"',tag)
  tag=re.sub(r'\s+wx:for-(?:item|index)="[^"]+"','',tag)
  tag=re.sub(r'wx:key="[^"]+"',f':key="{idx if keyval=="index" else item if keyval=="*this" else item+"."+keyval}"',tag)
 tag=tag.replace('wx:if=','v-if=').replace('wx:elif=','v-else-if=').replace('wx:else','v-else')
 tag=re.sub(r'(v-if|v-else-if)="{{(.*?)}}"',r'\1="\2"',tag)
 tag=tag.replace('bindtap="onAction"','@tap="onAction"').replace('bind:press=','@press=').replace('bind:change=','@change=').replace('bind:blur=','@blur=')
 tag=tag.replace('bindtouchstart=','@touchstart=').replace('catchtouchmove=','@touchmove.stop.prevent=').replace('bindtouchend=','@touchend=').replace('bindtouchcancel=','@touchcancel=').replace('bindtap="onPoint"','@tap="onPoint"')
 def attr(m):
  key,val=m.groups()
  if '{{' not in val:return m.group(0)
  if val.startswith('{{') and val.endswith('}}') and val.count('{{')==1:return f':{key}="{val[2:-2]}"'
  template=re.sub(r'{{(.*?)}}',r'${\1}',val)
  return f':{key}="`{template}`"'
 tag=re.sub(r'(?<![:\w-])([\w-]+)="([^"]*)"',attr,tag)
 return tag
vue=re.sub(r'<(?:[^"\'>]|"[^"]*"|\'[^\']*\')*>',vue_tag,markup)
write(src/'components/CinchScreen.vue','''<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { Screen } from '../core/screen';
import { client } from '../runtime';
import CButton from './CButton.vue';
import CInput from './CInput.vue';
import CTextarea from './CTextarea.vue';
import CSwitch from './CSwitch.vue';
import CTag from './CTag.vue';
import CIcon from './CIcon.vue';
const props=defineProps<{route:string;query:Record<string,string>}>();
const vm=ref<any>(null);
const instance=getCurrentInstance();
const screen=new Screen(client,'wot',value=>{vm.value=value});
onMounted(()=>void screen.start(props.route,props.query));
onBeforeUnmount(()=>screen.dispose());onShow(()=>screen.show());onHide(()=>screen.hide());
function onAction(e:any){void screen.action(e.action||e.detail?.action||e.currentTarget?.dataset.a,String(e.arg??e.detail?.arg??e.currentTarget?.dataset.v??''))}
function onInput(e:any){const d=e.detail||e;screen.input(d.name,d.value)}
function onSearchBlur(){screen.blurSearch()}
function box(id:string,fn:(b:any)=>void){uni.createSelectorQuery().in(instance?.proxy).select(id).boundingClientRect(fn).exec()}
function onSliderStart(e:any){const x=e.touches[0].clientX;box('#slider-track',b=>{if(b)screen.beginSlider(x,b.width)})}
function onSliderMove(e:any){screen.moveSlider(e.touches[0].clientX)}
function onSliderEnd(){void screen.endSlider()}
function onSliderCancel(){screen.resetSlider();screen.emit()}
function onPoint(e:any){box('#point-captcha',b=>{if(b)void screen.point(e.detail.x-b.left,e.detail.y-b.top,b.width,b.height)})}
</script>
<template>
'''+vue+'\n</template>\n')
write(src/'components/CButton.vue','''<script setup lang="ts">
const props=withDefaults(defineProps<{action?:string;arg?:string;kind?:string;disabled?:boolean;loading?:boolean}>(),{action:'',arg:'',kind:'outline'});
const emit=defineEmits<{press:[value:{action:string;arg:string}]}>();
function press(){if(!props.disabled&&!props.loading)emit('press',{action:props.action,arg:props.arg})}
</script><template><view class="c-button"><wd-button :type="kind==='danger'?'danger':kind==='primary'?'primary':'info'" :variant="kind==='text'?'text':kind==='primary'?'base':'plain'" :disabled="disabled" :loading="loading" @click="press"><slot /></wd-button></view></template>
''')
for name in ['Input','Textarea']:
 tag='input' if name=='Input' else 'textarea'
 write(src/f'components/C{name}.vue',f'''<script setup lang="ts">
const props=defineProps<{{name:string;value:any;label?:string;placeholder?:string;password?:boolean;disabled?:boolean}}>();
const emit=defineEmits<{{change:[value:{{name:string;value:any}}];blur:[]}}>();
function change(value:any){{emit('change',{{name:props.name,value}})}}
</script><template><view class="c-{tag}"><wd-{tag} :model-value="value" :aria-label="label" :placeholder="placeholder" :disabled="disabled" {':show-password="password" type="text"' if name=='Input' else ':auto-height="false"'} :maxlength="-1" @update:model-value="change" @blur="emit('blur')" /></view></template>
''')
write(src/'components/CSwitch.vue','''<script setup lang="ts">
const props=defineProps<{name:string;checked:any}>();const emit=defineEmits<{change:[value:{name:string;value:boolean}]}>();
</script><template><wd-switch :model-value="!!checked" @update:model-value="(value:any)=>emit('change',{name:props.name,value:!!value})" /></template>
''')
write(src/'components/CTag.vue','''<script setup lang="ts">defineProps<{tone?:string}>();</script><template><wd-tag :type="tone==='success'?'success':tone==='danger'?'danger':tone==='warning'?'warning':'default'" variant="soft"><slot /></wd-tag></template>
''')
write(src/'components/CIcon.vue','''<script setup lang="ts">
defineProps<{name:string}>();
const names:Record<string,string>='''+json.dumps(wicons)+''';
</script><template><wd-icon :name="names[name]||'app'" size="22px" /></template>
''')
write(src/'runtime.ts','''import { Client } from './core/client';
import { createNativePlatform, type MiniConfig } from './core/platform';
declare const __MINI_CONFIG__: MiniConfig;
const platform=createNativePlatform(uni);
// #ifdef H5
platform.native=false;platform.topInset=0;
platform.random=async length=>{const bytes=new Uint8Array(length);globalThis.crypto.getRandomValues(bytes);return bytes};
// #endif
export const client=new Client(platform,__MINI_CONFIG__.apiBase);
''')
write(src/'main.ts',"import { createSSRApp } from 'vue';\nimport App from './App.vue';\nexport function createApp(){ return { app: createSSRApp(App) }; }\n")
write(src/'App.vue','<script lang="ts">export default {};</script>\n<style>\n@import "./core/theme.css";\n.field .c-input,.field .c-textarea{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}\n.field.invalid .c-input,.field.invalid .c-textarea{border-color:var(--danger)}\n.search-field .c-input{flex:1;min-width:0}.sheet-footer .c-button{flex:1}.auth-submit .c-button,.auth-submit .wd-button{width:100%}\n</style>\n')
dump(src/'pages.json',{'pages':[{'path':'pages'+r+'/index','style':{'navigationStyle':'custom'}} for r in routes],'globalStyle':{'navigationStyle':'custom','backgroundColor':'#f5f6fb'},'easycom':{'autoscan':True,'custom':{'^wd-(.*)':'@wot-ui/ui/components/wd-$1/wd-$1.vue'}}})
dump(src/'manifest.json',{'name':'Go Cinch','appid':'','versionName':'1.0.0','versionCode':'100','vueVersion':'3','mp-weixin':{'appid':'touristappid','setting':{'urlCheck':True},'usingComponents':True},'h5':{'router':{'mode':'hash'}}})
write(root/'index.html','<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Go Cinch · Wot UI</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n')
write(root/'vite.config.ts','''import { defineConfig, loadEnv } from 'vite';
import uniModule from '@dcloudio/vite-plugin-uni';
import { readFileSync, existsSync } from 'node:fs';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 const local=existsSync('mini.config.local')?JSON.parse(readFileSync('mini.config.local','utf8')):{};
 const h5=process.env.UNI_PLATFORM==='h5';
 const apiBase=h5?(env.VITE_GLOB_AUTH_API_URL||'/api/auth'):(mode==='development'&&local.apiBase?local.apiBase:env.VITE_GLOB_AUTH_API_URL);
 const uni=(uniModule as any).default||uniModule;
 return {plugins:[uni()],define:{__MINI_CONFIG__:JSON.stringify({apiBase,variant:'wot'})},server:{host:'0.0.0.0',port:Number(env.VITE_PORT||5173),strictPort:true,allowedHosts:env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS?.split(',')||[],proxy:env.AUTH_PROXY_TARGET?{'/api/auth':{target:env.AUTH_PROXY_TARGET,changeOrigin:true,rewrite:(p:string)=>p.replace(/^\\/api\\/auth/,'')}}:{}}};
});
''')
write(root/'scripts/prepare.mjs','''import { readFileSync,writeFileSync,existsSync } from 'node:fs';
if(existsSync('mini.config.local')){const local=JSON.parse(readFileSync('mini.config.local','utf8'));const manifest=JSON.parse(readFileSync('src/manifest.json','utf8'));if(local.appid)manifest['mp-weixin'].appid=local.appid;writeFileSync('src/manifest.json',JSON.stringify(manifest,null,2)+'\\n');}
''')
shutil.copy(TEMPLATES/'tdesign-vue3-mobile/LICENSE_TDESIGN',root/'LICENSE_TDESIGN_REFERENCE')
for p in (src/'assets').glob('*'):write(src/'static'/p.name,p.read_text())
write(src/'env.d.ts','/// <reference types="@dcloudio/types" />\ndeclare module "*.vue" { import type { DefineComponent } from "vue"; const component: DefineComponent<any,any,any>; export default component; }\n')
