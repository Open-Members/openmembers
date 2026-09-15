import Image from 'next/image';
import { Link } from '@/core/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { Play, Info } from 'lucide-react';

type CTA = {
  label: string;
  href: string;
  icon?: React.ReactNode;
  /** External links open in a new tab. */
  external?: boolean;
};

type HeroBannerProps = {
  /** Optional. If set, trailer takes precedence. Unused if `trailerYoutubeId` is set. */
  imageUrl?: string | null;
  /** If provided, renders an autoplaying muted looped YouTube iframe. */
  trailerYoutubeId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  eyebrow?: string | null;
  primaryCta?: CTA | null;
  secondaryCta?: CTA | null;
  /** Tailwind height / aspect override. Default preserves the 21:9 banner
   *  aspect on every viewport so admin-authored artwork never gets its
   *  edges cropped (the old `aspect-video` default chewed ~17% off the
   *  sides on mobile, eating baked-in titles). */
  heightClass?: string;
  /**
   * 0..100 — darkness of the gradient overlay at the bottom of the banner.
   * Admin-configurable so busy banners can lean on more overlay for
   * legibility while minimal banners can lean on less. Default 70.
   */
  overlayOpacity?: number;
  /**
   * When false, the overlaid title + subtitle are hidden — useful when the
   * banner artwork already carries the headline and the text would crowd
   * a focal subject. Eyebrow and CTAs remain visible so the hero still
   * funnels users into the course. Default true.
   */
  showText?: boolean;
  /**
   * When true, the overlaid text block (eyebrow + title + subtitle) is
   * centered horizontally on mobile, left-aligned from md breakpoint up.
   * Used by the dashboard welcome hero where centered copy reads more
   * like a greeting than an editorial headline. Default false.
   */
  centerTextMobile?: boolean;
  /**
   * When true, the eyebrow leaves the banner overlay on mobile and renders
   * in its own block below the banner (same pattern the CTAs already use),
   * so the artwork stays clean on narrow viewports. Desktop unchanged.
   * Default false.
   */
  eyebrowBelowOnMobile?: boolean;
};

/**
 * Full-bleed cinematic banner used on the dashboard, course detail, and
 * instructor pages. Trailer autoplays muted when available, static image
 * otherwise. Gradient overlay keeps foreground legible over any artwork.
 */
