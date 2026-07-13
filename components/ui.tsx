"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Client-side pagination state for an already-filtered list. Resets to page 1
 *  when `resetKey` changes (e.g. filters), and clamps the page into range when
 *  the result count shrinks. */
export function usePagination<T>(items: T[], pageSize = 10, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const start = (page - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);

  return { page, setPage, totalPages, total, pageSize, start, pageItems };
}

/** A sliding window of at most 5 consecutive page numbers centered on the
 *  current page, clamped to range — no ellipses. */
function pageTokens(page: number, totalPages: number): number[] {
  const WINDOW = 5;
  if (totalPages <= WINDOW) return Array.from({ length: totalPages }, (_, i) => i + 1);
  let start = page - 2;
  let end = page + 2;
  if (start < 1) {
    end += 1 - start;
    start = 1;
  }
  if (end > totalPages) {
    start -= end - totalPages;
    end = totalPages;
  }
  start = Math.max(1, start);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  unit = "item",
  unitPlural,
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  unit?: string;
  unitPlural?: string;
  className?: string;
}) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const tokens = pageTokens(page, totalPages);
  const noun = total === 1 ? unit : unitPlural ?? `${unit}s`;

  return (
    <div className={"flex flex-wrap items-center justify-between gap-3 " + (className ?? "")}>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Showing <span className="tabular-nums font-medium">{from}</span>–
        <span className="tabular-nums font-medium">{to}</span> of{" "}
        <span className="tabular-nums font-medium">{total}</span> {noun}
      </p>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1.5" aria-label="Pagination">
          <PageBtn disabled={page <= 1} onClick={() => onPage(page - 1)} label="Previous">
            &#171;
          </PageBtn>

          {tokens.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPage(t)}
              disabled={t === page}
              aria-current={t === page ? "page" : undefined}
              className="min-w-9 h-9 px-2.5 inline-flex items-center justify-center text-sm font-semibold rounded-md border transition tabular-nums enabled:hover:bg-[var(--surface-muted)] disabled:cursor-default"
              style={{
                background: t === page ? "var(--btn-primary-bg)" : "var(--surface)",
                color: t === page ? "var(--btn-primary-fg)" : "var(--text-secondary)",
                borderColor: t === page ? "var(--btn-primary-bg)" : "var(--border-soft)",
              }}
            >
              {t}
            </button>
          ))}

          <PageBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)} label="Next">
            &#187;
          </PageBtn>
        </nav>
      )}
    </div>
  );
}

function PageBtn({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-9 h-9 inline-flex items-center justify-center text-base font-semibold leading-none rounded-md border transition enabled:hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-soft)" }}
    >
      {children}
    </button>
  );
}

/** Kebab action dropdown for a table row. Renders the menu in a fixed-position
 *  portal so the table's overflow-x-auto can't clip it. Closes on outside
 *  click / Esc / scroll. */
/* ---------- Custom calendar date picker ---------- */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parse a "YYYY-MM-DD" string into a local Date (no timezone shift). */
function parseISODate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as "YYYY-MM-DD" in local time. */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * A custom (non-native) calendar popover. Renders `children` as the trigger;
 * clicking it opens a floating month grid. Picking a day calls `onChange` with
 * a "YYYY-MM-DD" string. Closes on outside-click, Escape, or scroll/resize.
 */
