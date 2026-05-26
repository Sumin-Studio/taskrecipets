"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import {
  halftone,
  MOOD_PHOTO_RENDER_H,
  MOOD_PHOTO_RENDER_W,
} from "@/lib/halftone";

type SignOffMode = "photo" | "draw";
type CameraPhase = "idle" | "loading" | "ready" | "error";

const DRAW_BG = "#B8B8B8";
const DRAW_INK = "#2A2A2A";

export function PhotoCaptureModal() {
  const pendingPhotoFor = useStore((s) => s.pendingPhotoFor);
  const attachPhotoToCut = useStore((s) => s.attachPhotoToCut);
  const cancelComplete = useStore((s) => s.cancelComplete);

  const onCommitted = useCallback(
    (photoDataUrl: string | null) => {
      attachPhotoToCut(photoDataUrl);
    },
    [attachPhotoToCut],
  );

  if (!pendingPhotoFor) return null;

  return (
    <SignOffDialog
      key={pendingPhotoFor}
      onCancel={cancelComplete}
      onCommitted={onCommitted}
    />
  );
}

/** Sign-off UI — photo or hand-drawn mark before the receipt prints. */
export function PhotoCaptureDialog({
  onCancel,
  onCommitted,
}: {
  onCancel?: () => void;
  onCommitted: (photoDataUrl: string | null) => void;
}) {
  return <SignOffDialog onCancel={onCancel} onCommitted={onCommitted} />;
}

