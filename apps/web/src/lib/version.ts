declare const __APP_VERSION__: string | undefined;

/** When and from what commit the app was built, e.g. `26-11-14-05-2d4aefd`; set by Vite. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
