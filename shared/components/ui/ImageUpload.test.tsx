import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ImageUpload } from './ImageUpload';
import messages from '@/core/i18n/locales/en/adminOperations.json';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), deleteImage: vi.fn(), toast: vi.fn() }));
vi.mock('@/core/storage/actions', () => ({ createSignedUploadUrlAction: mocks.upload, deleteImageAction: mocks.deleteImage }));
vi.mock('@/shared/lib/toast', () => ({ appToast: { danger: mocks.toast, success: mocks.toast } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ signedUrl: 'https://storage.example.test/signed', publicUrl: 'https://storage.example.test/new.svg', path: 'branding/new.svg' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderUpload(element: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ adminOperations: messages }}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe('image changes remain a draft until their record is saved', () => {
  it('removes an image from the form without deleting the saved file', () => {
    const change = vi.fn();
    const { rerender } = renderUpload(<ImageUpload label="Logo" value="/original.svg" folder="branding" onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Logo' }));
    expect(change).toHaveBeenCalledWith(null, null);
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    // Discarding the parent form can still display the original asset.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ adminOperations: messages }}>
        <ImageUpload label="Logo" value="/original.svg" folder="branding" onChange={change} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute('src', '/original.svg');
  });

  it('uploads a replacement without deleting the published image', async () => {
    const change = vi.fn();
    renderUpload(<ImageUpload label="Logo" value="/original.svg" folder="branding" onChange={change} />);
    fireEvent.change(screen.getByLabelText('Choose file for Logo'), { target: { files: [new File(['<svg/>'], 'new.svg', { type: 'image/svg+xml' })] } });
    await waitFor(() => expect(change).toHaveBeenCalledWith('https://storage.example.test/new.svg', 'branding/new.svg'));
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  });

  it('keeps the current reference if the replacement upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const change = vi.fn();
    renderUpload(<ImageUpload label="Logo" value="/original.svg" folder="branding" onChange={change} />);
    fireEvent.change(screen.getByLabelText('Choose file for Logo'), { target: { files: [new File(['<svg/>'], 'new.svg', { type: 'image/svg+xml' })] } });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Could not upload the image. Try again.'));
    expect(change).not.toHaveBeenCalled();
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute('src', '/original.svg');
  });

  it('does not expose a storage error returned while preparing an upload', async () => {
    mocks.upload.mockResolvedValue({ error: 'bucket secret: internal-provider-detail' });
    renderUpload(<ImageUpload label="Logo" folder="branding" onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Choose file for Logo'), {
      target: { files: [new File(['<svg/>'], 'new.svg', { type: 'image/svg+xml' })] },
    });

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Could not prepare the upload. Try again.'));
    expect(screen.queryByText(/internal-provider-detail/u)).not.toBeInTheDocument();
  });

  it('derives the visible technical format list from the accepted MIME types', () => {
    renderUpload(
      <ImageUpload
        label="Favicon"
        folder="branding"
        accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/gif"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('PNG / ICO / GIF · up to 50 MB')).toBeInTheDocument();
  });
});
