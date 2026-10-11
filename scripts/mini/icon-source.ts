// Outline paths from the approved Go Cinch mobile prototype.
const paths: Record<string,string> = __ICON_PATHS__;
function base64(value: string): string {
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let out='';
  for(let i=0;i<value.length;i+=3){const a=value.charCodeAt(i),b=value.charCodeAt(i+1),c=value.charCodeAt(i+2);out+=chars[a>>2]+chars[((a&3)<<4)|(isNaN(b)?0:b>>4)]+(isNaN(b)?'=':chars[((b&15)<<2)|(isNaN(c)?0:c>>6)])+(isNaN(c)?'=':chars[c&63]);}
  return out;
}
export function iconSource({name,tone='muted',variant='ant',dark=false,accent='default'}:{name:string;tone?:string;variant?:string;dark?:boolean;accent?:string}):string {
  const primary=accent==='green'?(dark?'#8cdac0':'#13775e'):accent==='violet'?(dark?'#cbb6ff':'#6b52b5'):variant==='tdesign'?(dark?'#94baff':'#0052d9'):variant==='wot'?(dark?'#b8bcff':'#4d55d5'):(dark?'#c7b0c2':'#796375');
  const color=tone==='inverse'?'#ffffff':tone==='accent'?primary:tone==='text'?(dark?'#f4f0f5':'#352e35'):(dark?'#b4adbb':variant==='ant'?'#756a75':'#677086');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[name]||paths.grid)+'"/></svg>';
  return 'data:image/svg+xml;base64,'+base64(svg);
}
