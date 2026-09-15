import { expect, it } from 'vitest';
import { courseAccessHref } from './sales';

it.each([null, '', 'javascript:alert(1)', '//example.test', 'https://user:password@example.test'])('directs a missing or unsafe offer to internal support: %s', value => {
  expect(courseAccessHref(value)).toBe('/support');
});
it('preserves a configured safe offer', () => {
  expect(courseAccessHref('https://checkout.example.test/course')).toBe('https://checkout.example.test/course');
});
