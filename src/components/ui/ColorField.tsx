interface ColorFieldProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      {label && (
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      )}
      <input
        type="color"
        value={value}
        title={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-5 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
      />
    </label>
  );
}