export function DatePicker({
  value,
  onChange,
  triggerClassName,
  triggerStyle,
  ariaLabel,
  min,
  max,
  children,
}: {
  value: string;
  onChange: (date: string) => void;
  triggerClassName?: string;
  triggerStyle?: React.CSSProperties;
  ariaLabel?: string;
  /** Optional inclusive bounds as "YYYY-MM-DD"; days outside are disabled. */
  min?: string;
  max?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const selected = useMemo(() => parseISODate(value), [value]);
  // Month currently shown in the grid; seeded from the selected date.
  const [view, setView] = useState(() => selected ?? new Date());
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const PANEL_W = 260;

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(r.left, window.innerWidth - PANEL_W - 8);
    setPos({ top: r.bottom + 6, left: Math.max(8, left) });
  };

  useEffect(() => {
    if (!open) return;
    // Reset the visible month to the selected date each time we open.
    setView(selected ?? new Date());
    place();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScrollResize() {
      setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Build the 6x7 grid of days for the visible month.
  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // back up to the Sunday on/before the 1st
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view]);

  const today = new Date();
  const minDate = useMemo(() => (min ? parseISODate(min) : null), [min]);
  const maxDate = useMemo(() => (max ? parseISODate(max) : null), [max]);
  const outOfRange = (d: Date) =>
    (minDate != null && d < minDate && !sameDay(d, minDate)) ||
    (maxDate != null && d > maxDate && !sameDay(d, maxDate));

  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName}
        style={triggerStyle}
      >
        {children}
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label="Choose a date"
              className="fixed z-[80] rounded-xl border p-3 select-none"
              style={{
                top: pos.top,
                left: pos.left,
                width: PANEL_W,
                background: "var(--surface)",
                borderColor: "var(--border-soft)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
              }}
            >
              {/* Month header + nav */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                  className="w-7 h-7 rounded-md inline-flex items-center justify-center transition hover:bg-[var(--surface-muted)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <div className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {MONTHS[view.getMonth()]} {view.getFullYear()}
                </div>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                  className="w-7 h-7 rounded-md inline-flex items-center justify-center transition hover:bg-[var(--surface-muted)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>

              {/* Weekday labels */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="h-6 flex items-center justify-center text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>
                    {w}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d) => {
                  const inMonth = d.getMonth() === view.getMonth();
                  const isSel = selected ? sameDay(d, selected) : false;
                  const isToday = sameDay(d, today);
                  const disabled = outOfRange(d);
                  return (
                    <button
                      key={d.getTime()}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onChange(toISODate(d));
                        setOpen(false);
                      }}
                      className="h-8 rounded-md text-xs tabular-nums transition inline-flex items-center justify-center enabled:hover:bg-[var(--surface-muted)] disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: isSel ? "var(--accent, #2f6fed)" : undefined,
                        color: isSel
                          ? "#fff"
                          : inMonth
                            ? "var(--text-secondary)"
                            : "var(--text-faint)",
                        fontWeight: isSel || isToday ? 600 : 400,
                        boxShadow: !isSel && isToday ? "inset 0 0 0 1px var(--border-soft)" : undefined,
                      }}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Footer — quick jump to today */}
              <div className="mt-2 pt-2 flex justify-end" style={{ borderTop: "1px solid var(--border-soft)" }}>
                <button
                  type="button"
                  disabled={outOfRange(today)}
                  onClick={() => {
                    onChange(toISODate(new Date()));
                    setOpen(false);
                  }}
                  className="text-[11px] font-medium px-2 py-1 rounded-md transition enabled:hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "var(--accent, #2f6fed)" }}
                >
                  Today
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a "YYYY-MM-DD" string as "09 Jul 2026", or "" when unparseable. */
function formatDisplayDate(value: string): string {
  const d = parseISODate(value);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Drop-in replacement for a native `<input type="date">`, styled as a `ui-field`
 * and backed by the custom {@link DatePicker} popover. Shows the selected date
 * as "09 Jul 2026" (or `placeholder` when empty) with a trailing calendar icon.
 */
export function DateField({
  value,
  onChange,
  className = "ui-field w-full",
  style,
  min,
  max,
  ariaLabel,
  placeholder = "Select date",
}: {
  value: string;
  onChange: (date: string) => void;
  className?: string;
  style?: React.CSSProperties;
  min?: string;
  max?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const display = formatDisplayDate(value);
  return (
    <DatePicker
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      min={min}
      max={max}
      triggerClassName={`${className} text-left inline-flex items-center justify-between gap-2`}
      triggerStyle={{ cursor: "pointer", ...style }}
    >
      <span
        className="truncate tabular-nums"
        style={{ color: display ? "var(--text-primary)" : "var(--text-faint)" }}
      >
        {display || placeholder}
      </span>
      <svg
        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden
      >
        <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" />
      </svg>
    </DatePicker>
  );
}

/** A clickable entry, or "separator" for a divider line between groups. */
export type ActionMenuItem =
  | { label: string; onClick: () => void; danger?: boolean }
  | "separator";

export function ActionMenu({
  label,
  items,
}: {
  label: string;
  items: ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Focus the first item once the menu is placed, so arrow keys work
  // immediately after opening with Enter/Space on the trigger.
  useEffect(() => {
    if (open && pos) itemRefs.current[0]?.focus();
  }, [open, pos]);

  function onMenuKey(e: React.KeyboardEvent) {
    const buttons = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (idx + 1) % buttons.length;
    else if (e.key === "ArrowUp") next = idx <= 0 ? buttons.length - 1 : idx - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    else if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      buttons[next].focus();
    }
  }

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScrollResize() {
      setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center border hover:bg-[var(--surface-muted)] transition"
        style={{ color: open ? "var(--text-primary)" : "var(--text-muted)", borderColor: "var(--border-soft)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKey}
              className="fixed z-[80] min-w-40 rounded-lg border overflow-hidden py-1"
              style={{
                top: pos.top,
                right: pos.right,
                background: "var(--surface)",
                borderColor: "var(--border-soft)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
                transformOrigin: "top right",
                animation: "uiMenuPop 130ms cubic-bezier(.2,.7,.2,1)",
              }}
            >
              {items.map((item, i) =>
                item === "separator" ? (
                  <div
                    key={`sep-${i}`}
                    role="separator"
                    className="my-1 h-px"
                    style={{ background: "var(--border-soft)" }}
                  />
                ) : (
                  <button
                    key={item.label}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      item.onClick();
                    }}
                    className="w-full px-3 py-2 text-left text-xs transition hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] outline-none"
                    style={{ color: item.danger ? "var(--danger)" : "var(--text-secondary)" }}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
