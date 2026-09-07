"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Reusable replayable "?" help overlay for ISO Excellence pages. Pass a
// `slides` array of { title, paragraphs: [string, ...] } — the modal
// handles step state, Next/Back/Close, and progress dots itself.
export default function IsoTutorialOverlay({ open, onClose, slides }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const slide = slides[step];
  const isFirst = step === 0;
  const isLast = step === slides.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 text-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-slate-800 relative"
      >
        <button
          onClick={onClose}
          aria-label="Close tutorial"
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X size={16} />
        </button>

        <h2 className="text-lg font-semibold pr-6">{slide.title}</h2>
        <div className="mt-3 space-y-2">
          {slide.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-slate-300 leading-relaxed">{p}</p>
          ))}
        </div>

        <div className="flex items-center justify-between mt-6">
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-white" : "bg-slate-600"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="text-sm font-medium text-slate-300 border border-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-800"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
              className="text-sm font-medium text-slate-900 bg-white rounded-lg px-3 py-1.5 hover:bg-slate-100"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