function SignOffDialog({
  onCancel,
  onCommitted,
}: {
  onCancel?: () => void;
  onCommitted: (photoDataUrl: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasDrawn = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const [mode, setMode] = useState<SignOffMode>("photo");
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const commit = useCallback(
    (url: string | null) => {
      stopCamera();
      onCommitted(url);
    },
    [onCommitted, stopCamera],
  );

  const cancel = useCallback(() => {
    stopCamera();
    onCancel?.();
  }, [onCancel, stopCamera]);

  const initDrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = MOOD_PHOTO_RENDER_W;
    canvas.height = MOOD_PHOTO_RENDER_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = DRAW_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = DRAW_INK;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    hasDrawn.current = false;
    setHasDrawing(false);
    lastPoint.current = null;
  }, []);

  useEffect(() => {
    if (mode !== "photo") {
      stopCamera();
      setCameraPhase("idle");
      return;
    }

    let cancelled = false;
    setCameraPhase("loading");
    setCameraError(null);

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        if (!cancelled) {
          setCameraError("Camera unavailable");
          setCameraPhase("error");
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraPhase("ready");
      } catch {
        if (!cancelled) {
          setCameraError("Camera access denied");
          setCameraPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [mode, stopCamera]);

  useEffect(() => {
    if (mode === "draw") initDrawCanvas();
  }, [mode, initDrawCanvas]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const selectMode = (next: SignOffMode) => {
    if (next === mode) return;
    setMode(next);
    setCapturedUrl(null);
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onDrawStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPoint(e.clientX, e.clientY);
    lastPoint.current = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const onDrawMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!lastPoint.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = canvasPoint(e.clientX, e.clientY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasDrawn.current = true;
    setHasDrawing(true);
    lastPoint.current = p;
  };

  const onDrawEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    lastPoint.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const onShutter = async () => {
    if (mode === "draw") {
      initDrawCanvas();
      return;
    }
    if (capturedUrl) {
      setCapturedUrl(null);
      setCameraPhase("loading");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraPhase("ready");
      } catch {
        setCameraError("Camera access denied");
        setCameraPhase("error");
      }
      return;
    }
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    const dataUrl = halftone(v, MOOD_PHOTO_RENDER_W, MOOD_PHOTO_RENDER_H).toDataURL(
      "image/png",
    );
    setCapturedUrl(dataUrl);
    stopCamera();
  };

  const onSignOff = () => {
    if (mode === "photo") {
      if (capturedUrl) {
        commit(capturedUrl);
        return;
      }
      const v = videoRef.current;
      if (v && v.videoWidth > 0) {
        commit(
          halftone(v, MOOD_PHOTO_RENDER_W, MOOD_PHOTO_RENDER_H).toDataURL("image/png"),
        );
        return;
      }
      commit(null);
      return;
    }

    const canvas = canvasRef.current;
    if (canvas && hasDrawn.current) {
      commit(
        halftone(canvas, MOOD_PHOTO_RENDER_W, MOOD_PHOTO_RENDER_H, { inkOnly: true }).toDataURL(
          "image/png",
        ),
      );
      return;
    }
    commit(null);
  };

  const centerDisabled =
    mode === "photo"
      ? cameraPhase !== "ready" && !capturedUrl
      : !hasDrawing;
  const shutterLabel =
    mode === "draw"
      ? "Clear drawing"
      : capturedUrl
      ? "Retake photo"
      : "Capture photo";

  if (!mounted) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      role="dialog"
      aria-modal="true"
      aria-label="Sign off receipt"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="signoff-frame relative rounded-[2.25rem] p-5 w-full max-w-[520px]"
      >
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel sign off"
          title="Cancel sign off"
          className="btn-skeuo absolute right-4 top-4 z-20 h-8 w-8 rounded-full flex items-center justify-center text-[color:var(--color-ink)]"
        >
          <CloseIcon />
        </button>

        <div className="signoff-viewport relative w-full aspect-[1.45/1] rounded-[1.5rem] overflow-hidden">
          {mode === "photo" ? (
            <>
              {capturedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capturedUrl}
                  alt="Captured snapshot"
                  className="absolute inset-0 w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover -scale-x-100"
                />
              )}
              {cameraPhase === "loading" && !capturedUrl && (
                <div className="absolute inset-0 flex items-center justify-center text-[color:var(--color-ink)]/60 text-[11px] tracking-[0.18em] uppercase">
                  Waking up camera…
                </div>
              )}
              {cameraPhase === "error" && !capturedUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-[color:var(--color-ink)]/70">
                  <CameraOffIcon />
                  <span className="text-[11px] tracking-[0.18em] uppercase">
                    {cameraError ?? "Camera unavailable"}
                  </span>
                  <span className="text-[10.5px] opacity-70 leading-relaxed max-w-[260px]">
                    Switch to hand drawn, or sign off without a mark.
                  </span>
                </div>
              )}
            </>
          ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
              onPointerDown={onDrawStart}
              onPointerMove={onDrawMove}
              onPointerUp={onDrawEnd}
              onPointerLeave={onDrawEnd}
              onPointerCancel={onDrawEnd}
            />
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <ModeToggle mode={mode} onChange={selectMode} />

          <button
            type="button"
            onClick={onShutter}
            disabled={centerDisabled}
            aria-label={shutterLabel}
            title={shutterLabel}
            className="btn-skeuo shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[color:var(--color-ink)] disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {mode === "draw" ? (
              <ClearIcon />
            ) : capturedUrl ? (
              <RetakeIcon />
            ) : (
              <ShutterIcon />
            )}
          </button>

          <button
            type="button"
            onClick={onSignOff}
            className="btn-skeuo shrink-0 h-10 px-6 rounded-full text-[0.9375rem] tracking-[0.04em] text-[color:var(--color-ink)]"
          >
            Sign off
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: SignOffMode;
  onChange: (m: SignOffMode) => void;
}) {
  const options: { value: SignOffMode; label: string }[] = [
    { value: "photo", label: "Photo" },
    { value: "draw", label: "Hand drawn" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Sign-off mode"
      className="shell-skeuo rounded-full p-[3px] flex items-center text-[10px] uppercase tracking-wider"
    >
      {options.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`px-3 h-[26px] rounded-full transition-colors ${
              active
                ? "bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] text-[color:var(--color-ink)]"
                : "text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ShutterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RetakeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8" />
      <path d="M20 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 16" />
      <path d="M4 20v-4h4" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" opacity="0" />
      <path d="M4 7h16" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
      <path d="M3 3l18 18" />
      <path d="M9.5 5h5l1.5 2H20a1 1 0 0 1 1 1v9.5" />
      <path d="M21 17l-3-3M3 8v10a1 1 0 0 0 1 1h13" />
      <path d="M9.4 9.4a4 4 0 0 0 5.2 5.2" />
    </svg>
  );
}
