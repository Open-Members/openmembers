import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import messages from '@/core/i18n/locales/en';
import { Link } from '@/core/i18n/routing';
import { DEFAULT_TENANT_SETTINGS } from '@/core/theme/settings';
import { DEFAULT_INSTALLATION_CONFIG } from '@/core/config/installation';
import HomePage from '@/app/[locale]/page';
import SetupPage from '@/app/[locale]/setup/page';
import SuspendedPage from '@/app/[locale]/(public)/suspended/page';
import ThankYouPage from '@/app/[locale]/(checkout)/thank-you/page';
import { LegalPage } from './legal/LegalPage';
import { SiteFooter } from './ui/SiteFooter';
import PublicNavbar from './ui/PublicNavbar';
import { DashboardEmptyState } from '@/features/Dashboard/components/DashboardEmptyState';
import { TopNav } from './navigation/TopNav';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  settings: vi.fn(),
  signOutAndNavigate: vi.fn(),
}));

vi.mock('@/core/config/installation.server', () => ({ getInstallationConfig: mocks.config }));
vi.mock('@/core/theme/settings', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/theme/settings')>(),
  getTenantSettings: mocks.settings,
}));
vi.mock('@/core/config/env', () => ({ hasSupabaseConfiguration: () => false }));
vi.mock('@/core/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/core/supabase/UserProvider', () => ({
  useUser: () => ({
    role: 'user',
    user: { email: 'member@example.test', user_metadata: { display_name: 'Fixture Member' } },
  }),
}));
vi.mock('@/core/i18n/routing', () => ({
  Link: ({ href, children, prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => {
    void prefetch;
    return <a href={href} {...props}>{children}</a>;
  },
  usePathname: () => '/',
}));
vi.mock('@/features/Auth/components/shared/signOut', () => ({ signOutAndNavigate: mocks.signOutAndNavigate }));
vi.mock('@/features/Notifications/components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('@/features/Search/components/SearchTrigger', () => ({ SearchTrigger: () => null }));
vi.mock('@/shared/components/ui/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/features/Auth/components/shared/AuthLogo', () => ({ AuthLogo: () => <Link href="/">Installation logo</Link> }));
vi.mock('@/shared/components/analytics', () => ({ PurchaseTracker: () => null }));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const { default: translations } = await import('@/core/i18n/locales/en');
  return {
    getTranslations: async (namespace: 'landing' | 'landing.home' | 'authPages.setup' | 'footer' | 'legal.common' | 'legal.terms' | 'legal.privacy' | 'thankyou') => createTranslator({ locale: 'en', messages: translations, namespace }),
  };
});

function view(element: ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockResolvedValue(structuredClone(DEFAULT_INSTALLATION_CONFIG));
  mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS });
  mocks.signOutAndNavigate.mockResolvedValue({ success: true });
});

