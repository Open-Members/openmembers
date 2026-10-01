import { test as base, expect, type Request } from '@playwright/test';
import { createServer, transformWithOxc } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Official Google IFrame API demo; override to validate authored media.
const videoId = process.env.OPENMEMBERS_BANNER_VIDEO_ID ?? 'M7lc1UVf-VE';
if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Expected an 11-character YouTube video ID.');
const provider = 'https://www.youtube-nocookie.com';
const root = resolve(__dirname, '..');

// The application component, translations, navigation and CSS are real. Only
// the remote player is replaced in deterministic layout tests, never in the
// opt-in provider test. No database credentials or application env are loaded.
const test = base.extend<object, { bannerOrigin: string }>({
  bannerOrigin: [async ({}, provide) => {
    const server = await createServer({
      configFile: false,
      envFile: false,
      define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
      root,
      cacheDir: resolve(root, 'node_modules/.vite-banner'),
      resolve: { alias: { '@': root } },
      oxc: { jsx: { runtime: 'automatic' } },
      server: { host: '127.0.0.1', port: 0, hmr: false },
      plugins: [{
        name: 'banner-browser-fixture',
        configureServer(vite) {
          vite.middlewares.use('/__banner', async (request, response) => {
            const native = request.url?.includes('native=1');
            const html = await vite.transformIndexHtml('/__banner', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${native
              ? `<iframe style="width:100vw;height:56.25vw;border:0" title="Caption preference control" allow="autoplay" src="${provider}/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1&cc_load_policy=1&cc_lang_pref=pt&playsinline=1"></iframe>`
              : '<div id="root"></div><script type="module" src="/__banner_entry.tsx"></script>'}</body></html>`);
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          });
        },
        resolveId(id) { if (id === '/__banner_entry.tsx') return '\0banner-entry.tsx'; },
        async load(id) {
          if (id !== '\0banner-entry.tsx') return;
          const entry = `
            import {createRoot} from 'react-dom/client';
            import {useState} from 'react';
            import {NextIntlClientProvider} from 'next-intl';
            import {HeroBanner} from '/shared/components/student/HeroBanner.tsx';
            import messages from '/core/i18n/locales/en/learningOverview.json';
            import '/app/globals.css';
            function App() {
              const [options, setOptions] = useState({trailerYoutubeId: '${videoId}'});
              window.setBannerOptions = setOptions;
              return <NextIntlClientProvider locale="en" messages={{learningOverview:messages}}>
                <HeroBanner title="Welcome" primaryCta={{label:'Explore',href:'/courses'}} {...options}/>
              </NextIntlClientProvider>;
            }
            createRoot(document.getElementById('root')).render(<App/>);
          `;
          return (await transformWithOxc(entry, 'banner-entry.tsx', { jsx: { runtime: 'automatic' } })).code;
        },
      }],
    });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === 'string') throw new Error('Banner fixture requires a local TCP port.');
      await provide(`http://127.0.0.1:${address.port}`);
    } finally { await server.close(); }
  }, { scope: 'worker' }],
});

test('real YouTube banner overrides active native captions, stays silent and loops', async ({ page, context, bannerOrigin }, testInfo) => {
  test.skip(process.env.OPENMEMBERS_YOUTUBE_INTEGRATION !== '1', 'Explicit external-provider opt-in required.');
  test.setTimeout(120_000);
  let stage = 'native caption positive control';
  const failures: { stage: string; host: string; error: string | null }[] = [];
  const requestStages = new WeakMap<Request, string>();
  page.on('request', request => requestStages.set(request, stage));
  await context.addInitScript(() => {
    const counts: Record<string, number> = {};
    (window as Window & { bannerProviderEvents?: Record<string, number> }).bannerProviderEvents = counts;
    window.addEventListener('message', event => {
      if (event.origin !== 'https://www.youtube-nocookie.com') return;
      let data = event.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      if (data && typeof data.event === 'string') counts[data.event] = (counts[data.event] ?? 0) + 1;
    });
  });
  page.on('requestfailed', request => {
    if (failures.length < 20) failures.push({ stage: requestStages.get(request) ?? 'unknown', host: new URL(request.url()).hostname, error: request.failure()?.errorText ?? null });
  });
  // Force the provider's caption preference on for BOTH the positive control
  // and the real component. The component must turn it off through the API.
  await page.route(`${provider}/embed/**`, route => {
    const url = new URL(route.request().url());
    url.searchParams.set('cc_load_policy', '1');
    url.searchParams.set('cc_lang_pref', 'pt');
    return route.continue({ url: url.toString() });
  });
  const observed = () => page.frameLocator('iframe').locator('video').first().evaluate(element => {
    const video = element as HTMLVideoElement;
    const player = document.querySelector('.html5-video-player') as Element & {
      getOptions?: () => string[];
      getOption?: (module: string, option: string) => { languageCode?: string };
      getPlayerResponse?: () => { playabilityStatus?: { status?: string; reason?: string } };
    };
    return {
      current: video.currentTime, duration: video.duration, paused: video.paused,
      muted: video.muted, volume: video.volume,
      modules: player?.getOptions?.() ?? null,
      captionLanguage: player?.getOption?.('captions', 'track')?.languageCode ?? null,
      captionText: [...document.querySelectorAll('.caption-window')].map(node => node.textContent).filter(Boolean),
      providerStatus: player?.getPlayerResponse?.()?.playabilityStatus ?? null,
      providerError: document.querySelector('.ytp-error-content-wrap')?.textContent ?? null,
    };
  }, undefined, { timeout: 2000 });
  const evidence: Record<string, unknown> = { videoId, viewport: testInfo.project.name };
  try {
    await page.goto(`${bannerOrigin}/__banner?native=1`);
    await expect.poll(async () => (await observed().catch(() => null))?.current ?? 0, { timeout: 30_000 }).toBeGreaterThan(2);
    await expect.poll(async () => (await observed()).captionText.length, { timeout: 15_000, message: 'The positive control must actually show native subtitles, not just request them.' }).toBeGreaterThan(0);
    evidence.positiveControl = await observed();

    stage = 'production banner with caption preference enabled';
    await page.goto(`${bannerOrigin}/__banner`);
    await expect.poll(async () => (await observed().catch(() => null))?.current ?? 0, { timeout: 30_000 }).toBeGreaterThan(2);
    // getOptions can keep listing captions after unloadModule. Check the
    // active track AND the rendered subtitles while real playback advances.
    await expect.poll(async () => (await observed()).captionLanguage, { timeout: 10_000 }).toBeNull();
    await expect.poll(async () => (await observed()).current, { timeout: 10_000 }).toBeGreaterThan(5);
    let state = await observed();
    expect(state.muted || state.volume === 0).toBe(true);
    expect(state.captionText).toEqual([]);
    expect(state.captionLanguage).toBeNull();
    evidence.playing = state;

    stage = 'loop';
    await page.frameLocator('iframe').locator('.html5-video-player').evaluate((element, seconds) => {
      const player = element as Element & { seekTo?: (seconds: number, allowSeekAhead: boolean) => void };
      if (!player.seekTo) throw new Error('Native player seek API is unavailable.');
      player.seekTo(seconds, true);
    }, state.duration - 2);
    await expect.poll(async () => (await observed()).current, { timeout: 10_000 }).toBeGreaterThan(state.duration - 5);
    await expect.poll(async () => (await observed()).current, { timeout: 15_000 }).toBeLessThan(10);
    // Restart is asynchronous: a track can be selected before the player
    // emits its API/state event. Observe actual playback through the first
    // spoken captions, rather than declare success/failure at currentTime=0.
    const loopSamples: Awaited<ReturnType<typeof observed>>[] = [];
    evidence.loopSamples = loopSamples;
    await expect.poll(async () => {
      const sample = await observed();
      loopSamples.push(sample);
      return sample.current;
    }, { timeout: 25_000, message: 'Playback must advance after looping without rendering captions.' }).toBeGreaterThan(12);
    expect(loopSamples.every(sample => sample.captionText.length === 0)).toBe(true);
    state = await observed();
    expect(state.muted || state.volume === 0).toBe(true);
    expect(state.captionLanguage).toBeNull();
    expect(state.captionText).toEqual([]);
    evidence.looped = state;
    const events = await page.evaluate(() => (window as Window & { bannerProviderEvents?: Record<string, number> }).bannerProviderEvents);
    evidence.events = events;
    expect(events?.onApiChange ?? 0, 'Caption unload must not create a feedback loop.').toBeLessThan(20);
    stage = 'passed';
  } finally {
    evidence.stage = stage;
    evidence.networkFailures = failures;
    evidence.lastObserved = await observed().catch(() => null);
    const output = testInfo.outputPath('real-youtube-banner.json');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(evidence, null, 2));
    await testInfo.attach('real-youtube-banner', { path: output, contentType: 'application/json' });
  }
});

test('16:9 media covers the actual banner in wide, mobile and tall layouts', async ({ page, bannerOrigin }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${provider}/embed/**`, route => route.fulfill({
    contentType: 'text/html',
    body: '<html><head><style>html,body{margin:0;width:100%;height:100%;background:black}body{display:grid;place-items:center}#video{width:min(100vw,177.77777778vh);height:min(100vh,56.25vw);background:linear-gradient(90deg,#0e7490,#7c3aed)}</style></head><body><div id="video"></div></body></html>',
  }));
  await page.goto(`${bannerOrigin}/__banner`);
  const widths = testInfo.project.name === 'mobile' ? [390, 844] : [1440, 1920, 2560];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const tall of [false, true]) {
      await page.addStyleTag({ content: `section{${tall ? 'height:700px;aspect-ratio:auto;max-height:none' : ''}}` });
      // Restore the ordinary class-based size after the tall case.
      if (!tall) await page.locator('style').filter({ hasText: 'height:700px' }).evaluateAll(styles => styles.forEach(style => style.remove()));
      const iframe = page.locator('iframe');
      await expect(iframe).toBeVisible();
      const banner = (await page.locator('section').boundingBox())!;
      const frame = (await iframe.boundingBox())!;
      const video = (await page.frameLocator('iframe').locator('#video').boundingBox())!;
      // Playwright returns frame-child boxes in page coordinates. Measuring
      // only the iframe would miss YouTube's internal black sidebars.
      expect(video.x, `left edge at ${width}px, tall=${tall}`).toBeLessThanOrEqual(banner.x + 1);
      expect(video.y).toBeLessThanOrEqual(banner.y + 1);
      expect(video.x + video.width).toBeGreaterThanOrEqual(banner.x + banner.width - 1);
      expect(video.y + video.height).toBeGreaterThanOrEqual(banner.y + banner.height - 1);
      expect(frame.width / frame.height).toBeCloseTo(16 / 9, 3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  // Keep PR captures consistent; the enlarged banner also exercises vertical cover.
  await page.setViewportSize(testInfo.project.name === 'mobile'
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
    await expect(page.getByRole('link', { name: 'Explore' }).filter({ visible: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('iframe')).not.toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`banner-${theme}.png`) });
  }
  expect(errors).toEqual([]);
});

test('image, empty media and course banners preserve their presentation and actions', async ({ page, bannerOrigin }) => {
  await page.route(`${provider}/embed/**`, route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto(`${bannerOrigin}/__banner`);
  await expect(page.locator('iframe')).toBeVisible();
  const original = (await page.locator('section').boundingBox())!;
  async function options(value: Record<string, unknown>) {
    await page.evaluate(next => {
      const update = (window as Window & { setBannerOptions?: (value: Record<string, unknown>) => void }).setBannerOptions;
      if (!update) throw new Error('Banner fixture has not rendered.');
      update(next);
    }, value);
  }
  const imageUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="90"><rect width="210" height="90" fill="#334155"/></svg>');
  await options({ trailerYoutubeId: null, imageUrl });
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Welcome' })).toBeVisible();
  await expect.poll(() => page.getByRole('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(210);
  expect((await page.locator('section').boundingBox())!.height).toBeCloseTo(original.height, 1);

  await options({ trailerYoutubeId: null, imageUrl: null });
  await expect(page.locator('iframe, img')).toHaveCount(0);
  expect((await page.locator('section').boundingBox())!.height).toBeCloseTo(original.height, 1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Explore' }).filter({ visible: true })).toBeFocused();

  await options({ trailerYoutubeId: 'M7lc1UVf-VE', title: 'Course trailer', subtitle: 'Course subtitle' });
  await expect(page.locator('iframe')).toHaveAttribute('title', 'Course trailer');
  await expect(page.getByRole('heading', { name: 'Course trailer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore' }).filter({ visible: true })).toHaveAttribute('href', '/courses');
  expect((await page.locator('section').boundingBox())!.height).toBeCloseTo(original.height, 1);
});
