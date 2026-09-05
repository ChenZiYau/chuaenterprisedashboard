"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

const MAX_ZOOM = 4;
/** Tallest the crop surface gets before it scrolls. */
const VIEW_MAX_H = 420;
/** Longest side of the exported JPEG — keeps the stored data URL small. */
const OUT_MAX = 1600;

type AspectChoice = "free" | "1:1" | "4:3" | "16:9" | "5:2";

const PRESETS: { label: string; value: AspectChoice; ratio?: number }[] = [
  { label: "Free", value: "free" },
  { label: "1:1", value: "1:1", ratio: 1 },
  { label: "4:3", value: "4:3", ratio: 4 / 3 },
  { label: "16:9", value: "16:9", ratio: 16 / 9 },
  { label: "5:2 · card", value: "5:2", ratio: 5 / 2 },
];

function ratioFor(p: AspectChoice): number | undefined {
  return PRESETS.find((x) => x.value === p)?.ratio;
}

/** Centered starting crop covering most of the image, in percent units. */
function centeredCrop(imgW: number, imgH: number, aspect: number | undefined): Crop {
  if (aspect) {
    return centerCrop(makeAspectCrop({ unit: "%", width: 80 }, aspect, imgW, imgH), imgW, imgH);
  }
  return centerCrop({ unit: "%", width: 80, height: 80, x: 0, y: 0 }, imgW, imgH);
}

function clampNum(value: string, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}

