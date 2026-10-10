import { Client } from './core/client';
import { createNativePlatform, type MiniConfig } from './core/platform';
declare const __MINI_CONFIG__: MiniConfig;
export const variant = 'ant' as const;
export const client = new Client(createNativePlatform(wx), __MINI_CONFIG__.apiBase);
