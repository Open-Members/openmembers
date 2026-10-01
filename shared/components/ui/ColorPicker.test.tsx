import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/adminOperations.json';
import { ColorPicker } from './ColorPicker';

afterEach(cleanup);

it('synchronizes copied and restored colors before a blur can commit stale text', () => {
  const change = vi.fn();
  const view = (value: string) => (
    <NextIntlClientProvider locale="en" messages={{ adminOperations: en }}>
      <ColorPicker label="Background" value={value} onChange={change} />
    </NextIntlClientProvider>
  );
  const { rerender } = render(view('#123456'));
  const hex = screen.getByLabelText('Hex color for Background');
  fireEvent.change(hex, { target: { value: '#abc' } });
  rerender(view('#123456'));
  expect(hex).toHaveValue('#abc');
  rerender(view('#abcdef'));
  expect(hex).toHaveValue('#abcdef');
  fireEvent.blur(hex);
  expect(change).not.toHaveBeenCalled();
  rerender(view('#123456'));
  expect(hex).toHaveValue('#123456');
  fireEvent.blur(hex);
  expect(change).not.toHaveBeenCalled();
});
