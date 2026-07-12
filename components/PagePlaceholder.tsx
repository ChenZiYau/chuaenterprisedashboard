export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div
      className="rounded-xl px-6 py-10"
      style={{ background: "var(--surface)", border: "1.5px dashed var(--border-strong)" }}
    >
      <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="text-sm mt-1.5 max-w-prose" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
    </div>
  );
}
