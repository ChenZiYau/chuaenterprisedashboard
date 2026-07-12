"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { AspectPreset, CropInfo } from "@/lib/vaultTypes";

interface VaultCropModalProps {
  src: string;
  /** Crop to restore when re-opening (natural pixels). */
  initial?: CropInfo | null;
  onCancel: () => void;
  onApply: (blob: Blob, info: CropInfo) => void;
}

const PRESETS: { label: string; value: AspectPreset; ratio?: number }[] = [
  { label: "1:1", value: "1:1", ratio: 1 },
  { label: "4:3", value: "4:3", ratio: 4 / 3 },
  { label: "16:9", value: "16:9", ratio: 16 / 9 },
  { label: "Free", value: "free" },
];

function ratioFor(p: AspectPreset): number | undefined {
  return PRESETS.find((x) => x.value === p)?.ratio;
}

/** Build a centered crop covering most of the image for a given aspect. */
function centeredCrop(imgW: number, imgH: number, aspect: number | undefined): Crop {
  if (aspect) {
    return centerCrop(makeAspectCrop({ unit: "%", width: 80 }, aspect, imgW, imgH), imgW, imgH);
  }
  return centerCrop({ unit: "%", width: 80, height: 80, x: 0, y: 0 }, imgW, imgH);
}

/**
 * Gallery-photo cropper for the property Images tab, ported from the Image
 * Vault's editor so crops behave identically wherever they're applied.
 * Exports a JPEG blob plus the crop geometry in natural pixels.
 */
export function VaultCropModal({ src, initial, onCancel, onApply }: VaultCropModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState<AspectPreset>(initial?.aspect ?? "free");
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<PixelCrop>();
  // Numeric inputs are shown in the original image's natural pixels.
  const [wInput, setWInput] = useState("");
  const [hInput, setHInput] = useState("");

  // Scale factor between displayed image and its natural resolution.
  const scale = useCallback((): { sx: number; sy: number } => {
    const img = imgRef.current;
    if (!img || img.width === 0 || img.height === 0) return { sx: 1, sy: 1 };
    return { sx: img.naturalWidth / img.width, sy: img.naturalHeight / img.height };
  }, []);

  // Keep the numeric fields in sync with the crop box.
  useEffect(() => {
    if (!completed) return;
    const { sx, sy } = scale();
    setWInput(String(Math.round(completed.width * sx)));
    setHInput(String(Math.round(completed.height * sy)));
  }, [completed, scale]);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const next = centeredCrop(width, height, ratioFor(aspect));
    setCrop(next);
    setCompleted(toPixelCrop(next, width, height));
  }

  function selectAspect(preset: AspectPreset) {
    setAspect(preset);
    const img = imgRef.current;
    if (!img) return;
    const next = centeredCrop(img.width, img.height, ratioFor(preset));
    setCrop(next);
    setCompleted(toPixelCrop(next, img.width, img.height));
  }

  // Edit width via the numeric field (value is in natural px).
  function applyWidth(value: string) {
    setWInput(value);
    const img = imgRef.current;
    if (!img || !completed) return;
    const { sx, sy } = scale();
    const naturalW = clampNum(value, 1, img.naturalWidth);
    if (naturalW === null) return;
    const dispW = naturalW / sx;
    const ratio = ratioFor(aspect);
    const dispH = ratio ? dispW / ratio : completed.height;
    setCompleted(clampPixelCrop({ ...completed, width: dispW, height: dispH, unit: "px" }, img.width, img.height));
    setCrop({ ...completed, width: dispW, height: dispH, unit: "px" });
    if (ratio) setHInput(String(Math.round(dispH * sy)));
  }

  // Edit height via the numeric field (value is in natural px).
  function applyHeight(value: string) {
    setHInput(value);
    const img = imgRef.current;
    if (!img || !completed) return;
    const { sx, sy } = scale();
    const naturalH = clampNum(value, 1, img.naturalHeight);
    if (naturalH === null) return;
    const dispH = naturalH / sy;
    const ratio = ratioFor(aspect);
    const dispW = ratio ? dispH * ratio : completed.width;
    setCompleted(clampPixelCrop({ ...completed, width: dispW, height: dispH, unit: "px" }, img.width, img.height));
    setCrop({ ...completed, width: dispW, height: dispH, unit: "px" });
    if (ratio) setWInput(String(Math.round(dispW * sx)));
  }

  function handleApply() {
    const img = imgRef.current;
    if (!img || !completed || completed.width < 1 || completed.height < 1) return;
    const { sx, sy } = scale();
    const canvas = document.createElement("canvas");
    const cw = Math.round(completed.width * sx);
    const ch = Math.round(completed.height * sy);
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      completed.x * sx,
      completed.y * sy,
      completed.width * sx,
      completed.height * sy,
      0,
      0,
      cw,
      ch,
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onApply(blob, {
          x: Math.round(completed.x * sx),
          y: Math.round(completed.y * sy),
          width: cw,
          height: ch,
          aspect,
        });
      },
      "image/jpeg",
      0.92,
    );
  }

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] grid place-items-center p-4"
      style={{ background: "rgba(15,17,22,.45)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="ui-card w-full max-w-3xl overflow-hidden" style={{ boxShadow: "0 24px 64px rgba(15,17,22,0.24)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Crop / Resize</h3>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-md"
            style={{ color: "var(--text-muted)" }}
            onClick={onCancel}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-start">
          {/* Crop surface */}
          <div
            className="grid place-items-center overflow-hidden rounded-lg"
            style={{ background: "var(--surface-muted)", maxHeight: "60vh" }}
          >
            <ReactCrop
              crop={crop}
              onChange={(_px, percent) => setCrop(percent)}
              onComplete={(px) => setCompleted(px)}
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
                style={{ maxHeight: "60vh", display: "block" }}
              />
            </ReactCrop>
          </div>

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
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }} htmlFor="crop-w">
                  Width (px)
                </label>
                <input
                  id="crop-w"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={wInput}
                  onChange={(e) => applyWidth(e.target.value)}
                  className="ui-field"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }} htmlFor="crop-h">
                  Height (px)
                </label>
                <input
                  id="crop-h"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={hInput}
                  onChange={(e) => applyHeight(e.target.value)}
                  className="ui-field"
                />
              </div>
            </div>

            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              {aspect === "free"
                ? "Drag any edge — width and height are independent."
                : "Aspect locked — the other dimension follows automatically."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <button type="button" className="ui-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------- helpers ---------------------------- */

function toPixelCrop(crop: Crop, imgW: number, imgH: number): PixelCrop {
  if (crop.unit === "px") {
    return { ...crop, unit: "px" } as PixelCrop;
  }
  return {
    unit: "px",
    x: (crop.x / 100) * imgW,
    y: (crop.y / 100) * imgH,
    width: (crop.width / 100) * imgW,
    height: (crop.height / 100) * imgH,
  };
}

function clampPixelCrop(c: PixelCrop, imgW: number, imgH: number): PixelCrop {
  const width = Math.min(c.width, imgW - c.x);
  const height = Math.min(c.height, imgH - c.y);
  return { ...c, width: Math.max(1, width), height: Math.max(1, height) };
}

function clampNum(value: string, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}
