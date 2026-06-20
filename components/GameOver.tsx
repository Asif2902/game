'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { submitScoreContract, getFeeContract, shortAddr } from '@/lib/contract';

const USERNAME_RE = /^[a-zA-Z0-9]+$/;

interface GameOverProps {
  score: number;
  submitted: boolean;
  onSubmitted: () => void;
  onRestart: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; txHash: string };

export function GameOver({ score, submitted, onSubmitted, onRestart }: GameOverProps) {
  const { address, isConnected } = useAccount();
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [fee, setFee] = useState<string>('0.0001');

  useEffect(() => {
    getFeeContract().then(setFee).catch(() => setFee('0.0001'));
  }, []);

  const trimmed = username.trim();
  const usernameValid = trimmed.length >= 1 && trimmed.length <= 20 && USERNAME_RE.test(trimmed);

  const basescan = (tx: string) => `https://basescan.org/tx/${tx}`;

  const handleSubmit = async () => {
    if (submitted) return;
    if (!isConnected || !address) {
      setStatus({ kind: 'error', message: 'Connect your wallet first.' });
      return;
    }
    if (!usernameValid) {
      setStatus({ kind: 'error', message: 'Username: 1–20 alphanumeric chars.' });
      return;
    }

    setStatus({ kind: 'sending' });
    try {
      const txHash = await submitScoreContract(username.trim(), score, fee, address);

      setStatus({ kind: 'success', txHash });
      onSubmitted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed.';
      setStatus({
        kind: 'error',
        message: /reject|denied|cancel/i.test(msg) ? 'Transaction cancelled.' : msg,
      });
    }
  };

  return (
    <div className="w-full max-w-[340px] rounded-xl bg-base-bg/95 p-5 text-center ring-1 ring-base-accent/30 backdrop-blur-sm">
      <p className="text-sm uppercase tracking-widest text-base-foreground-dim">Game Over</p>
      <p className="mt-1 text-5xl font-bold text-base-accent">{score}</p>
      <p className="text-xs text-base-foreground-dim">pipes cleared</p>

      {!submitted && status.kind !== 'success' && (
        <div className="mt-4 space-y-3 text-left">
          {isConnected ? (
            <p className="text-center text-xs text-base-foreground-dim">
              Connected: <span className="font-mono text-base-accent">{shortAddr(address)}</span>
            </p>
          ) : (
            <div className="flex justify-center">
              <Wallet>
                <ConnectWallet />
              </Wallet>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-base-foreground-dim">Username</span>
            <input
              type="text"
              value={username}
              maxLength={20}
              onChange={(e) => {
                setUsername(e.target.value);
                if (status.kind === 'error') setStatus({ kind: 'idle' });
              }}
              placeholder="1–20 alphanumeric"
              className="w-full rounded-lg bg-base-bg/50 px-3 py-2 text-sm outline-none ring-1 ring-base-accent/30 focus:ring-2 focus:ring-base-accent bg-base-bg text-base-foreground placeholder-base-foreground-dim"
            />
            {trimmed.length > 0 && !usernameValid && (
              <span className="mt-1 block text-xs text-red-400">
                Letters/numbers only, max 20.
              </span>
            )}
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isConnected || !usernameValid || status.kind === 'sending'}
            className="w-full rounded-lg bg-base-accent px-4 py-3 text-sm font-bold text-base-bg disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {status.kind === 'sending' ? 'Waiting for wallet…' : 'Submit Score'}
          </button>

          {status.kind === 'error' && (
            <p className="text-center text-xs text-red-400">{status.message}</p>
          )}
        </div>
      )}

      {status.kind === 'success' && (
        <div className="mt-4 space-y-2 text-sm">
          <p className="font-semibold text-green-400">Score submitted!</p>
          <a
            href={basescan(status.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-base-accent underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            View on Basescan ↗
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="mt-4 w-full rounded-lg bg-base-secondary px-4 py-2 text-sm font-semibold text-base-foreground hover:bg-base-secondary/80 transition-colors ring-1 ring-base-accent/20"
      >
        Play Again
      </button>
    </div>
  );
}