// Type declarations for openclaw module
declare module 'openclaw' {
  export type {
    OpenClawPluginDefinition,
    OpenClawPluginApi,
    PluginLogger,
    PluginRuntime,
    OpenClawPluginCommandDefinition,
    PluginCommandContext,
  } from './dist/plugin-sdk/plugins/types.js';

  export type {
    ReplyPayload,
  } from './dist/plugin-sdk/auto-reply/types.js';
}
