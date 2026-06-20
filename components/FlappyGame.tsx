'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { useConnect } from 'wagmi';
import { shortAddr, submitScoreContract } from '@/lib/contract';

// ---------------------------------------------------------------------------
// Exact palette
// ---------------------------------------------------------------------------
const COLORS = {
  skyTop: '#6BBFED',
  skyBottom: '#A8D8F0',
  cloud: '#FFFFFF',
  ground: '#1A3A6E',
  groundTop: '#2B4F8A',
  pipeBody: '#1E5CB3',
  pipeHighlight: '#4A8FE0',
  pipeCap: '#1A4F9E',
  birdBody: '#F0E0B0',
  birdWing: '#4A80C8',
  birdBeak: '#FF8000',
  birdEye: '#FFFFFF',
  birdPupil: '#1A1A2E',
  titleFill: '#FFFFFF',
  titleStroke: '#1A3A8F',
  titleShadow: '#0A2050',
  buttonBlue: '#2B6FD4',
  red: '#FF3B3B',
  panelBg: 'rgba(200, 230, 255, 0.85)',
  darkOverlay: 'rgba(0, 0, 0, 0.4)',
  outerBg: '#0A1628',
};

type GamePhase = 'IDLE' | 'PLAYING' | 'DEAD';

interface Pipe {
  x: number;
  gapY: number;
  passed: boolean;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// ---------------------------------------------------------------------------
// Web Audio API — synthesized sound effects
// ---------------------------------------------------------------------------
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function playBlip(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.15) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + duration);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playFlap() { playBlip(600, 0.08, 'square', 0.1); }
function playScore() { playBlip(880, 0.12, 'sine', 0.12); }
function playHit() { playBlip(120, 0.2, 'sawtooth', 0.2); }

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function FlappyGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Mutable game state in refs (no React re-renders during RAF)
  const phaseRef = useRef<GamePhase>('IDLE');
  const birdYRef = useRef(0);
  const birdVRef = useRef(0);
  const birdRotRef = useRef(0);
  const pipesRef = useRef<Pipe[]>([]);
  const spawnTimerRef = useRef(0);
  const scoreRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const flashFramesRef = useRef(0);
  const viewWRef = useRef(800);
  const viewHRef = useRef(600);
  const cloudsRef = useRef<{ x: number; y: number; r: number }[][]>([]);

  // Scaled game parameters (derived from canvas size)
  const birdRRef = useRef(18);
  const pipeWRef = useRef(78);
  const gapRef = useRef(200);
  const groundHRef = useRef(70);
  const birdXRef = useRef(0);
  const pipeSpeedRef = useRef(180);

  // React state for HUD / overlays
  const [phase, setPhase] = useState<GamePhase>('IDLE');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [bestLoading, setBestLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'play' | 'leaderboard' | 'about'>('play');

  // Wallet state for submit score
  const { address, isConnected } = useAccount();
  const { connectors } = useConnect();
  const [username, setUsername] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [txHash, setTxHash] = useState('');

  // Load best score from smart contract
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/contract');
        if (!mod.CONTRACT_ADDRESS) {
          if (!cancelled) setBestLoading(false);
          return;
        }
        const count = await mod.getScoresCountContract();
        const total = Number(count);
        if (total === 0) {
          if (!cancelled) setBestLoading(false);
          return;
        }
        const limit = Math.min(50, total);
        const offset = total > limit ? total - limit : 0;
        const data = await mod.getScoresContract(offset, limit);
        if (cancelled) return;
        let highest = 0;
        for (const r of data as unknown as Array<{ score: bigint }>) {
          const n = Number(r.score);
          if (Number.isFinite(n) && n > highest) highest = n;
        }
        setBest(highest);
      } catch (err) {
        console.warn('Best score fetch failed:', err);
      } finally {
        if (!cancelled) setBestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update best when score changes
  if (score > best) {
    setBest(score);
  }

  const goDead = useCallback(() => {
    if (phaseRef.current === 'DEAD') return;
    phaseRef.current = 'DEAD';
    setPhase('DEAD');
    flashFramesRef.current = 3;
    playHit();
  }, []);

  const flap = useCallback(() => {
    if (phaseRef.current === 'DEAD') return;
    if (phaseRef.current === 'IDLE') {
      phaseRef.current = 'PLAYING';
      setPhase('PLAYING');
    }
    birdVRef.current = -460;
    playFlap();
  }, []);

  const resetGame = useCallback(() => {
    birdYRef.current = viewHRef.current / 2;
    birdVRef.current = 0;
    birdRotRef.current = 0;
    pipesRef.current = [];
    spawnTimerRef.current = 0;
    scoreRef.current = 0;
    lastTsRef.current = null;
    phaseRef.current = 'IDLE';
    setScore(0);
    setPhase('IDLE');
    setSubmitStatus('idle');
    setSubmitError('');
    setSubmitted(false);
    setTxHash('');
  }, []);

  const updateScaledParams = useCallback((W: number, H: number) => {
    birdRRef.current = Math.max(14, Math.min(26, H * 0.028));
    pipeWRef.current = Math.max(60, Math.min(110, W * 0.13));
    gapRef.current = Math.max(160, Math.min(280, H * 0.28));
    groundHRef.current = Math.max(50, Math.min(110, H * 0.11));
    birdXRef.current = W * 0.25;
    pipeSpeedRef.current = Math.max(140, Math.min(260, W * 0.22));
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const cssW = Math.max(280, Math.floor(rect.width));
    const cssH = Math.max(360, Math.floor(rect.height));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    viewWRef.current = cssW;
    viewHRef.current = cssH;
    updateScaledParams(cssW, cssH);

    if (phaseRef.current === 'IDLE') {
      birdYRef.current = cssH / 2;
    }
    cloudsRef.current = makeClouds(cssW, cssH);
  }, [updateScaledParams]);

  useEffect(() => {
    resize();
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    let ro: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => resize());
      ro.observe(parent);
    } else {
      window.addEventListener('resize', resize);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
    };
  }, [resize]);

  // ---- Submit score handler ----
  const handleSubmitScore = async () => {
    if (submitted || submitStatus === 'sending') return;
    if (!isConnected || !address) {
      setSubmitStatus('error');
      setSubmitError('Connect wallet first');
      return;
    }
    const trimmed = username.trim();
    if (!/^[a-zA-Z0-9]{1,20}$/.test(trimmed)) {
      setSubmitStatus('error');
      setSubmitError('Username: 1-20 alphanumeric chars');
      return;
    }
    setSubmitStatus('sending');
    setSubmitError('');
    try {
      // Use a small default fee; the contract may have its own fee
      const fee = '0.0001';
      const hash = await submitScoreContract(trimmed, score, fee, address);
      setTxHash(hash);
      setSubmitStatus('success');
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submit failed';
      if (/reject|denied|cancel/i.test(msg)) {
        setSubmitError('Cancelled');
      } else {
        setSubmitError(msg);
      }
      setSubmitStatus('error');
    }
  };

  // ---- Main game loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (phaseRef.current === 'DEAD') resetGame();
        else flap();
      } else if (e.key === 'Enter' && phaseRef.current === 'DEAD') {
        e.preventDefault();
        resetGame();
      }
    };

    const onPointer = (e: PointerEvent) => {
      // Only handle canvas taps if clicking the canvas itself, not the overlays
      const target = e.target as HTMLElement;
      if (target && target.tagName !== 'CANVAS') return;
      e.preventDefault();
      if (phaseRef.current === 'DEAD') resetGame();
      else flap();
    };

    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointer);

    const loop = () => {
      const now = performance.now();
      const last = lastTsRef.current ?? now;
      lastTsRef.current = now;
      const dt = Math.min(0.033, (now - last) / 1000);

      const W = viewWRef.current;
      const H = viewHRef.current;
      const birdR = birdRRef.current;
      const pipeW = pipeWRef.current;
      const gap = gapRef.current;
      const groundH = groundHRef.current;
      const birdX = birdXRef.current;
      const pipeSpeed = pipeSpeedRef.current;

      const p = phaseRef.current;

      if (p === 'PLAYING') {
        const gravity = 1500;
        birdVRef.current += gravity * dt;
        birdYRef.current += birdVRef.current * dt;

        const targetRot = Math.max(-0.26, Math.min(0.61, birdVRef.current / 1100));
        birdRotRef.current += (targetRot - birdRotRef.current) * Math.min(1, dt * 10);

        const spawnInterval = Math.max(1.0, 320 / pipeSpeed);
        spawnTimerRef.current += dt;
        if (spawnTimerRef.current >= spawnInterval) {
          spawnTimerRef.current = 0;
          const minY = gap / 2 + 60;
          const maxY = H - groundH - gap / 2 - 60;
          const gapY = rand(minY, maxY);
          pipesRef.current.push({ x: W + pipeW + 4, gapY, passed: false });
        }

        for (const pipe of pipesRef.current) {
          pipe.x -= pipeSpeed * dt;
          if (!pipe.passed && pipe.x + pipeW < birdX) {
            pipe.passed = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
            playScore();
          }
        }
        pipesRef.current = pipesRef.current.filter((pp) => pp.x + pipeW > -10);

        const by = birdYRef.current;
        if (by - birdR <= 0) {
          birdYRef.current = birdR;
          birdVRef.current = 0;
        }
        if (by + birdR >= H - groundH) {
          goDead();
        } else {
          const hitX = birdR * 0.85;
          const hitY = birdR * 0.95;
          for (const pp of pipesRef.current) {
            const left = pp.x;
            const right = pp.x + pipeW;
            if (birdX + hitX < left || birdX - hitX > right) continue;
            const topOpen = pp.gapY - gap / 2;
            const botOpen = pp.gapY + gap / 2;
            if (by - hitY > topOpen && by + hitY < botOpen) continue;
            goDead();
            break;
          }
        }
      } else if (p === 'IDLE') {
        birdYRef.current = H / 2 + Math.sin(now / 350) * 10;
        birdRotRef.current = 0;
      } else if (p === 'DEAD') {
        birdVRef.current += 1500 * dt;
        birdYRef.current += birdVRef.current * dt;
        birdRotRef.current = Math.min(Math.PI / 2, birdRotRef.current + dt * 4);
        if (birdYRef.current > H - groundHRef.current - birdRRef.current) {
          birdYRef.current = H - groundHRef.current - birdRRef.current;
          birdVRef.current = 0;
        }
      }

      drawScene(
        ctx,
        W,
        H,
        pipesRef.current,
        cloudsRef.current,
        birdYRef.current,
        birdRotRef.current,
        phaseRef.current,
        scoreRef.current,
      );

      if (flashFramesRef.current > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        flashFramesRef.current--;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointer);
    };
  }, [flap, goDead, resetGame]);

  const handleNavigate = (section: 'play' | 'leaderboard' | 'about') => {
    setActiveSection(section);
  };

  return (
    <main
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: COLORS.outerBg }}
    >
      {/* Header — fixed height */}
      <header
        className="w-full flex items-center justify-between px-3 sm:px-6 shrink-0 gap-3"
        style={{ height: 56, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(107,191,237,0.15)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <img src="/icon.png" alt="Flappy Base" width={36} height={36} className="rounded-lg shrink-0" style={{ objectFit: 'cover' }} />
          <h1 className="text-lg sm:text-xl tracking-tight truncate">
            <span style={{ color: 'var(--game-sky-top)' }}>Flappy</span>{' '}
            <span className="text-white">Base</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HeaderWalletButton />
        </div>
      </header>

      {/* Tab navigation */}
      <nav
        className="w-full flex items-center gap-2 shrink-0 px-3 sm:px-6"
        style={{ height: 48, borderBottom: '1px solid rgba(107,191,237,0.15)' }}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {(['play', 'leaderboard', 'about'] as const).map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => handleNavigate(sec)}
              className="px-3 sm:px-4 py-1.5 text-sm font-medium rounded-lg transition capitalize"
              style={{
                background: activeSection === sec ? 'var(--game-sky-top)' : 'transparent',
                color: activeSection === sec ? COLORS.outerBg : 'rgba(255,255,255,0.7)',
              }}
            >
              {sec}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs hidden sm:block" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Best:{' '}
          <span style={{ color: 'var(--game-sky-top)' }}>
            {bestLoading ? '…' : best}
          </span>
        </div>
      </nav>

      {/* Main content area */}
      <div className="flex-1 w-full relative overflow-hidden">
        {activeSection === 'play' && (
          <PlayArea
            canvasRef={canvasRef}
            phase={phase}
            score={score}
            best={best}
            address={address}
            isConnected={isConnected}
            username={username}
            setUsername={setUsername}
            submitStatus={submitStatus}
            submitError={submitError}
            submitted={submitted}
            txHash={txHash}
            onSubmit={handleSubmitScore}
            onPlayAgain={resetGame}
            bestLoading={bestLoading}
          />
        )}

        {activeSection === 'leaderboard' && (
          <div className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
            <LeaderboardPanel />
          </div>
        )}

        {activeSection === 'about' && (
          <div className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
            <div
              className="w-full max-w-[500px] rounded-2xl p-6 text-center"
              style={{ background: COLORS.panelBg, color: '#1A3A6E' }}
            >
              <h2 className="text-2xl mb-3">About Flappy Base</h2>
              <p className="text-sm mb-4 leading-relaxed opacity-90">
                A classic Flappy Bird clone built on Base. Play, submit your high score on-chain, and compete on the leaderboard.
              </p>
              <div className="space-y-1 text-xs opacity-75">
                <p>Built with Next.js, wagmi, viem</p>
                <p>Smart contract deployed on Base mainnet</p>
                <p className="mt-2">
                  <a href="https://basescan.org" target="_blank" rel="noreferrer" style={{ color: '#1E5CB3', textDecoration: 'underline' }}>
                    View contract on Basescan
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer
        className="w-full text-center text-xs shrink-0 px-3"
        style={{ height: 36, lineHeight: '36px', color: 'rgba(255,255,255,0.5)' }}
      >
        Spacebar / Click / Tap to flap · Enter to restart
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Play Area — handles IDLE / PLAYING / DEAD overlays as React HTML overlays
// (so Connect Wallet and Submit Score buttons are real interactive buttons)
// ---------------------------------------------------------------------------
interface PlayAreaProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  phase: GamePhase;
  score: number;
  best: number;
  address: string | undefined;
  isConnected: boolean;
  username: string;
  setUsername: (v: string) => void;
  submitStatus: 'idle' | 'sending' | 'success' | 'error';
  submitError: string;
  submitted: boolean;
  txHash: string;
  onSubmit: () => void;
  onPlayAgain: () => void;
  bestLoading: boolean;
}

function PlayArea({
  canvasRef,
  phase,
  score,
  best,
  address,
  isConnected,
  username,
  setUsername,
  submitStatus,
  submitError,
  submitted,
  txHash,
  onSubmit,
  onPlayAgain,
  bestLoading,
}: PlayAreaProps) {
  const trimmed = username.trim();
  const usernameValid = /^[a-zA-Z0-9]{1,20}$/.test(trimmed);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-2 sm:p-4"
      style={{
        background: `radial-gradient(ellipse at center, #122a4a 0%, ${COLORS.outerBg} 70%)`,
      }}
    >
      <div
        className="relative rounded-2xl overflow-hidden w-full h-full"
        style={{
          maxWidth: 'min(100%, calc((100vh - 200px) * 0.75))',
          maxHeight: 'calc(100vh - 140px)',
          aspectRatio: '3 / 4',
          background: `linear-gradient(180deg, ${COLORS.skyTop} 0%, ${COLORS.skyBottom} 100%)`,
          boxShadow: `0 0 80px rgba(107,191,237,0.25), 0 0 0 3px rgba(107,191,237,0.2)`,
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Flappy Base game"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            borderRadius: '1rem',
            touchAction: 'manipulation',
          }}
        />

        {/* IDLE overlay: Tap to start */}
        {phase === 'IDLE' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div
              className="text-4xl sm:text-5xl md:text-6xl font-bold"
              style={{
                fontFamily: '"Lilita One", "Fredoka One", system-ui, sans-serif',
                color: '#FFFFFF',
                WebkitTextStroke: '4px #1A3A8F',
                textShadow: '0 2px 0 #0A2050',
                letterSpacing: 0,
              }}
            >
              Flappy Base
            </div>
            <div
              className="text-base sm:text-lg"
              style={{
                fontFamily: '"Lilita One", "Fredoka One", system-ui, sans-serif',
                color: '#FFFFFF',
                WebkitTextStroke: '2px #1A3A8F',
              }}
            >
              Tap to Flap. How far can you go?
            </div>
          </div>
        )}

        {/* Game Over overlay — HTML so buttons are interactive */}
        {phase === 'DEAD' && (
          <div
            className="absolute inset-0 flex items-center justify-center p-3"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          >
            <div
              className="w-full max-w-[320px] rounded-2xl p-5 text-center"
              style={{
                background: COLORS.panelBg,
                color: '#1A3A6E',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              <h2
                className="text-3xl sm:text-4xl mb-2"
                style={{
                  fontFamily: '"Lilita One", "Fredoka One", system-ui, sans-serif',
                  color: '#FF3B3B',
                  WebkitTextStroke: '3px #1A3A8F',
                  textShadow: '0 2px 0 #0A2050',
                }}
              >
                Game Over
              </h2>
              <p
                className="text-xl sm:text-2xl"
                style={{ fontFamily: '"Lilita One", system-ui, sans-serif' }}
              >
                Score: <span style={{ color: '#1E5CB3' }}>{score}</span>
              </p>
              <p
                className="text-sm opacity-75"
                style={{ fontFamily: '"Lilita One", system-ui, sans-serif' }}
              >
                Best: {bestLoading ? '…' : best}
              </p>

              {/* Submit score section */}
              {!submitted && submitStatus !== 'success' && (
                <div className="mt-4 space-y-2 text-left">
                  {isConnected ? (
                    <>
                      <p className="text-center text-xs opacity-70">
                        Connected: <span className="font-mono">{shortAddr(address)}</span>
                      </p>
                      <input
                        type="text"
                        value={username}
                        maxLength={20}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Username (1-20 alphanumeric)"
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none bg-white/80 text-[#1A3A6E]"
                        style={{
                          border: '1px solid rgba(26, 58, 110, 0.3)',
                          fontFamily: 'system-ui, sans-serif',
                        }}
                      />
                      <button
                        type="button"
                        onClick={onSubmit}
                        disabled={!usernameValid || submitStatus === 'sending'}
                        className="w-full rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                        style={{
                          background: COLORS.buttonBlue,
                          fontFamily: '"Lilita One", system-ui, sans-serif',
                        }}
                      >
                        {submitStatus === 'sending' ? 'Submitting…' : 'Submit Score'}
                      </button>
                    </>
                  ) : (
                    <div className="flex justify-center">
                      <ConnectWallet />
                    </div>
                  )}
                  {submitStatus === 'error' && submitError && (
                    <p className="text-center text-xs text-red-600">{submitError}</p>
                  )}
                </div>
              )}

              {submitStatus === 'success' && txHash && (
                <div className="mt-3 space-y-1 text-sm">
                  <p className="font-bold text-green-700">Score submitted!</p>
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                    style={{ color: '#1E5CB3' }}
                  >
                    View on Basescan ↗
                  </a>
                </div>
              )}

              <button
                type="button"
                onClick={onPlayAgain}
                className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                style={{
                  background: 'rgba(26, 58, 110, 0.1)',
                  color: '#1A3A6E',
                  fontFamily: '"Lilita One", system-ui, sans-serif',
                }}
              >
                Play Again
              </button>
              <p className="mt-2 text-[10px] opacity-60">
                Press Enter or click here to restart
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header wallet button — shows "Connect" when disconnected, address when connected
// ---------------------------------------------------------------------------
function HeaderWalletButton() {
  const { address, isConnected } = useAccount();
  if (isConnected && address) {
    return (
      <div
        className="rounded-lg px-3 py-1.5 text-xs font-medium font-mono"
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(107,191,237,0.3)',
          color: 'var(--game-sky-top)',
        }}
      >
        {shortAddr(address)}
      </div>
    );
  }
  return (
    <div className="wallet-connect-wrapper">
      <ConnectWallet />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
function makeClouds(W: number, H: number): { x: number; y: number; r: number }[][] {
  const out: { x: number; y: number; r: number }[][] = [];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const cx = (i / count) * W * 1.4 + rand(-40, 40);
    const cy = rand(H * 0.32, H * 0.7);
    const base = rand(20, 32);
    const cluster: { x: number; y: number; r: number }[] = [];
    const n = 4 + Math.floor(rand(0, 3));
    for (let j = 0; j < n; j++) {
      cluster.push({
        x: cx + rand(-base * 1.6, base * 1.6),
        y: cy + rand(-base * 0.4, base * 0.4),
        r: base + rand(-6, 8),
      });
    }
    out.push(cluster);
  }
  return out;
}

function drawClouds(ctx: CanvasRenderingContext2D, W: number, H: number, clouds: { x: number; y: number; r: number }[][]) {
  ctx.save();
  ctx.fillStyle = COLORS.cloud;
  for (const cluster of clouds) {
    for (const c of cluster) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, COLORS.skyTop);
  grad.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, groundH: number) {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, H - groundH, W, groundH);
  ctx.fillStyle = COLORS.groundTop;
  ctx.fillRect(0, H - groundH, W, 4);
  ctx.fillStyle = COLORS.groundTop;
  for (let x = 0; x < W; x += 18) {
    ctx.fillRect(x, H - groundH, 2, -4);
  }
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  topH: number,
  botY: number,
  H: number,
  groundH: number,
  pipeW: number,
) {
  const capH = pipeW * 0.28;
  const capExtra = 10;
  const highlightW = Math.max(10, pipeW * 0.18);

  ctx.fillStyle = COLORS.pipeBody;
  ctx.fillRect(x, 0, pipeW, topH);
  ctx.fillStyle = COLORS.pipeHighlight;
  ctx.fillRect(x, 0, highlightW, topH);

  ctx.fillStyle = COLORS.pipeCap;
  ctx.fillRect(x - capExtra, topH - capH, pipeW + capExtra * 2, capH);
  ctx.fillStyle = COLORS.pipeHighlight;
  ctx.fillRect(x - capExtra, topH - capH, highlightW, capH);

  ctx.fillStyle = COLORS.pipeBody;
  ctx.fillRect(x, botY, pipeW, H - groundH - botY);
  ctx.fillStyle = COLORS.pipeHighlight;
  ctx.fillRect(x, botY, highlightW, H - groundH - botY);

  ctx.fillStyle = COLORS.pipeCap;
  ctx.fillRect(x - capExtra, botY, pipeW + capExtra * 2, capH);
  ctx.fillStyle = COLORS.pipeHighlight;
  ctx.fillRect(x - capExtra, botY, highlightW, capH);
}

function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.lineTo(-46, 0);
  ctx.moveTo(-24, -8);
  ctx.lineTo(-38, -8);
  ctx.moveTo(-24, 8);
  ctx.lineTo(-38, 8);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(-3, 1);
  ctx.rotate(-0.35);
  ctx.fillStyle = COLORS.birdWing;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = COLORS.birdBody;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C9B98E';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-6, -8, 5, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.birdBeak;
  ctx.beginPath();
  ctx.moveTo(12, -3);
  ctx.lineTo(22, 0);
  ctx.lineTo(12, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#CC6600';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, 1);
  ctx.lineTo(20, 1);
  ctx.stroke();

  ctx.fillStyle = COLORS.birdEye;
  ctx.beginPath();
  ctx.arc(6, -5, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.birdPupil;
  ctx.beginPath();
  ctx.arc(7.5, -4.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(8.2, -5.2, 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pipes: Pipe[],
  clouds: { x: number; y: number; r: number }[][],
  birdY: number,
  birdRot: number,
  phase: GamePhase,
  score: number,
) {
  const pipeW = Math.max(60, Math.min(110, W * 0.13));
  const gap = Math.max(160, Math.min(280, H * 0.28));
  const groundH = Math.max(50, Math.min(110, H * 0.11));
  const birdR = Math.max(14, Math.min(26, H * 0.028));
  const birdX = W * 0.25;

  drawSky(ctx, W, H);
  drawClouds(ctx, W, H, clouds);

  for (const p of pipes) {
    const topH = p.gapY - gap / 2;
    const botY = p.gapY + gap / 2;
    drawPipe(ctx, p.x, topH, botY, H, groundH, pipeW);
  }

  const birdScale = birdR / 18;
  drawBird(ctx, birdX, birdY, birdRot, birdScale);

  drawGround(ctx, W, H, groundH);

  if (phase === 'PLAYING') {
    const scoreSize = Math.max(36, Math.min(72, H * 0.1));
    ctx.font = `${scoreSize}px "Lilita One", "Fredoka One", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, scoreSize * 0.11);
    ctx.strokeStyle = COLORS.titleStroke;
    ctx.strokeText(String(score), W / 2, Math.max(40, H * 0.08));
    ctx.fillStyle = COLORS.titleFill;
    ctx.fillText(String(score), W / 2, Math.max(40, H * 0.08));
  }
}

// ---------------------------------------------------------------------------
// Leaderboard panel
// ---------------------------------------------------------------------------
function LeaderboardPanel() {
  const [rows, setRows] = useState<Array<{ username: string; player: string; score: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/contract');
        if (!mod.CONTRACT_ADDRESS) {
          setError('Contract not configured');
          setLoading(false);
          return;
        }
        const count = await mod.getScoresCountContract();
        const total = Number(count);
        const limit = Math.min(20, total);
        const offset = total > limit ? total - limit : 0;
        const data = await mod.getScoresContract(offset, limit);
        if (!cancelled) {
          const sorted = [...(data as unknown as Array<{ username: string; player: string; score: bigint }>)].sort((a, b) => Number(b.score - a.score));
          setRows(
            sorted.map((r) => ({
              username: r.username,
              player: r.player,
              score: Number(r.score),
            })),
          );
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Leaderboard fetch failed:', e);
          setError('Could not load leaderboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="w-full max-w-[500px] max-h-full rounded-2xl p-5 overflow-y-auto"
      style={{ background: COLORS.panelBg, color: '#1A3A6E' }}
    >
      <h2 className="text-2xl mb-3 text-center">Leaderboard</h2>
      {loading ? (
        <p className="text-center text-sm opacity-70 py-4">Loading…</p>
      ) : error ? (
        <p className="text-center text-sm opacity-70 py-4">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm opacity-70 py-4">No scores yet — be the first!</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li
              key={`${r.player}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'transparent' }}
            >
              <span className="w-6 font-mono text-xs opacity-70">{i + 1}</span>
              <span className="flex-1 truncate">{r.username}</span>
              <span className="font-mono text-xs opacity-70">{shortAddr(r.player)}</span>
              <span className="w-10 text-right" style={{ color: '#1E5CB3' }}>{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
