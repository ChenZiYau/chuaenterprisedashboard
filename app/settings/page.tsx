"use client";

import { useTheme, type ThemePreference } from "@/components/ThemeProvider";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  preview: { bg: string; surface: string; text: string; accent: string };
}[] = [
  {
    value: "light",
    label: "Light",
    preview: { bg: "#f6f7f9", surface: "#ffffff", text: "#14171c", accent: "#14171c" },
  },
  {
    value: "dark",
    label: "Dark",
    preview: { bg: "#101216", surface: "#171a20", text: "#eceef1", accent: "#ffffff" },
  },
  {
    value: "system",
    label: "System",
    preview: { bg: "linear-gradient(90deg,#f6f7f9 50%,#101216 50%)", surface: "transparent", text: "#888", accent: "#888" },
  },
];

export default function SettingsPage() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      {/* Appearance */}
      <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-x-8 gap-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
            Appearance
          </p>
          <h3 className="text-sm font-semibold mt-1" style={{ color: "var(--text-primary)" }}>
            Theme
          </h3>
          <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Currently showing the{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{resolved}</span> theme.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPTIONS.map((opt) => {
            const active = preference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPreference(opt.value)}
                className="text-left p-4 rounded-xl transition flex flex-col gap-3"
                style={{
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: active ? "var(--btn-primary-bg)" : "var(--border-soft)",
                  background: "var(--surface)",
                  boxShadow: active ? "0 0 0 3px var(--focus-ring)" : "none",
                }}
              >
                {/* Mini preview */}
                <div
                  className="h-16 w-full rounded-lg relative overflow-hidden"
                  style={{ background: opt.preview.bg, border: "1px solid var(--border-soft)" }}
                >
                  {opt.value !== "system" ? (
                    <>
                      <span
                        className="absolute left-2 top-2 right-2 h-2 rounded-sm"
                        style={{ background: opt.preview.surface }}
                      />
                      <span
                        className="absolute left-2 bottom-2 w-8 h-2 rounded-sm"
                        style={{ background: opt.preview.accent }}
                      />
                      <span
                        className="absolute left-12 bottom-2 right-2 h-2 rounded-sm opacity-60"
                        style={{ background: opt.preview.text }}
                      />
                    </>
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {opt.label}
                  </p>
                  {active ? (
                    <span
                      className="text-[10px] uppercase tracking-[0.14em] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: "var(--btn-primary-bg)", color: "var(--btn-primary-fg)" }}
                    >
                      Active
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
