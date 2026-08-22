"use client";

import { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

// Wraps the browser's built-in speech recognition — completely free, no
// API key, no server call. Chrome, Edge, and Safari support it; Firefox
// currently doesn't, so this quietly hides itself rather than showing a
// button that won't work.
export default function VoiceInput({ onResult, className = "" }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const SpeechRecognition =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!SpeechRecognition) return null;

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      title={listening ? "Stop listening" : "Dictate with your voice"}
      className={`shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full ${
        listening ? "bg-rose-500 text-white animate-pulse" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      } ${className}`}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
