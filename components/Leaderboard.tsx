'use client';

import { useEffect, useState } from 'react';
import { getScoresContract, getScoresCountContract, shortAddr } from '@/lib/contract';

interface ScoreRow {
  player: string;
  username: string;
  score: bigint;
  timestamp: bigint;
}

export function Leaderboard() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const count = await getScoresCountContract();
        const total = Number(count);
        const limit = Math.min(50, total);
        const offset = total > limit ? total - limit : 0;

        const data = await getScoresContract(offset, limit);

        if (!cancelled) {
          const sorted = [...data].sort((a, b) => Number(b.score - a.score));
          setRows(sorted);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Could not load leaderboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl bg-base-bg/50 p-4 ring-1 ring-base-accent/20 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-base-foreground-dim">
          Leaderboard
        </h2>
        <span className="text-xs text-base-foreground-dim">Top 50</span>
      </div>

      {loading ? (
        <p className="py-4 text-center text-xs text-base-foreground-dim">Loading…</p>
      ) : error ? (
        <p className="py-4 text-center text-xs text-red-400">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-base-foreground-dim">
          No scores yet — be the first to submit!
        </p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map((row, i) => (
            <li
              key={`${row.player}-${row.timestamp}`}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 odd:bg-base-secondary/50 even:bg-transparent"
            >
              <span className="flex w-6 shrink-0 font-mono text-xs text-base-foreground-dim">
                {i + 1}
              </span>
              <span className="flex-1 truncate font-semibold text-base-foreground">{row.username}</span>
              <span className="shrink-0 font-mono text-xs text-base-foreground-dim">
                {shortAddr(row.player)}
              </span>
              <span className="w-10 shrink-0 text-right font-bold text-base-accent">
                {row.score.toString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}