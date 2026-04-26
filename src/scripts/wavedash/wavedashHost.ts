import type { WavedashSDK } from '@wvdsh/sdk-js';

/** Injected by the Wavedash host at runtime; undefined in local Vite dev. */
export function wavedashFromWindow(): WavedashSDK | undefined {
  return (window as unknown as { Wavedash?: WavedashSDK }).Wavedash;
}
