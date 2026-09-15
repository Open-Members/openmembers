import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { routing } from '@/core/i18n/routing';
import { notFound } from 'next/navigation';
import {
  MetaPixel,
  GoogleAnalytics,
} from '@/shared/components/analytics';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const [effectiveLocale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={effectiveLocale} messages={messages}>
      {children}
      <MetaPixel />
      <GoogleAnalytics />
    </NextIntlClientProvider>
  );
}
