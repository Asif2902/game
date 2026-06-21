'use client';

import { useEffect } from 'react';

/**
 * Initializes the Farcaster MiniApp SDK once the app is ready to display.
 *
 * Per https://miniapps.farcaster.xyz/docs/getting-started#making-your-app-display:
 *   "After your app loads, you must call sdk.actions.ready() to hide the
 *    splash screen and display your content. If you don't call ready(),
 *    users will see an infinite loading screen."
 *
 * Safe to call when not running inside a Farcaster/Base App — the dynamic
 * import will fail silently and the splash will simply not be dismissed
 * (which is fine outside of the mini-app context).
 *
 * Also suppresses known noisy/benign errors from third-party libraries.
 */
export function AppInitializer() {
  useEffect(() => {
    // ---- Call sdk.actions.ready() to dismiss splash ----
    (async () => {
      try {
        const mod = await import('@farcaster/miniapp-sdk');
        if (mod?.sdk?.actions?.ready) {
          await mod.sdk.actions.ready();
        }
      } catch {
        // Not running inside a Farcaster/Base client — that's fine.
      }
    })();

    // ---- Suppress known noisy/benign errors ----
    const origError = console.error;
    const origWarn = console.warn;

    const shouldSuppress = (args: unknown[]): boolean => {
      const msg = args
        .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : ''))
        .join(' ');
      return (
        msg.includes('ClientMetaManager not initialized') ||
        msg.includes('ClientMetaManager') ||
        msg.includes('Failed to fetch') ||
        msg.includes('Network request failed')
      );
    };

    console.error = (...args: unknown[]) => {
      if (shouldSuppress(args)) return;
      origError.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      if (shouldSuppress(args)) return;
      origWarn.apply(console, args);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      if (
        msg.includes('ClientMetaManager') ||
        msg.includes('Failed to fetch') ||
        msg.includes('Network request failed')
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      console.error = origError;
      console.warn = origWarn;
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
