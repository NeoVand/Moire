/**
 * The Moiré mark: two identical ring families, centres a hair apart — the
 * smallest superposition the tool can draw. Shared by the app chrome, the
 * About card, and the paper site's wordmark.
 */
export function MoireMark({ size = 22, strokeWidth = 1.1 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
        <circle cx="10.4" cy="12" r="2.6" />
        <circle cx="10.4" cy="12" r="5.7" />
        <circle cx="10.4" cy="12" r="8.8" />
        <circle cx="13.6" cy="12" r="2.6" />
        <circle cx="13.6" cy="12" r="5.7" />
        <circle cx="13.6" cy="12" r="8.8" />
      </g>
    </svg>
  );
}
