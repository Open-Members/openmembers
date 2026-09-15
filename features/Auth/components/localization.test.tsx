import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { redirect } from 'next/navigation';
import en from '@/core/i18n/locales/en/auth.json';
import pt from '@/core/i18n/locales/pt/auth.json';
import es from '@/core/i18n/locales/es/auth.json';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import ResetPasswordForm from './ResetPasswordForm';
import ChangePasswordForm from './ChangePasswordForm';
import { SuspendedNotice } from './SuspendedNotice';
import { useAuthAction } from './shared/useAuthAction';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(), signUp: vi.fn(), resetRequest: vi.fn(), updatePassword: vi.fn(),
  changePassword: vi.fn(), signOutAndNavigate: vi.fn(),
}));
vi.mock('../actions', () => ({
  signInWithEmail: mocks.signIn,
  signUpWithEmail: mocks.signUp,
  requestPasswordReset: mocks.resetRequest,
  updatePassword: mocks.updatePassword,
  changeInitialPassword: mocks.changePassword,
}));
vi.mock('@/core/i18n/routing', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock('./shared/signOut', () => ({ signOutAndNavigate: mocks.signOutAndNavigate }));

const catalogs = { en, pt, es };
function wrapper(locale: keyof typeof catalogs) {
  return function LocaleProvider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={{ auth: catalogs[locale] }} timeZone="UTC">{children}</NextIntlClientProvider>;
  };
}
async function submit() {
  const form = document.querySelector('form');
  if (!form) throw new Error('Expected authentication form');
  expect(form).toHaveAttribute('novalidate');
  await act(async () => { fireEvent.submit(form); });
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe.each(['en', 'pt', 'es'] as const)('Auth UI in %s', (locale) => {
  const copy = catalogs[locale];

  it('uses server validation in the selected language instead of browser validation', async () => {
    mocks.signIn.mockResolvedValue({ error: 'invalidEmail' });
    render(<LoginForm />, { wrapper: wrapper(locale) });
    fireEvent.change(screen.getByLabelText(copy.fields.email), { target: { value: 'invalid-address' } });
    await submit();
    expect(mocks.signIn.mock.calls[0][0].get('email')).toBe('invalid-address');
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.invalidEmail);
    expect(screen.getByRole('button', { name: copy.signIn.submit })).toBeEnabled();
  });

  it('never displays raw provider or transport failures, and permits retry', async () => {
    mocks.signIn.mockResolvedValueOnce({ error: 'PRIVATE provider diagnostic' }).mockRejectedValueOnce(new Error('PRIVATE network diagnostic'));
    render(<LoginForm />, { wrapper: wrapper(locale) });
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.unexpected);
    expect(document.body).not.toHaveTextContent('PRIVATE');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.unexpected);
    expect(document.body).not.toHaveTextContent('PRIVATE');
    expect(screen.getByRole('button', { name: copy.signIn.submit })).toBeEnabled();
    expect(mocks.signIn).toHaveBeenCalledTimes(2);
  });

  it('provides a focusable, localized password visibility control', () => {
    render(<LoginForm />, { wrapper: wrapper(locale) });
    const password = screen.getByLabelText(copy.fields.password);
    const toggle = screen.getByRole('button', { name: copy.shared.showPassword });
    expect(toggle.tabIndex).toBe(0);
    expect(toggle).toHaveAttribute('aria-controls', password.id);
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: copy.shared.hidePassword })).toHaveAttribute('aria-pressed', 'true');
    expect(password).toHaveAttribute('type', 'text');
    fireEvent.click(toggle);
    expect(password).toHaveAttribute('type', 'password');
  });

  it('preserves an authored registration CTA and displays localized confirmation with the address as text', async () => {
    const email = '<learner>@example.test';
    mocks.signUp.mockResolvedValue({ success: true, email });
    render(<RegisterForm submitLabel="Custom enrollment" source="youtube" next="/dashboard" campaign="video123" />, { wrapper: wrapper(locale) });
    expect(screen.getByRole('button', { name: 'Custom enrollment' })).toBeVisible();
    await submit();
    expect(mocks.signUp.mock.calls[0][0].get('source')).toBe('youtube');
    expect(mocks.signUp.mock.calls[0][0].get('next')).toBe('/dashboard');
    expect(mocks.signUp.mock.calls[0][0].get('campaign')).toBe('video123');
    expect(screen.getByRole('heading', { name: copy.signUp.confirmationTitle })).toBeVisible();
    expect(screen.getByText(email)).toBeVisible();
    expect(document.querySelector('learner')).toBeNull();
    expect(screen.getByText(copy.signUp.confirmationHelp)).toBeVisible();
  });

  it('shows localized non-enumerating recovery confirmation', async () => {
    mocks.resetRequest.mockResolvedValue({ success: true });
    render(<ForgotPasswordForm />, { wrapper: wrapper(locale) });
    fireEvent.change(screen.getByLabelText(copy.fields.email), { target: { value: 'missing@example.test' } });
    await submit();
    expect(screen.getByRole('heading', { name: copy.recovery.confirmationTitle })).toBeVisible();
    expect(screen.getByText(copy.recovery.confirmationDescription)).toBeVisible();
  });

  it.each([
    ['reset', ResetPasswordForm, mocks.updatePassword],
    ['required change', ChangePasswordForm, mocks.changePassword],
  ] as const)('prevents mismatched passwords before the %s action', async (_flow, Component, action) => {
    render(<Component />, { wrapper: wrapper(locale) });
    fireEvent.change(screen.getByLabelText(copy.fields.newPassword), { target: { value: 'password-one' } });
    fireEvent.change(screen.getByLabelText(copy.fields.confirmPassword), { target: { value: 'password-two' } });
    await submit();
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.passwordMismatch);
    action.mockResolvedValue({ error: 'samePassword' });
    fireEvent.change(screen.getByLabelText(copy.fields.newPassword), { target: { value: 'password-one' } });
    fireEvent.change(screen.getByLabelText(copy.fields.confirmPassword), { target: { value: 'password-one' } });
    await submit();
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.samePassword);
  });

  it('keeps suspended users on the page after a failed sign-out and supports retry', async () => {
    mocks.signOutAndNavigate
      .mockResolvedValueOnce({ error: 'unexpected' })
      .mockResolvedValueOnce({ success: true });
    render(<SuspendedNotice contactUrl={null} />, { wrapper: wrapper(locale) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.suspended.signOut })); });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.unexpected);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.suspended.signOut })); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.signOutAndNavigate).toHaveBeenCalledTimes(2);
  });
});

