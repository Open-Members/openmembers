import { describe, expect, it } from 'vitest';
import { isStructurallySame, parse } from '@formatjs/icu-messageformat-parser';
import en from './locales/en';
import pt from './locales/pt';
import es from './locales/es';
import { icuBranchStructure, messageLeaves } from './audit/catalog-utils';
import {
  catalogEqualityAllowlist,
  equalityAllowances,
} from './audit/equality-allowlist';

const catalogs = { en, pt, es };

// These contracts cover the catalogs exported to the application, including new
// namespaces. They do not establish linguistic quality or full UI coverage.
describe.each(Object.entries(catalogs))('%s message catalog', (locale, catalog) => {
  it('contains nonempty messages in every namespace', () => {
    const messages = messageLeaves(catalog);
    expect(Object.keys(messages).length).toBeGreaterThan(0);
    for (const [key, message] of Object.entries(messages)) {
      expect(message.trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('contains valid ICU messages', () => {
    for (const [key, message] of Object.entries(messageLeaves(catalog))) {
      expect(() => parse(message), `${locale}.${key}`).not.toThrow();
    }
  });
});

describe.each(['pt', 'es'] as const)('%s catalog compatibility with English', (locale) => {
  it('exports exactly the same message keys', () => {
    expect(Object.keys(messageLeaves(catalogs[locale])).sort())
      .toEqual(Object.keys(messageLeaves(en)).sort());
  });

  it('preserves ICU parameter names and types, including nested messages and rich tags', () => {
    const translated = messageLeaves(catalogs[locale]);
    for (const [key, message] of Object.entries(messageLeaves(en))) {
      const candidate = translated[key];
      expect(candidate, `${locale}.${key}`).toBeDefined();
      const result = isStructurallySame(parse(message), parse(candidate));
      expect(result.success, `${locale}.${key}: ${result.error?.message ?? 'ICU parameters differ'}`)
        .toBe(true);
      expect(
        icuBranchStructure(parse(candidate)),
        `${locale}.${key}: ICU branches differ`,
      ).toEqual(icuBranchStructure(parse(message)));
    }
  });

  it('has only reviewed values that are identical to English', () => {
    const english = messageLeaves(en);
    const translated = messageLeaves(catalogs[locale]);
    const actual = Object.keys(english)
      .filter((key) => translated[key] === english[key])
      .sort();
    const allowed = [...equalityAllowances(catalogEqualityAllowlist[locale]).keys()]
      .sort();

    const unexpected = actual.filter((key) => !allowed.includes(key));
    const stale = allowed.filter((key) => !actual.includes(key));
    expect({ unexpected, stale }, `${locale} equality allowlist`).toEqual({
      unexpected: [],
      stale: [],
    });
  });
});

describe('ICU branch audit regression', () => {
  const source =
    '{count, plural, one {{name} has # item} other {{name} has # items}}';

  it('detects a removed plural branch', () => {
    const withoutOne = '{count, plural, other {{name} has # items}}';
    expect(isStructurallySame(parse(source), parse(withoutOne)).success).toBe(true);
    expect(icuBranchStructure(parse(withoutOne))).not.toEqual(
      icuBranchStructure(parse(source)),
    );
  });

  it('detects an argument moved between branches', () => {
    const moved =
      '{count, plural, one {One item} other {{name} has # items from {name}}}';
    expect(isStructurallySame(parse(source), parse(moved)).success).toBe(true);
    expect(icuBranchStructure(parse(moved))).not.toEqual(
      icuBranchStructure(parse(source)),
    );
  });
});
