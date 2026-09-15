import { describe, expect, it } from 'vitest';
import { validateCustomMenuInput } from './input';

const item = { label: 'Community', url: 'https://community.example.test', iconName: 'Users', isEnabled: true };
describe('custom navigation settings', () => {
  it('normalizes the persisted destination and trims the label', () => {
    expect(validateCustomMenuInput({ ...item, label: ' Community ' })).toEqual({ ...item, url: 'https://community.example.test/' });
  });
  it.each([{ url: 'javascript:alert(1)' }, { url: '//evil.test' }, { label: '' }, { label: 'x'.repeat(81) }, { iconName: 'NotAnIcon' }, { isEnabled: 'true' }])('rejects invalid input %s', input => {
    expect(validateCustomMenuInput({ ...item, ...input })).toHaveProperty('error');
  });
  it('returns stable codes for labels and destinations', () => {
    expect(validateCustomMenuInput({ ...item, label: '' })).toEqual({ error: 'labelRequired' });
    expect(validateCustomMenuInput({ ...item, label: 'x'.repeat(81) })).toEqual({ error: 'labelTooLong' });
    expect(validateCustomMenuInput({ ...item, url: 'javascript:alert(1)' })).toEqual({ error: 'invalidUrl' });
  });
});
