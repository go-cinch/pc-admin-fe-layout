// Outline paths from the approved Go Cinch mobile prototype.
const paths: Record<string,string> = {
  "home": "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  "grid": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "users": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M17 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  "user": "M20 21v-2a7 7 0 0 0-14 0v2 M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  "shield": "M12 3 21 7v6c0 5-9 9-9 9S3 18 3 13V7Z M8 12l3 3 5-6",
  "key": "M8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 12l9 9 M16 16l3-3 M19 19l3-3",
  "book": "M4 3h15a1 1 0 0 1 1 1v17H5a3 3 0 0 1-3-3V6a3 3 0 0 1 2-3 M3 17h17 M7 7h8 M7 11h6",
  "check": "m5 12 4 4L19 6",
  "checksquare": "M9 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8 M8 10l4 4L22 3",
  "bell": "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  "chevron": "m9 5 7 7-7 7",
  "back": "m15 5-7 7 7 7",
  "close": "m6 6 12 12 M18 6 6 18",
  "more": "M4 12h.01 M12 12h.01 M20 12h.01",
  "circle": "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M12 10v4 M10 12h4",
  "search": "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 m5 12 6 6",
  "plus": "M12 5v14 M5 12h14",
  "refresh": "M20 8a8 8 0 1 0 .2 7 M20 3v5h-5",
  "density": "M4 6h16 M4 12h16 M4 18h16",
  "columns": "M3 4h18v16H3z M9 4v16 M15 4v16",
  "style": "M3 4h18v6H3z M3 14h18v6H3z",
  "filter": "M4 6h16 M7 12h10 M10 18h4",
  "moon": "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11",
  "sun": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1",
  "globe": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2c-6 5-6 15 0 20 M12 2c6 5 6 15 0 20",
  "lock": "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  "logout": "M9 3H3v18h6 M8 12h13 M17 8l4 4-4 4",
  "settings": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 2h6l1 4 4 1 2 5-3 3v5l-5 2-3-3H6l-4-4 2-5V5Z",
  "phone": "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 M10 18h4",
  "desktop": "M2 3h20v14H2z M8 21h8 M12 17v4",
  "mail": "M3 5h18v14H3z m0 0 9 8 9-8",
  "info": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 7v.1 M12 11v6",
  "inbox": "M5 3h14l3 10v7H2v-7Z M2 13h6l2 3h4l2-3h6",
  "wifi": "M3 8a14 14 0 0 1 18 0 M6 12a9 9 0 0 1 12 0 M9 16a4 4 0 0 1 6 0 M12 20h.01",
  "signal": "M4 18v-3 M9 18v-6 M14 18V8 M19 18V4",
  "battery": "M2 6h18v12H2z M23 10v4 M5 9h12v6H5z",
  "trash": "M3 6h18 M6 6l1 15h10l1-15 M9 6V3h6v3 M10 10v7 M14 10v7",
  "clock": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 2",
  "eye": "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  "layers": "M3 4h18v6H3z M3 14h18v6H3z",
  "layout": "M3 4h18v16H3z M9 4v16 M15 4v16"
}
;
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
