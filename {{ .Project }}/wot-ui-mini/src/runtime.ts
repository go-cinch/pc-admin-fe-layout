import { Client } from './core/client';
import { createNativePlatform, type MiniConfig } from './core/platform';
declare const __MINI_CONFIG__: MiniConfig;
const platform=createNativePlatform(uni);
// #ifdef H5
platform.native=false;platform.topInset=0;
platform.random=async length=>{const bytes=new Uint8Array(length);globalThis.crypto.getRandomValues(bytes);return bytes};
// #endif
export const client=new Client(platform,__MINI_CONFIG__.apiBase);
