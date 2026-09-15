import { redirect } from 'next/navigation';

// Access levels are gone from the admin UI — the concept was leaking
// plumbing that now lives behind offers. Anyone hitting the old URL (old
// bookmarks, external links) lands on the unified Offers page.
export default async function AdminAccessLevelsLegacyRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/offers`);
}
