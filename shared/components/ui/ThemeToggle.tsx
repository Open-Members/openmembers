'use client';

import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

const THEME_KEY = 'openmembers:theme';

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      document.documentElement.classList.toggle('dark', event.newValue !== 'light');
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener('storage', onStorage);
  };
}

const getThemeSnapshot = () => document.documentElement.classList.contains('dark');
const getServerTheme = () => true;

export function ThemeToggle({ className = '' }: { className?: string }) {
  const t = useTranslations('navigation');
  const dark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerTheme);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      // The current tab still changes theme when persistent storage is unavailable.
    }
  }

  return (
    <motion.button
      onClick={toggle}
      className={`relative flex items-center justify-center w-9 h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors ${className}`}
      whileTap={{ scale: 0.9 }}
      aria-label={t(dark ? 'switchToLightMode' : 'switchToDarkMode')}
    >
      <motion.div
        key={dark ? 'moon' : 'sun'}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        exit={{ rotate: 90, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </motion.div>
    </motion.button>
  );
}
