/**
 * The Moiré mark: two identical ring families, centres a hair apart — the
 * smallest superposition the tool can draw. Shared by the app chrome, the
 * About card, and the paper site's wordmark.
 */
const RADII = [2.2, 4.9, 7.6, 10.3];

export function MoireMark({ size = 22, strokeWidth = 0.85 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
        {RADII.map((r) => (
          <circle key={`a${r}`} cx="10.6" cy="12" r={r} />
        ))}
        {RADII.map((r) => (
          <circle key={`b${r}`} cx="13.4" cy="12" r={r} />
        ))}
      </g>
    </svg>
  );
}
