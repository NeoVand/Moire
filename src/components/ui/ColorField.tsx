interface ColorFieldProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      {label && (
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
          {label}
        </span>
      )}
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 cursor-pointer rounded-md border border-[var(--border)] bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(next)) onChange(next);
          }}
          className="w-[4.5rem] bg-transparent font-mono text-[11px] text-[var(--text-primary)] outline-none"
        />
      </span>
    </label>
  );
}
