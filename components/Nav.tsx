'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';

export function Nav({ onNavigate }: { onNavigate: (section: 'play' | 'leaderboard' | 'about') => void }) {
  const { isConnected } = useAccount();
  const [active, setActive] = useState<'play' | 'leaderboard' | 'about'>('play');

  return (
    <nav className="w-full max-w-[400px] flex items-center gap-1 bg-base-bg/50 rounded-xl p-1 ring-1 ring-base-accent/20 backdrop-blur-sm" role="navigation" aria-label="Main navigation">
      <button
        type="button"
        onClick={() => { setActive('play'); onNavigate('play'); }}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition ${active === 'play' ? 'bg-base-accent text-base-bg' : 'text-base-foreground-dim hover:text-base-foreground hover:bg-base-secondary/50'}`}
        aria-current={active === 'play' ? 'page' : undefined}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <span>Play</span>
      </button>
      <button
        type="button"
        onClick={() => { setActive('leaderboard'); onNavigate('leaderboard'); }}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition ${active === 'leaderboard' ? 'bg-base-accent text-base-bg' : 'text-base-foreground-dim hover:text-base-foreground hover:bg-base-secondary/50'}`}
        aria-current={active === 'leaderboard' ? 'page' : undefined}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M3 3h18v2H3z" />
          <path d="M3 21h18v-2H3z" />
        </svg>
        <span>Leaderboard</span>
      </button>
      <button
        type="button"
        onClick={() => { setActive('about'); onNavigate('about'); }}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition ${active === 'about' ? 'bg-base-accent text-base-bg' : 'text-base-foreground-dim hover:text-base-foreground hover:bg-base-secondary/50'}`}
        aria-current={active === 'about' ? 'page' : undefined}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>About</span>
      </button>
      {isConnected && (
        <div className="flex items-center gap-1.5 px-2 text-xs font-mono text-base-accent">
          <span className="w-px h-4 bg-base-accent/30" />
          <span className="px-2">●</span>
        </div>
      )}
    </nav>
  );
}