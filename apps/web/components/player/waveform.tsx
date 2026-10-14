"use client";

import { useCallback, useEffect, useRef } from "react";
import { clamp, formatDuration } from "@/lib/utils";

interface WaveformProps {
  peaks: number[];
  progress: number;
  duration: number;
  onSeek: (ratio: number) => void;
}

export function Waveform({ peaks, progress, duration, onSeek }: WaveformProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  const draw = useCallback(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const count = peaks.length;
    if (count === 0) return;
    const slot = width / count;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#8B5CF6");
    gradient.addColorStop(1, "#EC4899");
    for (let i = 0; i < count; i++) {
      const value = clamp(peaks[i] ?? 0, 0, 1);
      const barHeight = Math.max(3, value * height * 0.92);
      const x = i * slot;
      ctx.fillStyle = (i + 0.5) / count <= progress ? gradient : "#2A2A44";
      ctx.beginPath();
      ctx.roundRect(x + slot * 0.18, (height - barHeight) / 2, Math.max(1, slot * 0.64), barHeight, 2);
      ctx.fill();
    }
  }, [peaks, progress]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(element);
    return () => observer.disconnect();
  }, [draw]);

  function ratioFrom(event: React.PointerEvent): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return clamp((event.clientX - rect.left) / rect.width, 0, 1);
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(progress * duration)}
      aria-valuetext={`${formatDuration(progress * duration)} of ${formatDuration(duration)}`}
      className="h-28 w-full cursor-pointer touch-none select-none rounded-2xl bg-bg/40 p-2"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSeek(ratioFrom(event));
      }}
      onPointerMove={(event) => {
        if (dragging.current) onSeek(ratioFrom(event));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <canvas ref={canvas} className="h-full w-full" />
    </div>
  );
}
