interface ColorFieldProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
  swatchOnly?: boolean;
}

export function ColorField({ label, value, onChange, swatchOnly = false }: ColorFieldProps) {
  return (
    <label className={`flex items-center ${swatchOnly ? '' : 'justify-between gap-3'}`}>
      {label && (
        <span className="text-[11px] text-[var(--text-secondary)]">
          {label}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`cursor-pointer rounded border border-[var(--border)] bg-transparent p-0 ${
            swatchOnly ? 'size-5' : 'size-5 rounded-md'
          }`}
        />
        {!swatchOnly && (
          <input
            type="text"
            value={value}
            spellCheck={false}
            onChange={(e) => {
              const next = e.target.value;
              if (/^#[0-9A-Fa-f]{6}$/.test(next)) onChange(next);
            }}
            className="w-[3.6rem] bg-transparent font-mono text-[10px] tabular-nums text-[var(--text-primary)] outline-none"
          />
        )}
      </span>
    </label>
  );
}
