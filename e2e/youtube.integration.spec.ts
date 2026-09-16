import { test, expect } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const localApi = 'http://127.0.0.1:55431';
const youtubeOrigin = 'https://www.youtube.com';
// Official Google IFrame API example: developers.google.com/youtube/iframe_api_reference
const videoId = 'M7lc1UVf-VE';
type Observation = {
  states: number[];
  infoStates: { state: number; at: number }[];
  samples: { current: number; duration: number; at: number }[];
  duration: number;
  errors: number[];
  ready: number;
};
type ObservedWindow = Window & { youtubeObservation?: Observation };

test('official YouTube demo plays, persists position, resumes and completes through the application', async ({ page, context }) => {
  test.skip(process.env.OPENMEMBERS_YOUTUBE_INTEGRATION !== '1', 'Explicit external-provider opt-in required.');
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== localApi || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('YouTube integration requires the guarded local database runner.');
  }
  const admin = createClient(localApi, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = { course: randomUUID(), module: randomUUID(), lesson: randomUUID() };
  const slug = `development-youtube-${ids.course}`;
  const email = `development-youtube-${ids.course}@example.test`;
  const password = 'OpenMembers-local-2026!';
  let userId: string | undefined;
  let stage = 'fixtures';
  const networkFailures: { host: string; error?: string; status?: number }[] = [];
  const evidence: Record<string, unknown> = { videoId, source: 'https://developers.google.com/youtube/iframe_api_reference', viewport: test.info().project.name };
  const collectFailure = (failure: { host: string; error?: string; status?: number }) => {
    if (networkFailures.length < 20 && !networkFailures.some(existing => JSON.stringify(existing) === JSON.stringify(failure))) networkFailures.push(failure);
  };
  page.on('requestfailed', request => collectFailure({ host: new URL(request.url()).hostname, error: request.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) collectFailure({ host: new URL(response.url()).hostname, status: response.status() });
  });
  await context.addInitScript(() => {
    const observation: Observation = { states: [], infoStates: [], samples: [], duration: 0, errors: [], ready: 0 };
    (window as ObservedWindow).youtubeObservation = observation;
    window.addEventListener('message', event => {
      const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Video lesson"]');
      if (event.origin !== 'https://www.youtube.com' || !iframe?.contentWindow || event.source !== iframe.contentWindow) return;
      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== 'object') return;
      if (data.event === 'onReady') observation.ready += 1;
      if (data.event === 'onStateChange' && Number.isFinite(data.info)) observation.states.push(data.info);
      if (data.event === 'onError' && Number.isFinite(data.info)) observation.errors.push(data.info);
      if (data.event === 'infoDelivery' || data.event === 'initialDelivery') {
        if (Number.isFinite(data.info?.duration) && data.info.duration > 0) observation.duration = data.info.duration;
        if (Number.isFinite(data.info?.playerState)) observation.infoStates.push({ state: data.info.playerState, at: Math.round(performance.now()) });
        if (Number.isFinite(data.info?.currentTime)) observation.samples.push({ current: data.info.currentTime, duration: observation.duration, at: Math.round(performance.now()) });
      }
      if (observation.infoStates.length > 30) observation.infoStates.shift();
      if (observation.states.length > 30) observation.states.shift();
      if (observation.samples.length > 150) observation.samples.shift();
    });
  });
  const observation = () => page.evaluate(() => (window as ObservedWindow).youtubeObservation!);
  async function command(func: string, args: (number | boolean)[] = []) {
    await page.locator('iframe[title="Video lesson"]').evaluate((iframe, value) => {
      (iframe as HTMLIFrameElement).contentWindow!.postMessage(JSON.stringify({ event: 'command', func: value.func, args: value.args }), 'https://www.youtube.com');
    }, { func, args });
  }
  const position = () => admin.from('lesson_progress').select('video_position_seconds,is_completed').eq('user_id', userId!).eq('lesson_id', ids.lesson).maybeSingle();
  try {
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'YouTube Demo Learner' } });
    expect(user.error).toBeNull();
    userId = user.data.user!.id;
    expect((await admin.from('courses').insert({ id: ids.course, slug, title: 'Development YouTube demonstration', is_published: true, is_free: true })).error).toBeNull();
    expect((await admin.from('modules').insert({ id: ids.module, course_id: ids.course, title: 'Provider integration', is_published: true })).error).toBeNull();
    expect((await admin.from('lessons').insert({ id: ids.lesson, module_id: ids.module, slug: 'iframe-demo', title: 'Official IFrame API demonstration', content_type: 'video', video_provider: 'youtube', video_external_id: videoId, is_published: true })).error).toBeNull();
    stage = 'login';
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    stage = 'initial playback';
    const lessonPath = `/courses/${slug}/iframe-demo`;
    await page.goto(lessonPath);
    const iframe = page.locator('iframe[title="Video lesson"]');
    await expect(iframe).toBeVisible();
    expect(new URL((await iframe.getAttribute('src'))!).origin).toBe(youtubeOrigin);
    await expect.poll(async () => (await observation()).samples.at(-1)?.current ?? 0, { timeout: 30_000, message: 'YouTube must emit real advancing playback time.' }).toBeGreaterThan(2);
    let observed = await observation();
    const duration = observed.duration;
    expect(duration).toBeGreaterThan(65);
    expect(observed.errors).toEqual([]);
    evidence.initial = observed;
    evidence.duration = duration;

    stage = 'position persistence';
    await command('seekTo', [40, true]);
    await expect.poll(async () => {
      const result = await position();
      expect(result.error).toBeNull();
      return result.data?.video_position_seconds ?? 0;
    }, { timeout: 20_000 }).toBeGreaterThanOrEqual(40);
    await command('pauseVideo');
    await expect.poll(async () => (await observation()).states.at(-1), { timeout: 10_000 }).toBe(2);
    const persisted = await position();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.is_completed).toBe(false);
    const savedPosition = persisted.data!.video_position_seconds;
    evidence.savedPosition = savedPosition;

    stage = 'resume';
    await page.goto('/dashboard');
    await page.goto(lessonPath);
    const resumedSrc = new URL((await iframe.getAttribute('src'))!);
    expect(Number(resumedSrc.searchParams.get('start'))).toBe(Math.max(0, savedPosition - 3));
    await expect.poll(async () => (await observation()).samples.at(-1)?.current ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(savedPosition - 3);
    observed = await observation();
    expect(observed.samples[0].current).toBeLessThan(savedPosition + 10);
    await expect.poll(async () => (await observation()).states.at(-1), { timeout: 10_000, message: 'The resumed YouTube iframe must be playing before the next seek.' }).toBe(1);
    const resumedPosition = (await observation()).samples.at(-1)!.current;
    await expect.poll(async () => (await observation()).samples.at(-1)?.current ?? 0, { timeout: 10_000 }).toBeGreaterThan(resumedPosition + 1);
    evidence.resumed = await observation();

    stage = 'seek near provider end';
    await command('seekTo', [duration - 5, true]);
    await expect.poll(async () => (await observation()).samples.at(-1)?.current ?? 0, { timeout: 10_000, message: 'The provider must acknowledge the seek near the end with a real position.' }).toBeGreaterThanOrEqual(duration - 8);
    evidence.afterFinalSeek = await observation();
    stage = 'provider end and stored completion';
    await expect.poll(async () => (await observation()).states.includes(0), { timeout: 20_000 }).toBe(true);
    await expect.poll(async () => {
      const result = await position();
      expect(result.error).toBeNull();
      return result.data?.is_completed;
    }, { timeout: 10_000 }).toBe(true);
    evidence.ended = await observation();
    evidence.completed = true;
    stage = 'passed';
  } finally {
    evidence.stage = stage;
    evidence.networkFailures = networkFailures;
    evidence.lastObserved = await observation().catch(() => null);
    evidence.videoElement = await page.frameLocator('iframe[title="Video lesson"]').locator('video').first().evaluate(video => {
      const element = video as HTMLVideoElement;
      return { current: element.currentTime, duration: element.duration, paused: element.paused, ended: element.ended, readyState: element.readyState, networkState: element.networkState, errorCode: element.error?.code ?? null };
    }, undefined, { timeout: 1500 }).catch(() => null);
    if (userId) {
      const current = await position();
      evidence.persistedFinal = { data: current.data, errorCode: current.error?.code ?? null };
    }
    try {
      const output = test.info().outputPath('youtube-observation.json');
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(evidence, null, 2));
      await test.info().attach('youtube-observation', { path: output, contentType: 'application/json' });
    } finally {
      await page.goto('about:blank').catch(() => {});
      try {
        expect((await admin.from('courses').delete().eq('id', ids.course)).error).toBeNull();
      } finally {
        if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
      }
    }
  }
});
