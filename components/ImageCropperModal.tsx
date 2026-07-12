"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Output size of the cropped cover (matches the card's 5:2 strip). */
const OUT_W = 1000;
const OUT_H = 400;
const ASPECT = OUT_W / OUT_H;
const MAX_ZOOM = 4;

/**
 * Cover image cropper — drag to position, slider (or wheel) to zoom, inside a
 * fixed 5:2 frame that matches the property card. Exports a JPEG data URL via
 * canvas. Remote images are loaded with CORS; hosts that block it get a clear
 * error instead of a broken crop.
 */
export function ImageCropperModal({
  open,
  src,
  onCancel,
  onCropped,
}: {
  open: boolean;
  /** Image to crop — an object URL, data URL, or remote URL. */
  src: string;
  onCancel: () => void;
  /** Receives the cropped image as a JPEG data URL. */
  onCropped: (dataUrl: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const [frameW, setFrameW] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const frameH = frameW / ASPECT;
  // Scale that makes the image exactly cover the frame at zoom = 1.
  const fitScale = natural && frameW ? Math.max(frameW / natural.w, frameH / natural.h) : 0;
  const dispW = natural ? natural.w * fitScale * zoom : 0;
  const dispH = natural ? natural.h * fitScale * zoom : 0;

  const clampOffset = useCallback(
    (x: number, y: number, dw: number, dh: number) => ({
      x: Math.min(0, Math.max(frameW - dw, x)),
      y: Math.min(0, Math.max(frameW / ASPECT - dh, y)),
    }),
    [frameW]
  );

  // Load the image whenever the modal opens with a new source.
  useEffect(() => {
    if (!open || !src) return;
    setError(null);
    setNatural(null);
    setZoom(1);
    const img = new Image();
    // Needed so canvas export isn't tainted for remote URLs; harmless for data/object URLs.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setError("Couldn't load this image. Check the link and try again.");
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [open, src]);

  // Track the frame's rendered width (responsive modal).
  useEffect(() => {
    if (!open) return;
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, [open, natural]);

  // Center the image once its display size is known.
  useEffect(() => {
    if (!natural || !frameW) return;
    const dw = natural.w * Math.max(frameW / natural.w, frameH / natural.h);
    const dh = natural.h * Math.max(frameW / natural.w, frameH / natural.h);
    setOffset({ x: (frameW - dw) / 2, y: (frameH - dh) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, frameW]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  function setZoomKeepingCenter(nextZoom: number) {
    if (!natural) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    const dw = natural.w * fitScale * z;
    const dh = natural.h * fitScale * z;
    // Keep the frame's center pointing at the same spot in the image.
    const cx = (frameW / 2 - offset.x) / dispW;
    const cy = (frameH / 2 - offset.y) / dispH;
    const next = clampOffset(frameW / 2 - cx * dw, frameH / 2 - cy * dh, dw, dh);
    setZoom(z);
    setOffset(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clampOffset(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py), dispW, dispH));
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    setZoomKeepingCenter(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  function handleApply() {
    const img = imgRef.current;
    if (!img || !natural || !dispW || !dispH) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = (-offset.x / dispW) * natural.w;
    const sy = (-offset.y / dispH) * natural.h;
    const sw = (frameW / dispW) * natural.w;
    const sh = (frameH / dispH) * natural.h;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
    try {
      onCropped(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      setError("This image's host doesn't allow cropping. Download it and upload the file instead.");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Cancel crop"
        onClick={onCancel}
        className="absolute inset-0"
        style={{ background: "rgba(15,17,22,0.55)", animation: "icFadeIn 140ms ease" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Crop cover image"
        className="relative w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 24px 64px rgba(15,17,22,0.24)",
          animation: "icPop 180ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Crop cover image</h2>
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>Drag to position · scroll or slide to zoom</span>
        </div>

        {/* Crop frame */}
        <div className="px-5 pt-5">
          {error ? (
            <div className="w-full aspect-[5/2] rounded-xl flex items-center justify-center px-8 text-center text-xs"
              style={{ background: "var(--surface-muted)", border: "1px dashed var(--border-strong)", color: "var(--danger)" }}>
              {error}
            </div>
          ) : (
            <div
              ref={frameRef}
              className="relative w-full aspect-[5/2] rounded-xl overflow-hidden touch-none select-none"
              style={{ background: "var(--surface-muted)", cursor: dragRef.current ? "grabbing" : "grab" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            >
              {natural ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none pointer-events-none"
                  style={{ left: offset.x, top: offset.y, width: dispW, height: dispH }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "var(--text-faint)" }}>
                  Loading image...
                </div>
              )}
              {/* Rule-of-thirds guides */}
              {natural && (
                <div className="absolute inset-0 pointer-events-none" aria-hidden>
                  <div className="absolute inset-y-0 left-1/3 w-px" style={{ background: "rgba(255,255,255,0.35)" }} />
                  <div className="absolute inset-y-0 left-2/3 w-px" style={{ background: "rgba(255,255,255,0.35)" }} />
                  <div className="absolute inset-x-0 top-1/3 h-px" style={{ background: "rgba(255,255,255,0.35)" }} />
                  <div className="absolute inset-x-0 top-2/3 h-px" style={{ background: "rgba(255,255,255,0.35)" }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Zoom slider */}
        <div className="px-5 py-4 flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--text-faint)" }} aria-hidden>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!natural || !!error}
            aria-label="Zoom"
            onChange={(e) => setZoomKeepingCenter(parseFloat(e.target.value))}
            className="flex-1"
            style={{ accentColor: "var(--accent)" }}
          />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--text-faint)" }} aria-hidden>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6M8 11h6" />
          </svg>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <button type="button" className="ui-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={!natural || !!error} onClick={handleApply}>
            Apply crop
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes icFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes icPop { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
}
