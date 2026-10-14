// Procedural window frost: hexagonal dendrites grow from the bubble edges inwards and thaw from the center

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  birth: number;
  duration: number;
  width: number;
  centerDistance: number;
};

type Glint = {
  x: number;
  y: number;
  birth: number;
  phase: number;
  size: number;
};

type Flake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
};

export type FrostScene = {
  width: number;
  height: number;
  segments: Segment[];
  glints: Glint[];
  flakes: Flake[];
  growDuration: number;
};

const SEED_SPACING = 52;
const GROWTH_SPEED = 0.16; // px per ms
const BRANCH_ANGLE = Math.PI / 3;
const BRANCH_POSITIONS = [0.3, 0.55, 0.8];
const MAX_DEPTH = 3;
const GLINT_CHANCE = 0.05;
const FLAKE_COUNT = 26;
const THAW_EDGE = 36;

export function createFrostScene(width: number, height: number, seed = 1): FrostScene {
  const random = createRandom(seed);
  const segments: Segment[] = [];
  const glints: Glint[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const reach = Math.min(width, height) * 0.5;

  function grow(x: number, y: number, angle: number, length: number, depth: number, birth: number) {
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    const duration = length / GROWTH_SPEED;
    segments.push({
      x1: x,
      y1: y,
      x2,
      y2,
      birth,
      duration,
      width: 0.45 + depth * 0.3,
      centerDistance: Math.hypot((x + x2) / 2 - centerX, (y + y2) / 2 - centerY),
    });

    if (random() < GLINT_CHANCE * (depth + 1)) {
      glints.push({
        x: x2, y: y2, birth: birth + duration, phase: random() * Math.PI * 2, size: 1.5 + random() * 2.5,
      });
    }

    if (depth === 0) return;

    BRANCH_POSITIONS.forEach((position) => {
      if (random() < 0.4) return;
      const bx = x + (x2 - x) * position;
      const by = y + (y2 - y) * position;
      const branchLength = length * (0.55 - position * 0.25) * (0.7 + random() * 0.5);
      const branchBirth = birth + duration * position;
      grow(bx, by, angle + BRANCH_ANGLE, branchLength, depth - 1, branchBirth);
      grow(bx, by, angle - BRANCH_ANGLE, branchLength, depth - 1, branchBirth);
    });

    if (depth > 1) {
      grow(x2, y2, angle + (random() - 0.5) * 0.35, length * 0.72, depth - 1, birth + duration);
    }
  }

  // Seeds sit along the border and point inwards, corners get the densest frost
  const perimeter = 2 * (width + height);
  const seedCount = Math.max(6, Math.round(perimeter / SEED_SPACING));
  for (let i = 0; i < seedCount; i++) {
    const p = ((i + random() * 0.8) / seedCount) * perimeter;
    const [x, y] = getPerimeterPoint(p, width, height);

    const inward = Math.atan2(centerY - y, centerX - x) + (random() - 0.5) * 0.9;
    const cornerBoost = 1 - Math.min(Math.hypot(x - centerX, y - centerY) / Math.hypot(centerX, centerY), 1);
    const length = reach * (0.2 + random() * 0.16) * (1.3 - cornerBoost * 0.7);
    grow(x, y, inward, length, MAX_DEPTH - (random() < 0.4 ? 1 : 0), random() * 260);
  }

  const growDuration = Math.max(...segments.map(({ birth, duration }) => birth + duration));
  const flakes = Array.from({ length: FLAKE_COUNT }, (): Flake => ({
    x: random() * width,
    y: random() * height,
    vx: (random() - 0.5) * 60,
    vy: -40 - random() * 90,
    size: 2 + random() * 3.5,
    rotation: random() * Math.PI,
  }));

  return {
    width, height, segments, glints, flakes, growDuration,
  };
}

export function drawFrost(
  ctx: CanvasRenderingContext2D,
  scene: FrostScene,
  {
    time, thawRadius, color, glowColor, noClear,
  }: {
    time: number;
    thawRadius?: number;
    color: string;
    glowColor: string;
    noClear?: boolean;
  },
) {
  const { width, height, segments } = scene;
  if (!noClear) ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';

  // Glow pass under the crisp crystal lines
  [[glowColor, 2.6], [color, 1]].forEach(([strokeStyle, widthFactor]) => {
    ctx.strokeStyle = strokeStyle as string;
    segments.forEach((segment) => {
      const progress = (time - segment.birth) / segment.duration;
      if (progress <= 0) return;

      const thawAlpha = thawRadius === undefined
        ? 1 : Math.min(1, Math.max(0, (segment.centerDistance - thawRadius) / THAW_EDGE));
      if (thawAlpha <= 0) return;

      const p = Math.min(1, progress);
      ctx.globalAlpha = thawAlpha;
      ctx.lineWidth = segment.width * (widthFactor as number);
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x1 + (segment.x2 - segment.x1) * p, segment.y1 + (segment.y2 - segment.y1) * p);
      ctx.stroke();
    });
  });

  // Twinkling glints on crystal tips
  ctx.fillStyle = '#ffffff';
  scene.glints.forEach((glint) => {
    if (time < glint.birth) return;
    if (thawRadius !== undefined && Math.hypot(glint.x - width / 2, glint.y - height / 2) < thawRadius) return;

    const twinkle = Math.max(0, Math.sin(time / 260 + glint.phase));
    if (twinkle < 0.05) return;
    drawStar(ctx, glint.x, glint.y, glint.size * twinkle, twinkle);
  });
  ctx.globalAlpha = 1;
}

// Thawed frost escapes as small snowflakes drifting up
export function drawFlakes(
  ctx: CanvasRenderingContext2D, scene: FrostScene, progress: number, dt: number, color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  scene.flakes.forEach((flake) => {
    flake.x += flake.vx * dt;
    flake.y += flake.vy * dt;
    flake.rotation += dt;
    const alpha = Math.sin(Math.min(1, progress) * Math.PI);
    if (alpha <= 0) return;

    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(flake.x, flake.y);
    ctx.rotate(flake.rotation);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI) / 3;
      ctx.moveTo(-Math.cos(angle) * flake.size, -Math.sin(angle) * flake.size);
      ctx.lineTo(Math.cos(angle) * flake.size, Math.sin(angle) * flake.size);
    }
    ctx.stroke();
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 2);
  ctx.quadraticCurveTo(x, y, x + size * 2, y);
  ctx.quadraticCurveTo(x, y, x, y + size * 2);
  ctx.quadraticCurveTo(x, y, x - size * 2, y);
  ctx.quadraticCurveTo(x, y, x, y - size * 2);
  ctx.fill();
}

function getPerimeterPoint(p: number, width: number, height: number): [number, number] {
  if (p < width) return [p, 0];
  if (p < width + height) return [width, p - width];
  if (p < 2 * width + height) return [width - (p - width - height), height];
  return [0, height - (p - 2 * width - height)];
}

function createRandom(seed: number) {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}
