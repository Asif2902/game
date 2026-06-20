'use client';

import { useAccount, useDisconnect, useConnect } from 'wagmi';
import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { shortAddr } from '@/lib/contract';

export function WalletButton() {
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectors } = useConnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => disconnect()}
          className="flex items-center gap-1.5 rounded-lg bg-base-bg/50 px-3 py-1.5 text-xs font-medium text-base-foreground hover:bg-base-secondary ring-1 ring-base-accent/20 transition"
        >
          <span className="font-mono text-base-accent">{shortAddr(address)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-base-foreground-dim">
            <path d="M21 12H9" />
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <Wallet>
      <ConnectWallet />
    </Wallet>
  );
}