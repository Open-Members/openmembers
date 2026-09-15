import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/adminContent.json';
import pt from '@/core/i18n/locales/pt/adminContent.json';
import es from '@/core/i18n/locales/es/adminContent.json';
import { VideoUpload } from './VideoUpload';

const catalogs = { en, pt, es } as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(Object.entries(catalogs))(
  'shows the %s unavailable state and prevents uploads while keeping removal possible',
  (locale, messages) => {
    const fetcher = vi.fn();
    const removed = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={{ adminContent: messages }}
      >
        <VideoUpload
          scopeId="draft"
          existingKey="old.mp4"
          onUploaded={vi.fn()}
          onRemoved={removed}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.videoUploadsAreUnavailableUntilR2StorageIsConfigured,
    );
    expect(screen.getByLabelText(messages.uploadVideoFile)).toBeDisabled();
    expect(
      screen.getByRole('button', { name: messages.chooseADifferentFile }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(messages.uploadVideoFile), {
      target: {
        files: [new File(['test'], 'video.mp4', { type: 'video/mp4' })],
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: messages.removeVideo }));
    expect(removed).toHaveBeenCalledOnce();
  },
);
