import { describe, it, expect } from 'vitest';
import { sanitizeDescription } from './html-sanitize';

describe('sanitizeDescription', () => {
  describe('allowed tags pass through', () => {
    it('keeps a paragraph', () => {
      expect(sanitizeDescription('<p>hello</p>')).toBe('<p>hello</p>');
    });

    it('keeps headings, lists, inline emphasis', () => {
      const out = sanitizeDescription(
        '<h2>Title</h2><ul><li><strong>bold</strong> <em>em</em></li></ul>',
      );
      expect(out).toContain('<h2>Title</h2>');
      expect(out).toContain('<strong>bold</strong>');
      expect(out).toContain('<em>em</em>');
    });

    it('keeps anchors with safe http(s) URLs and adds target/rel', () => {
      const out = sanitizeDescription('<a href="https://example.com">x</a>');
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain('target="_blank"');
      expect(out).toContain('rel="noopener noreferrer"');
    });
  });

  describe('XSS bypasses that the old regex sanitizer let through', () => {
    it('strips javascript: anchors', () => {
      expect(sanitizeDescription('<a href="javascript:alert(1)">x</a>'))
        .not.toContain('javascript:');
    });

    it('strips javascript: with HTML-entity encoding', () => {
      // The old regex compared raw text, so &#106;avascript: bypassed it.
      const out = sanitizeDescription('<a href="&#106;avascript:alert(1)">x</a>');
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toContain('alert(1)');
    });

    it('strips javascript: with single-quoted href', () => {
      // The old regex only matched double-quoted hrefs, so single quotes
      // dropped through with the malicious URL intact.
      const out = sanitizeDescription("<a href='javascript:alert(1)'>x</a>");
      expect(out).not.toMatch(/javascript:/i);
    });

    it('strips data:text/html anchors', () => {
      const out = sanitizeDescription('<a href="data:text/html,<script>alert(1)</script>">x</a>');
      expect(out).not.toContain('data:');
    });

    it('strips vbscript: anchors', () => {
      const out = sanitizeDescription('<a href="vbscript:msgbox(1)">x</a>');
      expect(out).not.toContain('vbscript:');
    });

    it('strips on* event handler attributes on allowed tags', () => {
      const out = sanitizeDescription('<p onclick="alert(1)">hi</p>');
      expect(out).not.toContain('onclick');
      expect(out).not.toContain('alert');
    });

    it('strips a stand-alone script tag (no closing)', () => {
      // The old sanitizer only stripped <script>...</script> blocks with a
      // matching closer. A bare <script> survived.
      const out = sanitizeDescription('<script>alert(1)<p>hi</p>');
      expect(out).not.toContain('<script');
      expect(out).not.toContain('alert(1)');
    });

    it('strips iframe + object + embed', () => {
      const out = sanitizeDescription(
        '<iframe src="evil"></iframe><object></object><embed>',
      );
      expect(out).not.toContain('<iframe');
      expect(out).not.toContain('<object');
      expect(out).not.toContain('<embed');
    });

    it('strips style tags (CSS injection vector)', () => {
      const out = sanitizeDescription('<style>body{display:none}</style><p>hi</p>');
      expect(out).not.toContain('<style');
      expect(out).toContain('<p>hi</p>');
    });

    it('strips svg-based XSS vectors', () => {
      const out = sanitizeDescription('<svg/onload=alert(1)>');
      expect(out).not.toContain('onload');
      expect(out).not.toContain('alert(1)');
    });

    it('strips img tags entirely (not in allowlist)', () => {
      const out = sanitizeDescription('<img src=x onerror=alert(1)>');
      expect(out).not.toContain('<img');
      expect(out).not.toContain('onerror');
    });
  });

  describe('non-malicious edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeDescription('')).toBe('');
    });

    it('preserves text content even when stripping outer tag', () => {
      const out = sanitizeDescription('<div>hello</div>');
      expect(out).toContain('hello');
    });

    it('keeps mailto links', () => {
      const out = sanitizeDescription('<a href="mailto:hi@example.com">mail</a>');
      expect(out).toContain('href="mailto:hi@example.com"');
    });

    it('keeps relative anchor links', () => {
      const out = sanitizeDescription('<a href="#section">jump</a>');
      expect(out).toContain('href="#section"');
    });
  });
});