/**
 * Cover image cropper — draw the crop box anywhere on the image, pick an
 * aspect preset (or Free to drag width and height independently), fine-tune
 * with pixel inputs, and zoom the image for precise framing. Exports a JPEG
 * data URL via canvas. Remote images are loaded with CORS; hosts that block
 * it get a clear error instead of a broken crop.
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
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [boxW, setBoxW] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [aspect, setAspect] = useState<AspectChoice>("free");
  const [crop, setCrop] = useState<Crop>();
  const [zoom, setZoom] = useState(1);
  const [wInput, setWInput] = useState("");
  const [hInput, setHInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset when the source changes. This must happen during render, not in an
  // effect: a data-URL image can fire `load` before passive effects flush, and
  // an effect-based reset would then wipe the loaded state and strand the
  // modal on "Loading image...".
  const [lastSrc, setLastSrc] = useState(src);
  if (lastSrc !== src) {
    setLastSrc(src);
    setError(null);
    setNatural(null);
    setCrop(undefined);
    setZoom(1);
    setAspect("free");
    setWInput("");
    setHInput("");
  }

  // Safety net: if the image was already complete before React attached the
  // load handler (e.g. cached), initialise from the DOM element directly.
  useEffect(() => {
    const img = imgRef.current;
    if (open && !natural && !error && img && img.complete && img.naturalWidth > 0) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setCrop(centeredCrop(img.naturalWidth, img.naturalHeight, undefined));
    }
  });

  // Track the crop surface's rendered width (responsive modal).
  useEffect(() => {
    if (!open) return;
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [open, error]);

  // Keep the pixel inputs mirroring the crop box.
  useEffect(() => {
    if (!crop || !natural) return;
    setWInput(String(Math.max(1, Math.round((crop.width / 100) * natural.w))));
    setHInput(String(Math.max(1, Math.round((crop.height / 100) * natural.h))));
  }, [crop, natural]);

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

  // Display width that fits the surface both ways at zoom = 1.
  const fitW = natural && boxW ? Math.min(boxW, VIEW_MAX_H * (natural.w / natural.h)) : 0;
  const dispW = fitW * zoom;

  /** Zoom while keeping the point at the middle of the view in place. */
  function changeZoom(next: number) {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const box = boxRef.current;
    const factor = z / zoom;
    setZoom(z);
    if (!box) return;
    const { scrollLeft, scrollTop, clientWidth, clientHeight } = box;
    requestAnimationFrame(() => {
      box.scrollLeft = (scrollLeft + clientWidth / 2) * factor - clientWidth / 2;
      box.scrollTop = (scrollTop + clientHeight / 2) * factor - clientHeight / 2;
    });
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    imgRef.current = e.currentTarget;
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    setNatural({ w, h });
    setCrop(centeredCrop(w, h, ratioFor("free")));
  }

  /** Clamp a percent crop inside the image and commit it. */
  function commitCrop(next: Crop) {
    const width = Math.min(100, Math.max(0.5, next.width));
    const height = Math.min(100, Math.max(0.5, next.height));
    setCrop({
      unit: "%",
      width,
      height,
      x: Math.min(Math.max(0, next.x), 100 - width),
      y: Math.min(Math.max(0, next.y), 100 - height),
    });
  }

  function selectAspect(preset: AspectChoice) {
    setAspect(preset);
    if (!natural) return;
    setCrop(centeredCrop(natural.w, natural.h, ratioFor(preset)));
  }

  // Edit width via the numeric field (value is in natural px).
  function applyWidth(value: string) {
    setWInput(value);
    if (!natural || !crop) return;
    const px = clampNum(value, 1, natural.w);
    if (px === null) return;
    const width = (px / natural.w) * 100;
    const ratio = ratioFor(aspect);
    const height = ratio ? ((px / ratio) / natural.h) * 100 : crop.height;
    commitCrop({ ...crop, width, height });
  }

  // Edit height via the numeric field (value is in natural px).
  function applyHeight(value: string) {
    setHInput(value);
    if (!natural || !crop) return;
    const px = clampNum(value, 1, natural.h);
    if (px === null) return;
    const height = (px / natural.h) * 100;
    const ratio = ratioFor(aspect);
    const width = ratio ? ((px * ratio) / natural.w) * 100 : crop.width;
    commitCrop({ ...crop, width, height });
  }

  function handleApply() {
    const img = imgRef.current;
    if (!img || !natural || !crop || crop.width < 0.5 || crop.height < 0.5) return;
    const sx = (crop.x / 100) * natural.w;
    const sy = (crop.y / 100) * natural.h;
    const sw = Math.max(1, Math.round((crop.width / 100) * natural.w));
    const sh = Math.max(1, Math.round((crop.height / 100) * natural.h));
    // Downscale very large crops so the stored data URL stays reasonable.
    const scale = Math.min(1, OUT_MAX / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    try {
      onCropped(canvas.toDataURL("image/jpeg", 0.88));
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
        className="relative w-full max-w-3xl flex flex-col rounded-2xl overflow-hidden"
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
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>Drag the box or its corners · slide to zoom</span>
        </div>

        {/* Body */}
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-start">
          {/* Crop surface */}
          {error ? (
            <div
              className="w-full rounded-xl flex items-center justify-center px-8 text-center text-xs"
              style={{ minHeight: 200, background: "var(--surface-muted)", border: "1px dashed var(--border-strong)", color: "var(--danger)" }}
            >
              {error}
            </div>
          ) : (
            <div
              ref={boxRef}
              className="flex overflow-auto ui-scroll rounded-xl"
              style={{ background: "var(--surface-muted)", maxHeight: VIEW_MAX_H, minHeight: 200 }}
            >
              {/* margin:auto centers the content but, unlike grid centering,
                  keeps the top/left reachable when it overflows the box */}
              <div style={{ margin: "auto", display: natural ? "block" : "none" }}>
                <ReactCrop
                  crop={crop}
                  onChange={(_px, percent) => setCrop(percent)}
                  aspect={ratioFor(aspect)}
                  keepSelection
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={src}
                    alt="Crop source"
                    crossOrigin="anonymous"
                    onLoad={onImageLoad}
                    onError={() => setError("Couldn't load this image. Check the link and try again.")}
                    style={{ width: dispW || undefined, maxWidth: "none", display: "block" }}
                  />
                </ReactCrop>
              </div>
              {!natural && (
                <div className="m-auto p-10 text-xs" style={{ color: "var(--text-faint)" }}>
                  Loading image...
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="md:w-56 space-y-5">
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Aspect ratio</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => {
                  const active = aspect === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => selectAspect(p.value)}
                      disabled={!natural || !!error}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold transition"
                      style={{
                        background: active ? "var(--accent)" : "var(--surface-muted)",
                        color: active ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }} htmlFor="cover-crop-w">
                  Width (px)
                </label>
                <input
                  id="cover-crop-w"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={wInput}
                  disabled={!natural || !!error}
                  onChange={(e) => applyWidth(e.target.value)}
                  className="ui-field w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }} htmlFor="cover-crop-h">
                  Height (px)
                </label>
                <input
                  id="cover-crop-h"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={hInput}
                  disabled={!natural || !!error}
                  onChange={(e) => applyHeight(e.target.value)}
                  className="ui-field w-full"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Zoom</p>
              <div className="flex items-center gap-2">
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
                  onChange={(e) => changeZoom(parseFloat(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: "var(--accent)" }}
                />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--text-faint)" }} aria-hidden>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6M8 11h6" />
                </svg>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                Zoom only changes the view — scroll to pan while zoomed.
              </p>
            </div>

            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              {aspect === "free"
                ? "Drag any edge — width and height are independent."
                : "Aspect locked — the other dimension follows automatically."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <button type="button" className="ui-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={!natural || !crop || !!error} onClick={handleApply}>
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
