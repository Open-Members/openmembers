import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'strong', 'em', 'b', 'i', 'u',
  'ul', 'ol', 'li', 'br', 'span',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|tel:|#|\/)/i;

let hooksInstalled = false;

function ensureHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // Force-open external links in a new tab and strip referrer/opener
  // leakage. Singleton hook; only this module uses DOMPurify today.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ((node as Element).tagName === 'A' && (node as Element).hasAttribute('href')) {
      (node as Element).setAttribute('target', '_blank');
      (node as Element).setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/**
 * Sanitize untrusted lesson description HTML before feeding it to
 * `dangerouslySetInnerHTML`. Allows a small set of formatting tags and
 * safe URI schemes; everything else is dropped.
 */
export function sanitizeDescription(raw: string): string {
  ensureHooks();
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
  });
}