describe('Public installation surfaces', () => {
  it('uses configured public copy and keeps the logo on the entry page', async () => {
    mocks.config.mockResolvedValue({
      ...DEFAULT_INSTALLATION_CONFIG,
      public: { title: 'A second academy', description: 'Learn at your pace.' },
    });
    const page = await HomePage();
    // The footer is its own async server component, exercised separately below.
    view(page.props.children[0]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A second academy');
    expect(screen.getByText('Learn at your pace.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Installation logo' })).toHaveAttribute('href', '/');
  });

  it('keeps neutral translated copy when no entry override exists', async () => {
    const page = await HomePage();
    view(page.props.children[0]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your learning starts here.');
  });

  it('shows the resolved installation name during setup', async () => {
    mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS, site_name: 'Second Academy' });
    view(await SetupPage());
    expect(screen.getByText('Second Academy')).toBeInTheDocument();
    expect(screen.queryByText('Open Members')).not.toBeInTheDocument();
  });

  it('keeps legal fallbacks and hides absent community links', async () => {
    view(await SiteFooter());
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support');
    expect(screen.queryByRole('link', { name: 'Community' })).not.toBeInTheDocument();
  });

  it('renders the second brand and configured footer destinations', async () => {
    mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS, site_name: 'Second Academy' });
    mocks.config.mockResolvedValue({
      ...DEFAULT_INSTALLATION_CONFIG,
      links: {
        ...DEFAULT_INSTALLATION_CONFIG.links,
        terms: 'https://policies.example.test/terms',
        privacy: 'https://policies.example.test/privacy',
        support: 'mailto:help@example.test',
        community: 'https://community.example.test/',
      },
    });
    view(await SiteFooter());
    expect(screen.getByRole('link', { name: 'Second Academy home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', 'https://policies.example.test/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', 'https://policies.example.test/privacy');
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', 'mailto:help@example.test');
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute('href', 'https://community.example.test/');
  });

  it('provides the default product artwork in navigation and footer without changing their destinations', async () => {
    view(<><TopNav siteName="Open Members" />{await SiteFooter()}</>);
    for (const [name, href] of [['Open Members', '/dashboard'], ['Open Members home', '/']] as const) {
      const brandLink = screen.getByRole('link', { name });
      expect(brandLink).toHaveAttribute('href', href);
      const images = within(brandLink).getAllByRole('img', { name: 'Open Members' });
      expect(images.map(image => image.getAttribute('src'))).toEqual([
        ...(href === '/dashboard' ? ['/icon.svg'] : []),
        '/brand/wordmark-dark.svg', '/brand/wordmark-light.svg',
      ]);
    }
  });

  it('keeps a renamed installation free of the default product wordmark when no logo is supplied', async () => {
    mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS, site_name: 'Second Academy' });
    view(<><TopNav siteName="Second Academy" />{await SiteFooter()}</>);
    expect(screen.getByRole('link', { name: 'Second Academy' })).toHaveTextContent('Second Academy');
    expect(screen.getByRole('link', { name: 'Second Academy home' })).toHaveTextContent('Second Academy');
    expect(screen.queryByRole('img', { name: 'Open Members' })).not.toBeInTheDocument();
  });

  it('preserves supplied navigation and legacy footer logos even for the default product name', async () => {
    mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS, logo_url: '/authored-footer.svg' });
    view(<><TopNav siteName="Open Members" logoDarkUrl="/authored-navigation.svg" />{await SiteFooter()}</>);
    const navigation = screen.getByRole('link', { name: 'Open Members' });
    const footer = screen.getByRole('link', { name: 'Open Members home' });
    expect(within(navigation).getAllByRole('img').every(image => image.getAttribute('src') === '/authored-navigation.svg')).toBe(true);
    expect(within(footer).getAllByRole('img').every(image => image.getAttribute('src') === '/authored-footer.svg')).toBe(true);
  });

  it('explains that legal content is absent without inventing a document', async () => {
    view(await LegalPage({ scope: 'terms' }));
    expect(screen.getByText(/has not yet published its Terms of Use/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Read document' })).not.toBeInTheDocument();
  });

  it.each(['terms', 'privacy'] as const)('links to configured %s without an unavailable-policy message', async (scope) => {
    mocks.config.mockResolvedValue({
      ...DEFAULT_INSTALLATION_CONFIG,
      links: { ...DEFAULT_INSTALLATION_CONFIG.links, [scope]: `https://policies.example.test/${scope}` },
    });
    view(await LegalPage({ scope }));
    expect(screen.getByRole('link', { name: 'Read document' })).toHaveAttribute('href', `https://policies.example.test/${scope}`);
    expect(screen.queryByText(/has not yet published/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not configured/)).not.toBeInTheDocument();
  });

  it('never invents a contact address for a suspended account', async () => {
    view(await SuspendedPage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account suspended');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/support@example/)).not.toBeInTheDocument();
  });

  it('does not send suspended members back to protected member support', async () => {
    mocks.config.mockResolvedValue({
      ...DEFAULT_INSTALLATION_CONFIG,
      links: { ...DEFAULT_INSTALLATION_CONFIG.links, support: '/support' },
    });
    view(await SuspendedPage());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers configured help and preserves sign out for suspended members', async () => {
    mocks.config.mockResolvedValue({
      ...DEFAULT_INSTALLATION_CONFIG,
      links: { ...DEFAULT_INSTALLATION_CONFIG.links, help: 'https://help.example.test/' },
    });
    view(await SuspendedPage());
    expect(screen.getByRole('link', { name: 'Contact the organization' })).toHaveAttribute('href', 'https://help.example.test/');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mocks.signOutAndNavigate).toHaveBeenCalledOnce());
  });

  it('keeps the account menu open with a safe error when sign out fails, then permits retry', async () => {
    mocks.signOutAndNavigate
      .mockRejectedValueOnce(new Error('PRIVATE sign-out failure'))
      .mockResolvedValueOnce({ success: true });
    view(<TopNav siteName="Second Academy" />);
    fireEvent.click(screen.getByRole('button', { name: messages.navigation.accountMenu }));

    const signOut = screen.getByRole('menuitem', { name: messages.navigation.signOut });
    fireEvent.click(signOut);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(messages.auth.errors.unexpected));
    expect(document.body).not.toHaveTextContent('PRIVATE');

    fireEvent.click(signOut);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mocks.signOutAndNavigate).toHaveBeenCalledTimes(2);
  });

  it('does not confirm a purchase or promise an email on the return page', async () => {
    view(await ThankYouPage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your access');
    expect(screen.getByText(/This page does not confirm payment or enrollment/)).toBeInTheDocument();
    expect(screen.queryByText(/Thank you for your purchase|check your email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get help' })).not.toBeInTheDocument();
  });

  it('shows a supplied brand and exposes the mobile menu state', () => {
    view(<PublicNavbar brand={<Link href="/">Second Academy</Link>} />);
    expect(screen.getByRole('link', { name: 'Second Academy' })).toHaveAttribute('href', '/');
    const toggle = screen.getByRole('button', { name: 'Toggle menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeInTheDocument();
  });

  it('explains an empty dashboard to the learner without publishing instructions', () => {
    view(<DashboardEmptyState />);
    expect(screen.getByText(/There are no courses to show on this page yet/)).toBeInTheDocument();
    expect(screen.queryByText(/home row|published and added/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse catalog' })).toHaveAttribute('href', '/courses');
  });
});
