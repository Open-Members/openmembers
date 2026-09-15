/**
 * Three vertical bars that scale independently — the classic broadcast
 * "we're on the air" indicator. Drop-in inline SVG so it inherits the
 * parent's color. Animation timings are intentionally offset so no two
 * bars hit their peak at the same frame.
 */
type Props = {
  className?: string;
};

export function SoundwaveIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <rect
        data-soundwave-bar
        x="2"
        y="3"
        width="3"
        height="10"
        rx="1"
        style={{
          transformOrigin: '50% 50%',
          animation: 'live-wave-a 0.9s ease-in-out infinite',
        }}
      />
      <rect
        data-soundwave-bar
        x="6.5"
        y="3"
        width="3"
        height="10"
        rx="1"
        style={{
          transformOrigin: '50% 50%',
          animation: 'live-wave-b 0.9s ease-in-out infinite 0.15s',
        }}
      />
      <rect
        data-soundwave-bar
        x="11"
        y="3"
        width="3"
        height="10"
        rx="1"
        style={{
          transformOrigin: '50% 50%',
          animation: 'live-wave-c 0.9s ease-in-out infinite 0.3s',
        }}
      />
    </svg>
  );
}
