import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { DashboardPage } from '@/features/Dashboard';
import { getEnabledCollections } from '@/features/Collections/queries.server';
import { getTenantSettings } from '@/core/theme/settings';
import { findUpcomingLiveClassForUser } from '@/features/LiveClasses/queries.server';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const [profileRes, settings, collections, upcomingLive] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle(),
    getTenantSettings(),
    getEnabledCollections(user.id),
    findUpcomingLiveClassForUser(user.id),
  ]);

  const t = await getTranslations('learningOverview.dashboard');
  const displayName = profileRes.data?.display_name ?? t('learner');

  return (
    <DashboardPage
      displayName={displayName}
      hero={{
        imageUrl: settings.home_hero_banner_url,
        trailerYoutubeId: settings.home_hero_trailer_youtube_id,
        title: settings.home_hero_title,
        subtitle: settings.home_hero_subtitle,
        siteName: settings.site_name,
        overlayOpacity: settings.home_hero_overlay_opacity,
        showText: settings.home_hero_show_text,
      }}
      collections={collections}
      upcomingLive={upcomingLive}
    />
  );
}
