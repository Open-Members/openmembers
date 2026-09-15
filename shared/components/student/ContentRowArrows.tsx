'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  children: ReactNode;
};

/**
 * Wraps a horizontal scroller and adds desktop arrow buttons that scroll
 * the nearest `[data-row-scroller]` element by 80% of its width.
 * Mobile: arrows are hidden; users swipe.
 */
export function ContentRowArrows({ children }: Props) {
  const t = useTranslations('learningOverview.rows');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const scroller = wrap.querySelector<HTMLElement>('[data-row-scroller]');
    if (!scroller) return;

    const update = () => {
      const atStart = scroller.scrollLeft <= 4;
      const atEnd =
        scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4;
      setCanLeft(!atStart);
      setCanRight(!atEnd);
    };

    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  function scrollBy(direction: 1 | -1) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const scroller = wrap.querySelector<HTMLElement>('[data-row-scroller]');
    if (!scroller) return;
    const amount = scroller.clientWidth * 0.85;
    scroller.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  return (
    <div ref={wrapRef} className="relative">
      {children}

      {/* Left arrow */}
      <button
        type="button"
        aria-label={t('scrollLeft')}
        onClick={() => scrollBy(-1)}
        disabled={!canLeft}
        className={`
          hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10
          items-center justify-center w-10 h-10 rounded-full
          bg-[var(--color-background)]/80 backdrop-blur
          border border-[var(--color-border)] shadow-lg
          text-[var(--color-foreground)]
          transition
          opacity-0 group-hover/row:opacity-100
          disabled:opacity-0 disabled:pointer-events-none
          hover:bg-[var(--color-background)] hover:scale-105
        `}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Right arrow */}
      <button
        type="button"
        aria-label={t('scrollRight')}
        onClick={() => scrollBy(1)}
        disabled={!canRight}
        className={`
          hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10
          items-center justify-center w-10 h-10 rounded-full
          bg-[var(--color-background)]/80 backdrop-blur
          border border-[var(--color-border)] shadow-lg
          text-[var(--color-foreground)]
          transition
          opacity-0 group-hover/row:opacity-100
          disabled:opacity-0 disabled:pointer-events-none
          hover:bg-[var(--color-background)] hover:scale-105
        `}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
