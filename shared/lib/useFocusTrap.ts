'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Keyboard focus trap for modal-like surfaces.
 *
 * - Saves the currently focused element when `active` flips to true so
 *   focus can be restored on close.
 * - Focuses the first focusable inside the trapped container.
 * - Tab/Shift+Tab cycles inside the container; can't escape backward
 *   to the page nav or forward to the page footer.
 * - On unmount (or `active` flip back to false) restores focus to the
 *   element that triggered the modal.
 *
 * Intentionally minimal — no `inert` polyfill or page-level scroll
 * lock here. Each consumer owns those concerns (most already lock
 * scroll via overflow-hidden on the body during open).
 *
 * Usage:
 *   const trapRef = useFocusTrap(open);
 *   return <div ref={trapRef as React.RefObject<HTMLDivElement>}>...</div>;
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean,
) {
  const containerRef = useRef<T | null>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;

    triggerRef.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    const list = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) =>
          !el.hasAttribute('aria-hidden') &&
          el.offsetParent !== null /* visible */,
      );

    // Defer first-focus a tick so any entrance animation runs without
    // stealing focus mid-frame.
    const focusFrame = window.requestAnimationFrame(() => {
      const items = list();
      if (items.length > 0) items[0].focus();
    });

    const trappedNode: HTMLElement = container;

    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = list();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !trappedNode.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !trappedNode.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKey);
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [active]);

  return containerRef;
}
