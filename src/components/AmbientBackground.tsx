import { useEffect, useRef, type ReactElement } from 'react';

/** Canvas glyph rain over CSS nebula gradients; independent of the star renderer. */
export default function AmbientBackground({ paused }: { paused: boolean }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let width = 0, height = 0, frame = 0, previous = 0, visible = true;
    const characters = '01.:+=/';
    const draw = (): void => {
      context.clearRect(0, 0, width, height);
      context.font = '11px monospace';
      for (let column = 0; column < Math.ceil(width / 28); column += 1) {
        const speed = 8 + (column * 17 % 23);
        const direction = column % 2 ? -1 : 1;
        for (let row = -1; row < Math.ceil(height / 34) + 1; row += 1) {
          const seed = Math.abs(column * 73 + row * 31);
          if (seed % 5 > 1) continue;
          const travel = elapsed.current * speed * direction;
          const y = ((row * 34 + travel + column * 11) % (height + 68) + height + 68) % (height + 68) - 34;
          const wave = Math.sin(column * 0.19 + y / 170 + elapsed.current * 0.08);
          context.fillStyle = `rgba(116, 173, 183, ${0.025 + (wave + 1) * 0.018})`;
          context.fillText(characters[seed % characters.length] ?? '.', column * 28, y);
        }
      }
    };
    const tick = (time: number): void => {
      frame = 0;
      if (paused || !visible || document.hidden) return;
      if (!previous) previous = time;
      if (time - previous >= 50) {
        elapsed.current += Math.min(time - previous, 100) / 1000;
        previous = time;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = (): void => {
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const resize = (): void => {
      width = canvas.clientWidth; height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync(); });
    resizeObserver.observe(canvas); intersection.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    resize(); sync();
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, [paused]);
  return <div className="ambient-background" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
