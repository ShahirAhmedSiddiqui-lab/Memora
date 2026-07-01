'use client';

import * as React from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { ArrowRight, Bot, Layers, Sparkles } from 'lucide-react';
import { BrandLockup } from './brand-lockup';

export function MarketingLanding() {
  const rotatingLines = React.useMemo(
    () => [
      'Recall the exact idea before it disappears.',
      'Turn scattered links into a searchable memory.',
      'Ask your saved knowledge like it already knows you.',
    ],
    []
  );
  const [typedLineIndex, setTypedLineIndex] = React.useState(0);
  const [typedText, setTypedText] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.35);
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const rawShiftX = useMotionValue(0);
  const rawShiftY = useMotionValue(0);
  const rotateX = useSpring(rawRotateX, { stiffness: 90, damping: 22, mass: 0.7 });
  const rotateY = useSpring(rawRotateY, { stiffness: 90, damping: 22, mass: 0.7 });
  const shiftX = useSpring(rawShiftX, { stiffness: 80, damping: 24, mass: 0.9 });
  const shiftY = useSpring(rawShiftY, { stiffness: 80, damping: 24, mass: 0.9 });
  const rawGlowDriftX = useMotionValue(0);
  const rawGlowDriftY = useMotionValue(0);
  const glowDriftX = useSpring(rawGlowDriftX, { stiffness: 55, damping: 20, mass: 1 });
  const glowDriftY = useSpring(rawGlowDriftY, { stiffness: 55, damping: 20, mass: 1 });
  const shaderGlow = useMotionTemplate`radial-gradient(circle at ${pointerX}00% ${pointerY}00%, rgba(0,0,0,0.12), rgba(0,0,0,0.04) 18%, rgba(255,255,255,0.92) 44%, rgba(255,255,255,0) 70%)`;
  const shaderMesh = useMotionTemplate`radial-gradient(circle at ${pointerX}00% ${pointerY}00%, rgba(255,255,255,0.86), rgba(255,255,255,0) 34%), linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(246,246,247,0.98) 100%)`;
  const shaderLines = useMotionTemplate`radial-gradient(circle at ${pointerX}00% ${pointerY}00%, rgba(15,23,42,0.12), rgba(15,23,42,0.02) 24%, rgba(255,255,255,0) 55%), linear-gradient(115deg, rgba(15,23,42,0.08), rgba(255,255,255,0) 34%, rgba(15,23,42,0.06) 72%, rgba(255,255,255,0.22))`;

  React.useEffect(() => {
    const currentLine = rotatingLines[typedLineIndex] ?? '';
    const isLineComplete = typedText === currentLine;
    const isLineCleared = typedText.length === 0;

    const timeout = window.setTimeout(
      () => {
        if (!isDeleting && !isLineComplete) {
          setTypedText(currentLine.slice(0, typedText.length + 1));
          return;
        }

        if (!isDeleting && isLineComplete) {
          setIsDeleting(true);
          return;
        }

        if (isDeleting && !isLineCleared) {
          setTypedText((prev) => prev.slice(0, -1));
          return;
        }

        setIsDeleting(false);
        setTypedLineIndex((prev) => (prev + 1) % rotatingLines.length);
      },
      !isDeleting && isLineComplete ? 1500 : isDeleting ? 28 : 48
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isDeleting, rotatingLines, typedLineIndex, typedText]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      rawGlowDriftX.set((Math.random() - 0.5) * 42);
      rawGlowDriftY.set((Math.random() - 0.5) * 28);
    }, 2400);

    return () => {
      window.clearInterval(interval);
    };
  }, [rawGlowDriftX, rawGlowDriftY]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = (event.clientX - bounds.left) / bounds.width;
    const nextY = (event.clientY - bounds.top) / bounds.height;
    const clampedX = Math.max(0, Math.min(1, nextX));
    const clampedY = Math.max(0, Math.min(1, nextY));

    pointerX.set(clampedX);
    pointerY.set(clampedY);
    rawRotateX.set((0.5 - clampedY) * 8);
    rawRotateY.set((clampedX - 0.5) * 10);
    rawShiftX.set((clampedX - 0.5) * 26);
    rawShiftY.set((clampedY - 0.5) * 18);
    rawGlowDriftX.set((clampedX - 0.5) * 80);
    rawGlowDriftY.set((clampedY - 0.5) * 56);
  }, [pointerX, pointerY, rawGlowDriftX, rawGlowDriftY, rawRotateX, rawRotateY, rawShiftX, rawShiftY]);

  const handlePointerLeave = React.useCallback(() => {
    pointerX.set(0.5);
    pointerY.set(0.35);
    rawRotateX.set(0);
    rawRotateY.set(0);
    rawShiftX.set(0);
    rawShiftY.set(0);
    rawGlowDriftX.set(0);
    rawGlowDriftY.set(0);
  }, [pointerX, pointerY, rawGlowDriftX, rawGlowDriftY, rawRotateX, rawRotateY, rawShiftX, rawShiftY]);

  return (
    <div
      className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-white font-sans text-neutral-900 antialiased"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <motion.div className="absolute inset-0" style={{ background: shaderMesh }} />
        <motion.div className="absolute inset-0 opacity-90 mix-blend-screen" style={{ background: shaderGlow }} />
        <motion.div className="absolute inset-0 opacity-70 mix-blend-multiply" style={{ background: shaderLines }} />
        <motion.div
          className="memora-hero-depth absolute inset-x-[-12%] top-[12%] h-[72vh] rounded-full opacity-80 blur-3xl"
          style={{ x: glowDriftX, y: glowDriftY }}
        />
        <motion.div
          className="animate-memora-hex-drift absolute left-1/2 top-1/2 h-[140vh] w-[140vw] -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d]"
          style={{
            x: shiftX,
            y: shiftY,
            rotateX,
            rotateY,
          }}
        >
          <svg
            className="h-full w-full opacity-[0.18]"
            viewBox="0 0 1600 1200"
            fill="none"
          >
            <defs>
              <linearGradient id="hexStroke" x1="0" y1="0" x2="1600" y2="1200" gradientUnits="userSpaceOnUse">
                <stop stopColor="#000000" />
                <stop offset="0.5" stopColor="#6b6b6b" />
                <stop offset="1" stopColor="#ffffff" />
              </linearGradient>
              <radialGradient id="hexFocus" cx="50%" cy="35%" r="55%">
                <stop stopColor="#000000" stopOpacity="0.22" />
                <stop offset="0.45" stopColor="#7a7a7a" stopOpacity="0.12" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path
              d="M210 196L314 136L418 196V316L314 376L210 316V196ZM418 196L522 136L626 196V316L522 376L418 316V196ZM626 196L730 136L834 196V316L730 376L626 316V196ZM834 196L938 136L1042 196V316L938 376L834 316V196ZM314 376L418 316L522 376V496L418 556L314 496V376ZM522 376L626 316L730 376V496L626 556L522 496V376ZM730 376L834 316L938 376V496L834 556L730 496V376ZM938 376L1042 316L1146 376V496L1042 556L938 496V376ZM210 556L314 496L418 556V676L314 736L210 676V556ZM418 556L522 496L626 556V676L522 736L418 676V556ZM626 556L730 496L834 556V676L730 736L626 676V556ZM834 556L938 496L1042 556V676L938 736L834 676V556Z"
              stroke="url(#hexStroke)"
              strokeWidth="2"
            />
            <path
              d="M314 136L730 136M418 556L938 556M210 316L522 496M522 196L834 376M834 196L1146 376M314 736L626 556M626 736L938 556"
              stroke="#000000"
              strokeOpacity="0.18"
              strokeWidth="1.5"
            />
            <ellipse cx="800" cy="420" rx="430" ry="290" fill="url(#hexFocus)" />
          </svg>
        </motion.div>
        <motion.div
          className="absolute left-1/2 top-1/2 h-[132vh] w-[132vw] -translate-x-1/2 -translate-y-1/2 opacity-[0.2] blur-[1px]"
          style={{
            x: shiftX,
            y: shiftY,
            rotateX,
            rotateY,
            scale: 1.035,
          }}
        >
          <svg className="h-full w-full" viewBox="0 0 1600 1200" fill="none">
            <path
              d="M180 164L314 88L448 164V324L314 400L180 324V164ZM448 164L582 88L716 164V324L582 400L448 324V164ZM716 164L850 88L984 164V324L850 400L716 324V164ZM984 164L1118 88L1252 164V324L1118 400L984 324V164ZM314 400L448 324L582 400V560L448 636L314 560V400ZM582 400L716 324L850 400V560L716 636L582 560V400ZM850 400L984 324L1118 400V560L984 636L850 560V400ZM1118 400L1252 324L1386 400V560L1252 636L1118 560V400ZM180 636L314 560L448 636V796L314 872L180 796V636ZM448 636L582 560L716 636V796L582 872L448 796V636ZM716 636L850 560L984 636V796L850 872L716 796V636ZM984 636L1118 560L1252 636V796L1118 872L984 796V636Z"
              stroke="rgba(15,23,42,0.22)"
              strokeWidth="1.35"
            />
          </svg>
        </motion.div>
        <motion.div
          className="animate-memora-orb-pulse absolute left-[16%] top-[20%] h-28 w-28 rounded-full bg-white/70 blur-3xl"
          style={{ x: glowDriftX }}
        />
        <motion.div
          className="animate-memora-orb-pulse absolute bottom-[18%] right-[14%] h-32 w-32 rounded-full bg-neutral-900/10 blur-3xl"
          style={{ y: glowDriftY }}
        />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto flex w-full max-w-7xl shrink-0 items-center justify-between border-b border-neutral-100/90 px-6 py-6 backdrop-blur-sm"
      >
        <BrandLockup size="md" />
        <div className="flex items-center space-x-4">
          <motion.button
            onClick={() => {
              window.location.assign('/login');
            }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="text-xs font-semibold text-neutral-600 hover:text-neutral-950 transition-premium font-mono"
          >
            LOGIN
          </motion.button>
          <motion.button
            onClick={() => {
              window.location.assign('/sign-up');
            }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            className="px-4 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-extrabold rounded-full transition-premium font-mono border border-neutral-950 shadow-xs"
          >
            GET STARTED
          </motion.button>
        </div>
      </motion.header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-1 flex-col justify-center space-y-12 px-6 py-12 text-center md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          className="space-y-4"
        >
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-neutral-950 font-sans max-w-3xl mx-auto leading-none">
            Save everything.
            <br />
            Find it in seconds.
          </h1>
          <div className="mx-auto flex min-h-[2rem] max-w-2xl items-center justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500 md:text-xs">
              {typedText}
              <span className="ml-1 inline-block h-[0.95em] w-px animate-pulse bg-neutral-900 align-[-0.1em]" />
            </p>
          </div>
          <p className="text-sm md:text-base text-neutral-500 max-w-lg mx-auto leading-relaxed">
            People save YouTube videos, social links, articles, PDFs, screenshots, and notes - then lose
            them forever. Memora listens, transcribes, and maps your knowledge instantly.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <motion.button
            onClick={() => {
              window.location.assign('/sign-up');
            }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            className="w-full sm:w-auto bg-neutral-950 hover:bg-neutral-850 text-white text-sm font-bold px-8 py-3 rounded-xl transition-premium shadow-lg flex items-center justify-center space-x-2 cursor-pointer"
          >
            <span>Explore My Brain Vault</span>
            <ArrowRight className="w-4 h-4 text-white" />
          </motion.button>
          <motion.button
            onClick={() => {
              window.location.assign('/sign-up');
            }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            className="w-full sm:w-auto bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-sm font-semibold px-6 py-3 rounded-xl shadow-xs transition-premium cursor-pointer"
          >
            Quick Capture Link
          </motion.button>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 text-left">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.22 }}
            whileHover={{ y: -4 }}
            className="bg-neutral-50 border border-neutral-200/80 p-6 rounded-2xl space-y-3 shadow-2xs hover:border-neutral-300 transition-premium"
          >
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center border border-neutral-200 shadow-2xs">
              <Sparkles className="w-4 h-4 text-neutral-800" />
            </div>
            <div>
              <h3 className="font-extrabold text-neutral-900 text-xs tracking-wider uppercase font-mono">1. Auto-Synthesis</h3>
              <p className="text-neutral-500 text-[11px] leading-relaxed mt-1">
                Gemini 2.5 Flash inspects links, PDFs, screenshots, and audio recordings, drawing raw main
                takeaways, executive summaries, and action steps in real-time.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
            whileHover={{ y: -4 }}
            className="bg-neutral-50 border border-neutral-200/80 p-6 rounded-2xl space-y-3 shadow-2xs hover:border-neutral-300 transition-premium"
          >
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center border border-neutral-200 shadow-2xs">
              <Layers className="w-4 h-4 text-neutral-800" />
            </div>
            <div>
              <h3 className="font-extrabold text-neutral-900 text-xs tracking-wider uppercase font-mono">2. Recall Flashcards</h3>
              <p className="text-neutral-500 text-[11px] leading-relaxed mt-1">
                AI automatically generates custom dynamic learning cards with interactive flip states to test your
                recall of everything you saved.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.34 }}
            whileHover={{ y: -4 }}
            className="bg-neutral-50 border border-neutral-200/80 p-6 rounded-2xl space-y-3 shadow-2xs hover:border-neutral-300 transition-premium"
          >
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center border border-neutral-200 shadow-2xs">
              <Bot className="w-4 h-4 text-neutral-800" />
            </div>
            <div>
              <h3 className="font-extrabold text-neutral-900 text-xs tracking-wider uppercase font-mono">3. Chat with Knowledge</h3>
              <p className="text-neutral-500 text-[11px] mt-1 leading-relaxed">
                Ask, &ldquo;What restaurant startup idea was saved 3 months ago?&rdquo; and semantic matching locates the exact
                asset instantly.
              </p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="pt-6 pb-2 border-t border-neutral-100 flex flex-wrap items-center justify-center gap-6 text-[10px] text-neutral-400 font-mono tracking-widest uppercase"
        >
          <span>SAVING OPTIONS:</span>
          <span className="text-neutral-900 font-bold">&bull; YouTube videos</span>
          <span className="text-neutral-900 font-bold">&bull; PDF Papers</span>
          <span className="text-neutral-900 font-bold">&bull; Screenshots & images</span>
          <span className="text-neutral-900 font-bold">&bull; Voice Notes / MP3</span>
          <span className="text-neutral-900 font-bold">&bull; Social links</span>
          <span className="text-neutral-900 font-bold">&bull; Articles & web-text</span>
        </motion.div>
      </main>

      <footer className="animate-memora-fade-in py-6 border-t border-neutral-100 text-center text-[10px] text-neutral-400 font-mono tracking-widest shrink-0">
        MEMORA CORE &copy; {new Date().getFullYear()} &bull; POWERED BY GOOGLE GEMINI 2.5 FLASH
      </footer>
    </div>
  );
}
