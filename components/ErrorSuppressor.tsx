'use client';

import { useEffect } from 'react';

/**
 * Suppresses known noisy/benign errors from third-party libraries
 * (WalletConnect, viem RPC, OnchainKit) that don't affect functionality.
 *
 * - "ClientMetaManager not initialized" — WalletConnect v2 SDK emits this
 *   when the SDK hasn't been fully initialized yet (e.g., before the user
 *   connects a wallet). It's benign.
 *
 * - "Failed to fetch" — viem/OnchainKit RPC calls can fail with CORS or
 *   transient network issues. Our code handles these gracefully with
 *   try/catch and fallback values.
 */
export function ErrorSuppressor() {
  useEffect(() => {
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

    // Suppress unhandled promise rejections from these sources
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
