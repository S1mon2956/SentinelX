"use client";

import { useRef, useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";

// A simple draw-to-sign canvas. Works with touch (finger, on mobile) and
// mouse. Calling `onChange` with a Blob whenever the drawing changes; pass
// null when cleared so the parent knows there's nothing to upload.
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
  }, []);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  }

  function stop() {
    if (!isDrawing) return;
    setIsDrawing(false);
    canvasRef.current.toBlob((blob) => onChange(blob), "image/png");
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  }

  return (
    <div>
      <div className="border border-slate-300 rounded-lg overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={140}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
        {!hasDrawn && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none">
            Sign here
          </p>
        )}
      </div>
      {hasDrawn && (
        <button
          onClick={clear}
          type="button"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 mt-1"
        >
          <RotateCcw size={12} /> Clear and re-sign
        </button>
      )}
    </div>
  );
}