export function HeroBanner({
  imageUrl,
  trailerYoutubeId,
  title,
  subtitle,
  eyebrow,
  primaryCta,
  secondaryCta,
  heightClass = 'aspect-[21/9] md:max-h-[560px]',
  overlayOpacity = 70,
  showText = true,
  centerTextMobile = false,
  eyebrowBelowOnMobile = false,
}: HeroBannerProps) {
  const t = useTranslations('learningOverview.hero');
  const locale = useLocale();
  const hasMedia = Boolean(trailerYoutubeId || imageUrl);

  const ctaBlock = (primaryCta || secondaryCta) ? (
    <div className="flex flex-wrap items-center gap-3">
      {primaryCta && <HeroCta cta={primaryCta} variant="primary" />}
      {secondaryCta && <HeroCta cta={secondaryCta} variant="ghost" />}
    </div>
  ) : null;

  // Clamp + convert 0..100 to 0..1; middle stop at ~45% of the bottom
  // keeps the gradient feeling natural rather than a flat wash.
  const overlay = Math.max(0, Math.min(100, overlayOpacity)) / 100;
  const overlayStyle: React.CSSProperties = {
    background: `linear-gradient(to top, rgba(0,0,0,${overlay}) 0%, rgba(0,0,0,${overlay * 0.45}) 40%, transparent 100%)`,
  };

  return (
    <div className="flex flex-col">
    <section
      className={`relative w-full overflow-hidden ${heightClass} bg-[var(--color-background)]`}
    >
      {/* Media layer */}
      {trailerYoutubeId ? (
        <iframe
          className="absolute inset-0 w-full h-full pointer-events-none"
          // Scaled up to hide YouTube's own letterbox bars.
          style={{
            width: '120%',
            height: '120%',
            left: '-10%',
            top: '-10%',
          }}
          src={`https://www.youtube-nocookie.com/embed/${trailerYoutubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerYoutubeId}&modestbranding=1&showinfo=0&rel=0&iv_load_policy=3&playsinline=1&hl=${locale}`}
          title={title ?? t('trailer')}
          allow="autoplay; encrypted-media"
          loading="eager"
          tabIndex={-1}
        />
      ) : imageUrl ? (
        <Image
          src={imageUrl}
          alt={title ?? ''}
          fill
          sizes="100vw"
          priority
          className="object-cover animate-ken-burns"
          unoptimized
        />
      ) : (
        // Placeholder gradient when nothing is set
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
          }}
        />
      )}

      {/* Legibility gradient — opacity admin-controlled via overlayOpacity. */}
      {hasMedia && overlay > 0 && (
        <div className="absolute inset-0" style={overlayStyle} />
      )}

      {/* Content */}
      <div className="relative h-full flex items-end">
        <div
          className={`w-full flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-8 px-6 md:px-10 lg:px-14 pb-10 md:pb-14 lg:pb-20 ${
            centerTextMobile ? 'items-center md:items-end' : ''
          }`}
        >
          {/* Left column — eyebrow, and (when enabled) title/subtitle/CTA stack */}
          <div
            className={`max-w-3xl space-y-4 ${
              centerTextMobile ? 'text-center md:text-left' : ''
            }`}
          >
            {eyebrow && (
              <p
                className={`text-[11px] md:text-xs font-semibold uppercase tracking-[0.3em] text-white/70 ${
                  eyebrowBelowOnMobile ? 'hidden md:block' : ''
                }`}
              >
                {eyebrow}
              </p>
            )}
            {showText && title && (
              <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-medium text-white leading-[1.04] tracking-tight max-w-3xl drop-shadow-lg">
                {title}
              </h1>
            )}
            {showText && subtitle && (
              <p className="text-base md:text-lg text-white/85 max-w-xl drop-shadow font-light leading-relaxed">
                {subtitle}
              </p>
            )}
            {showText && ctaBlock && (
              <div className="pt-2 hidden md:block">{ctaBlock}</div>
            )}
          </div>

          {/*
            Desktop CTA placement:
            - showText=true  → inside the left-stack under title/subtitle (above)
            - showText=false → to the right so it clears any baked-in headline
            On mobile both branches hide the inline CTA and re-render it
            below the banner (see the md:hidden block after </section>).
            This guarantees the CTA never lands on top of the artwork on
            narrow viewports, where there's no horizontal room to dodge.
          */}
          {!showText && ctaBlock && (
            <div className="hidden md:block md:flex-shrink-0">{ctaBlock}</div>
          )}
        </div>
      </div>
    </section>
    {eyebrowBelowOnMobile && eyebrow && (
      <p className="md:hidden px-6 pt-5 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-muted-foreground)]">
        {eyebrow}
      </p>
    )}
    {ctaBlock && (
      <div className="md:hidden px-6 pt-5 flex justify-center">
        {ctaBlock}
      </div>
    )}
    </div>
  );
}

function HeroCta({ cta, variant }: { cta: CTA; variant: 'primary' | 'ghost' }) {
  const base =
    'inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 rounded-lg text-sm md:text-base font-semibold transition';
  const classes =
    variant === 'primary'
      ? `${base} bg-white text-black hover:bg-white/90`
      : `${base} bg-white/10 text-[var(--color-foreground)] backdrop-blur-sm hover:bg-white/20 border border-[var(--color-border)] md:text-white md:border-white/20`;

  const icon =
    cta.icon ??
    (variant === 'primary' ? (
      <Play className="w-4 h-4 fill-current" />
    ) : (
      <Info className="w-4 h-4" />
    ));

  if (cta.external) {
    return (
      <a
        href={cta.href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        {icon}
        {cta.label}
      </a>
    );
  }

  return (
    <Link href={cta.href} className={classes}>
      {icon}
      {cta.label}
    </Link>
  );
}
