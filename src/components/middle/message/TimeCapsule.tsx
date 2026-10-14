import { memo, useEffect, useRef, useState } from '@teact';

import type { ApiMessage } from '../../../api/types';
import type { FrostScene } from './helpers/frost';

import { requestMeasure, requestMutation } from '../../../lib/fasterdom/fasterdom';
import buildClassName from '../../../util/buildClassName';
import { getServerTime } from '../../../util/serverTime';
import { createFrostScene, drawFlakes, drawFrost } from './helpers/frost';

import useInterval from '../../../hooks/schedulers/useInterval';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import styles from './TimeCapsule.module.scss';

type OwnProps = {
  message: ApiMessage;
};

type CapsuleState = 'sealed' | 'opening' | 'open';

const TICK_INTERVAL = 1000;
const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = 3600;
const SECONDS_IN_DAY = 86400;
const FRESH_PERIOD = 3;
const FREEZE_DURATION = 1600;
const OPEN_DURATION = 1300;
const DARK_THEME_CLASS = 'theme-dark';
const FROST_COLORS = {
  light: { color: 'rgba(150, 196, 238, 0.8)', glowColor: 'rgba(214, 236, 255, 0.6)' },
  dark: { color: 'rgba(226, 241, 255, 0.9)', glowColor: 'rgba(120, 186, 255, 0.35)' },
};

const TimeCapsule = ({ message }: OwnProps) => {
  const lang = useLang();
  const rootRef = useRef<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>();
  const { openDate } = message.timeCapsule!;

  const [secondsLeft, setSecondsLeft] = useState(() => openDate - getServerTime());
  const [state, setState] = useState<CapsuleState>(() => (secondsLeft > 0 ? 'sealed' : 'open'));
  // A capsule sent just now freezes over in front of the sender
  const [isFreezing, setIsFreezing] = useState(
    () => secondsLeft > 0 && message.isOutgoing && getServerTime() - message.date < FRESH_PERIOD,
  );

  const timingRef = useRef<{ startedAt: number; openedAt?: number }>({ startedAt: performance.now() });

  useInterval(() => {
    setSecondsLeft(openDate - getServerTime());
  }, state === 'sealed' ? TICK_INTERVAL : undefined);

  useEffect(() => {
    if (!isFreezing) return undefined;

    const timeout = setTimeout(() => setIsFreezing(false), FREEZE_DURATION);
    return () => clearTimeout(timeout);
  }, [isFreezing]);

  useEffect(() => {
    if (state !== 'sealed' || secondsLeft > 0) return undefined;

    timingRef.current.openedAt = performance.now();
    setState('opening');
    const timeout = setTimeout(() => setState('open'), OPEN_DURATION);
    return () => clearTimeout(timeout);
  }, [secondsLeft, state]);

  const runFrost = useLastCallback(() => {
    const canvas = canvasRef.current;
    const bubble = rootRef.current?.parentElement;
    if (!canvas || !bubble) return undefined;

    let frameId: number | undefined;
    let isStopped = false;
    const isGrowing = isFreezing;

    requestMeasure(() => {
      const { width, height } = bubble.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      requestMutation(() => {
        if (isStopped) return;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);

        const scene = createFrostScene(width, height, message.id);
        const cache = createCache(scene, dpr);
        let lastAt = performance.now();

        const draw = (now: number) => {
          const dt = Math.min(0.05, (now - lastAt) / 1000);
          lastAt = now;
          const { startedAt, openedAt } = timingRef.current;
          const isDark = document.documentElement.classList.contains(DARK_THEME_CLASS);
          const colors = isDark ? FROST_COLORS.dark : FROST_COLORS.light;
          const growTime = isGrowing ? now - startedAt : Infinity;

          if (openedAt) {
            // Frost thaws from the center to the edges
            const progress = Math.min(1, (now - openedAt) / OPEN_DURATION);
            const thawRadius = easeOut(progress) * Math.hypot(width, height) * 0.6;
            drawFrost(ctx, scene, { time: Infinity, thawRadius, ...colors });
            drawFlakes(ctx, scene, progress * 1.4, dt, colors.color);
            if (progress < 1 && !isStopped) frameId = requestAnimationFrame(draw);
            return;
          }

          if (growTime < scene.growDuration) {
            drawFrost(ctx, scene, { time: growTime, ...colors });
          } else {
            // Grown crystals are drawn once, only glints twinkle on top
            if (cache.isDark !== isDark) {
              cache.render(colors, isDark);
            }
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(cache.canvas, 0, 0, width, height);
            drawGlints(ctx, scene, now);
          }

          if (!isStopped) frameId = requestAnimationFrame(draw);
        };

        frameId = requestAnimationFrame(draw);
      });
    });

    return () => {
      isStopped = true;
      if (frameId) cancelAnimationFrame(frameId);
    };
  });

  const isOpen = state === 'open';

  useEffect(() => (isOpen ? undefined : runFrost()), [isOpen, runFrost]);

  if (isOpen) return undefined;

  return (
    <div
      ref={rootRef}
      className={buildClassName(
        styles.root,
        state === 'sealed' && styles.sealed,
        state === 'opening' && styles.opening,
        isFreezing && styles.freezing,
      )}
    >
      <div className={styles.tint} />
      <canvas ref={canvasRef} className={styles.frost} />
      <div className={styles.pill}>
        <svg className={styles.flake} viewBox="0 0 24 24" aria-hidden>
          <path d={SNOWFLAKE_PATH} />
        </svg>
        <span className={styles.label}>
          {lang('TimeCapsuleUnlocksIn', {
            time: (
              <span className={styles.digits}>
                {formatCountdown(Math.max(Math.ceil(secondsLeft), 0)).split('').map((char, i) => (
                  <span key={`${i}-${char}`} className={styles.digit}>{char}</span>
                ))}
              </span>
            ),
          }, { withNodes: true })}
        </span>
      </div>
    </div>
  );
};

const SNOWFLAKE_PATH = 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2M4 10.5l3.5-.5L6 6.5'
  + 'M20 13.5l-3.5.5 1.5 3.5M4 13.5l3.5.5L6 17.5M20 10.5l-3.5-.5L18 6.5';

function createCache(scene: FrostScene, dpr: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.width * dpr);
  canvas.height = Math.round(scene.height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const cache = {
    canvas,
    isDark: undefined as boolean | undefined,
    render(colors: { color: string; glowColor: string }, isDark: boolean) {
      // Glints are skipped here by drawing at a time before any of them appears
      drawFrost(ctx, { ...scene, glints: [] }, { time: Infinity, ...colors });
      cache.isDark = isDark;
    },
  };
  return cache;
}

function drawGlints(ctx: CanvasRenderingContext2D, scene: FrostScene, now: number) {
  drawFrost(ctx, { ...scene, segments: [] }, {
    time: now, color: 'transparent', glowColor: 'transparent', noClear: true,
  });
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

function formatCountdown(seconds: number) {
  if (seconds >= SECONDS_IN_DAY) {
    const days = Math.floor(seconds / SECONDS_IN_DAY);
    const hours = Math.floor((seconds % SECONDS_IN_DAY) / SECONDS_IN_HOUR);
    return `${days}d ${hours}h`;
  }

  const hours = Math.floor(seconds / SECONDS_IN_HOUR);
  const minutes = Math.floor((seconds % SECONDS_IN_HOUR) / SECONDS_IN_MINUTE);
  return [hours, minutes, seconds % SECONDS_IN_MINUTE].map((value) => String(value).padStart(2, '0')).join(':');
}

export default memo(TimeCapsule);