it('replaces the document at the fixed login path only after sign-out succeeds', async () => {
  const { signOutAndNavigate } = await vi.importActual<typeof import('./shared/signOut')>('./shared/signOut');
  const replaceDocument = vi.fn();

  await expect(signOutAndNavigate(
    vi.fn().mockResolvedValue({ error: new Error('PRIVATE sign-out failure') }),
    replaceDocument,
  )).resolves.toEqual({ error: 'unexpected' });
  expect(replaceDocument).not.toHaveBeenCalled();

  await expect(signOutAndNavigate(
    vi.fn().mockResolvedValue({ error: null }),
    replaceDocument,
  )).resolves.toEqual({ success: true });
  expect(replaceDocument).toHaveBeenCalledOnce();
  expect(replaceDocument).toHaveBeenCalledWith('/login');

  replaceDocument.mockClear();
  await expect(signOutAndNavigate(
    vi.fn().mockRejectedValue(new Error('PRIVATE transport failure')),
    replaceDocument,
  )).rejects.toThrow('PRIVATE transport failure');
  expect(replaceDocument).not.toHaveBeenCalled();
});

it('preserves Next redirects while releasing the pending state', async () => {
  const { result } = renderHook(() => useAuthAction(), { wrapper: wrapper('pt') });
  await act(async () => {
    await expect(result.current.run(async () => redirect('/dashboard'))).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT;'),
    });
  });
  expect(result.current.error).toBeNull();
  expect(result.current.isPending).toBe(false);
});
