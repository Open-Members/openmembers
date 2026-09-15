// Decorative backdrop for the (auth) route group. Tenant-aware primary
// glow at top + subtle grid texture. Sits absolutely inside the auth
// layout's relative container.
export function AuthGradientBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-x-0 top-0 h-[70vh]"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at top, color-mix(in oklab, var(--color-primary) 22%, transparent), transparent 65%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklab, var(--color-foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-foreground) 5%, transparent) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse at center, black, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black, transparent 75%)',
        }}
      />
    </div>
  );
}
