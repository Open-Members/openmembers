"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Link } from "@/core/i18n/routing";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";

export default function PublicNavbar({ brand }: { brand: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const t = useTranslations('landing.navbar');

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav aria-label={t('navigationLabel')} className="fixed top-0 z-50 w-full">
      <div
        className={`relative z-10 transition-all duration-300 ${
          scrolled
            ? 'bg-[var(--color-background)]/80 backdrop-blur-xl backdrop-saturate-150 border-b border-[var(--color-border)] shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="min-w-0 max-w-[65%]">{brand}</div>

          {/* Desktop items */}
          <div className="hidden items-center gap-8 md:flex">
            <Link
              href="/login"
              className="text-sm font-semibold text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            >
              {t('login')}
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-[var(--color-primary-foreground)] shadow-[0_3px_0_var(--color-primary-dark)] transition-all hover:brightness-110 active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-primary-dark)]"
            >
              {t('startFree')}
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="flex min-h-11 min-w-11 items-center justify-center text-[var(--color-foreground)] md:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={t('toggleMenu')}
            aria-expanded={isOpen}
            aria-controls="public-mobile-menu"
          >
            {isOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 top-0 bg-black/20 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              id="public-mobile-menu"
              className="absolute left-4 right-4 top-[72px] z-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-xl md:hidden"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-col gap-1">
                <Link
                  href="/login"
                  className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                  onClick={() => setIsOpen(false)}
                >
                  {t('login')}
                </Link>
                <div className="my-2 h-px bg-[var(--color-border)]" />
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-[var(--color-primary-foreground)] shadow-[0_3px_0_var(--color-primary-dark)] transition-all active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-primary-dark)]"
                  onClick={() => setIsOpen(false)}
                >
                  {t('startFree')}
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}
