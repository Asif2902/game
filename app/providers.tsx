'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Attribution } from 'ox/erc8021';
import { AppInitializer } from '@/components/AppInitializer';

// Wagmi config — Base mainnet only.
// Standard web app stack: wagmi + viem + Coinbase Wallet connector.
// Works in the Base App's in-app browser and standalone.
// The Base App identifies this app via the `base:app_id` metadata tag
// in app/page.tsx (registered on Base.dev).
// Builder Code from base.dev > Settings > Builder Code for transaction attribution.

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ['bc_xjk8lvnk'],
});

// Use a more reliable RPC. Public mainnet.base.org is often rate-limited
// and can return "Failed to fetch" errors. Alchemy/Cloudflare are more stable.
function getRpcUrl(): string {
  const url = process.env.NEXT_PUBLIC_RPC_URL;
  if (url && url.length > 0) return url;
  // Fallback to Cloudflare's Base RPC (no API key needed, very reliable)
  return 'https://base-mainnet.public.blastapi.io';
}

function createWagmiConfig() {
  // Only add WalletConnect connector if explicitly opted in via env var.
  // WalletConnect can throw "ClientMetaManager not initialized" errors when
  // the project ID is invalid or the SDK can't initialize in the current
  // browser context. Coinbase Wallet connector works in all cases (including
  // inside the Base App), so we use it as the only default connector.
  const enableWC = process.env.NEXT_PUBLIC_ENABLE_WALLETCONNECT === 'true';

  return createConfig({
    chains: [base],
    connectors: [
      coinbaseWallet({
        appName: 'Flappy Base',
        preference: 'smartWalletOnly',
      }),
    ],
    multiInjectedProviderDiscovery: false,
    transports: {
      [base.id]: http(getRpcUrl(), {
        // Retry once on transient network failures
        retryCount: 1,
        retryDelay: 200,
        // Don't throw on fetch errors — we handle them in try/catch
        batch: { batchSize: 1, wait: 0 },
      }),
    },
    dataSuffix: DATA_SUFFIX,
    ssr: true,
  });
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // QueryClient must be created once per browser session.
  const [queryClient] = useState(makeQueryClient);
  // Wagmi config must keep a stable reference — re-creating it on every
  // render makes the inner AutoConnect connector call setState during render
  // (React 19 + Strict Mode warning).
  const [config] = useState(() => createWagmiConfig());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppInitializer />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
