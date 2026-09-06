import { useEffect, useRef } from 'react';

const BALL = 46;
const PERIOD = 4.2;
const TAU = Math.PI * 2;

type Dot = { x: number; y: number; z: number; radius: number; alpha: number };

// Rings geometry and perspective from the supplied ThinkingOrbsPill export.
// Keep only this preset; Canvas 2D also works without a WebGPU adapter.
function ringDots(phase: number, dotScale: number): Dot[] {
  const points: Dot[] = [];
  for (let ring = 0; ring < 11; ring++) {
    const latitude = (ring / 10) * Math.PI;
    const y = Math.cos(latitude);
    const radius = Math.sin(latitude);
    const count = Math.max(1, Math.round(16 * radius));
    const direction = ring % 2 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + direction * TAU * phase;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const tiltedY = y * Math.cos(0.4) - z * Math.sin(0.4);
      const tiltedZ = y * Math.sin(0.4) + z * Math.cos(0.4);
      const perspective = 3.5 / (3.5 - tiltedZ);
      const depth = Math.max(0, Math.min(1, (tiltedZ + 1.1) / 2.2));
      points.push({
        x: x * BALL * 0.3 * perspective,
        y: tiltedY * BALL * 0.3 * perspective,
        z: tiltedZ,
        radius: dotScale * (0.4 + 1.6 * depth) * perspective * 0.85,
        alpha: 0.07 + 0.93 * Math.pow(depth, 1.55),
      });
    }
  }
  return points.sort((a, b) => a.z - b.z);
}

// Match the export's fit probe so every phase keeps the same framing.
const FIT = (() => {
  let extent = 0;
  for (let sample = 0; sample < 20; sample++) {
    for (const dot of ringDots(sample / 20, 1)) {
      if (dot.alpha <= 0.05 || dot.radius <= 0.15) continue;
      extent = Math.max(
        extent,
        Math.abs(dot.x) + dot.radius * 0.5,
        Math.abs(dot.y) + dot.radius * 0.5,
      );
    }
  }
  return extent > 1 ? Math.max(0.55, Math.min(1.7, (BALL * 0.415) / extent)) : 1;
})();

export type ThinkingOrbsPillProps = {
  style?: 'rings';
  label?: string;
};

export default function ThinkingOrbsPill({
  style = 'rings',
  label = '\u601d\u8003\u4e2d...',
}: ThinkingOrbsPillProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const startedAt = window.performance.now();
    let frame = 0;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(BALL * dpr);
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      context.setTransform(size / BALL, 0, 0, size / BALL, 0, 0);
      context.clearRect(0, 0, BALL, BALL);
      context.fillStyle = window.getComputedStyle(canvas).color;
      const phase = motion.matches
        ? 0
        : ((window.performance.now() - startedAt) / 1000 / PERIOD) % 1;
      for (const dot of ringDots(phase, 0.4)) {
        context.globalAlpha = dot.alpha;
        context.beginPath();
        context.arc(
          BALL / 2 + dot.x * FIT,
          BALL / 2 + dot.y * FIT,
          dot.radius * (0.55 + 0.45 * FIT),
          0,
          TAU,
        );
        context.fill();
      }
      if (!motion.matches && !document.hidden) frame = window.requestAnimationFrame(draw);
    };

    const refresh = () => {
      window.cancelAnimationFrame(frame);
      draw();
    };
    const theme = new MutationObserver(refresh);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    motion.addEventListener('change', refresh);
    scheme.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    draw();

    return () => {
      window.cancelAnimationFrame(frame);
      theme.disconnect();
      motion.removeEventListener('change', refresh);
      scheme.removeEventListener('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return (
    <div className="qa-thinking" data-orb-style={style} role="status">
      <canvas ref={canvasRef} width={BALL} height={BALL} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
