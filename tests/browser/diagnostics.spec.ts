import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const proxyPattern = 'https://samsokproxy.appspot.com/crossdomain?**';
const privateQuery = 'private patron search & räven +';

async function select(page: Page, id: string) {
  await page.addInitScript((sourceId) => localStorage.setItem('samsok:halland:selected-sources:v1',
    JSON.stringify([sourceId])), id);
}
async function reply(route: Route, content: string, status = 200) {
  const callback = new URL(route.request().url()).searchParams.get('callback');
  await route.fulfill({
    contentType: 'application/javascript',
    body: `${callback}(${JSON.stringify({ content, cookies: 'secret-cookie-value', status: { http_code: status } })});`,
  });
}
async function openReport(page: Page, name: string) {
  await page.getByText(`Felsökningsrapport: ${name}`, { exact: true }).click();
  return page.getByRole('textbox', { name: `Rapport för ${name}`, exact: true });
}

for (const { id, name, adapter, stage } of [
  { id: 'halmstad-university', name: 'Halmstad Högskolebibliotek', adapter: 'libris-xsearch', stage: 'parse' },
  { id: 'stockholm', name: 'Stockholms stadsbibliotek', adapter: 'stockholm', stage: 'parse' },
  { id: 'mina-bibliotek', name: 'Mina bibliotek', adapter: 'mina-bibliotek', stage: 'parse' },
  { id: 'halmstad', name: 'Halmstad', adapter: 'arena', stage: 'worker-parse' },
  { id: 'falkenberg', name: 'Falkenberg', adapter: 'koha', stage: 'worker-parse' },
]) {
  test(`reports ${adapter} parsing failures without recording private request/response data`, async ({ page }) => {
    await select(page, id);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(proxyPattern, (route) => reply(route, '<h1>secret-response-body</h1>'));
    await page.goto(`./#/search?query=${encodeURIComponent(privateQuery)}`);
    const preview = await openReport(page, name);
    const text = await preview.inputValue();
    const report = JSON.parse(text);
    expect(report.source).toMatchObject({ id, name, adapter });
    expect(report.failure.events).toEqual([
      expect.objectContaining({ stage: 'proxy-request', outcome: 'ok', httpStatus: 200, responseChars: 29 }),
      expect.objectContaining({ stage, outcome: 'error' }),
    ]);
    expect(report.failure.attempt).toBe(1);
    expect(report.failure.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.application.builtAt).toMatch(/^\d{4}-/);
    expect(report.application.version).toBeTruthy();
    expect(report.environment.page).toMatch(/\/halland\/$/);
    for (const secret of [privateQuery, encodeURIComponent(privateQuery), 'secret-cookie-value', 'secret-response-body', 'postData', '#/search']) {
      expect(text).not.toContain(secret);
    }
    expect(report.queryIncluded).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('checkbox', { name: 'Ta med sökfrågan i rapporten' })).not.toBeChecked();
  });
}

test('copies and downloads exactly the preview, with explicit query opt-in and no automatic uploads', async ({ page }) => {
  await select(page, 'halmstad-university');
  await page.addInitScript(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (text: string) => { copied = text; },
      readText: async () => copied,
    } });
  });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.route(proxyPattern, (route) => reply(route, 'secret-response-body', 503));
  await page.goto(`./#/search?query=${encodeURIComponent(privateQuery)}`);
  const preview = await openReport(page, 'Halmstad Högskolebibliotek');
  expect(JSON.parse(await preview.inputValue()).failure.events[0]).toMatchObject({ httpStatus: 503, outcome: 'http-error' });
  const before = requests.length;
  await page.getByRole('button', { name: 'Kopiera rapport', exact: true }).click();
  await expect(page.getByText('Rapporten har kopierats.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await preview.inputValue());
  await page.getByRole('checkbox', { name: 'Ta med sökfrågan i rapporten' }).check();
  expect(JSON.parse(await preview.inputValue())).toMatchObject({ queryIncluded: true, query: privateQuery });
  await page.getByRole('button', { name: 'Kopiera rapport', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(await preview.inputValue());
  await page.getByRole('checkbox', { name: 'Ta med sökfrågan i rapporten' }).uncheck();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ladda ner rapport', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^samsok-diagnostik-halmstad-university-.*\.json$/);
  const downloaded = readFileSync((await download.path())!, 'utf8');
  expect(downloaded).toBe(await preview.inputValue());
  expect(downloaded).not.toContain(privateQuery);
  expect(requests).toHaveLength(before);
});

test('shows clipboard errors and resets query consent and report events for each failed retry', async ({ page }) => {
  await select(page, 'halmstad-university');
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
  }));
  let attempts = 0;
  await page.route(proxyPattern, (route) => {
    attempts++;
    return reply(route, 'invalid', attempts === 1 ? 503 : 502);
  });
  await page.goto('./#/search?query=private');
  const preview = await openReport(page, 'Halmstad Högskolebibliotek');
  await page.getByRole('checkbox', { name: 'Ta med sökfrågan i rapporten' }).check();
  await page.getByRole('button', { name: 'Kopiera rapport', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Rapporten kunde inte kopieras');
  await page.getByRole('button', { name: 'Försök igen: Halmstad Högskolebibliotek' }).click();
  await openReport(page, 'Halmstad Högskolebibliotek');
  const report = JSON.parse(await preview.inputValue());
  expect(report.failure.attempt).toBe(2);
  expect(report.failure.events).toHaveLength(1);
  expect(report.failure.events[0].httpStatus).toBe(502);
  expect(report.queryIncluded).toBe(false);
  expect(report).not.toHaveProperty('query');
  await expect(page.getByRole('checkbox', { name: 'Ta med sökfrågan i rapporten' })).not.toBeChecked();
});

test('records timeout diagnostics without letting late proxy responses modify the report', async ({ page }) => {
  await select(page, 'halmstad-university');
  await page.clock.install();
  const pending: Route[] = [];
  await page.route(proxyPattern, (route) => { pending.push(route); });
  await page.goto('./#/search?query=private');
  await expect.poll(() => pending.length).toBe(1);
  await page.clock.fastForward(30001);
  const preview = await openReport(page, 'Halmstad Högskolebibliotek');
  const text = await preview.inputValue();
  expect(JSON.parse(text).failure.events[0]).toMatchObject({ stage: 'proxy-request', outcome: 'timeout' });
  await reply(pending[0], 'late secret-response-body');
  await expect(preview).toHaveValue(text);
});

test('records direct Vega HTTP errors and subsequent response validation failures', async ({ page }) => {
  await select(page, 'goteborg');
  let attempts = 0;
  await page.route('https://eu.iiivega.com/api/search-result/search/format-groups', (route) => {
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, body: 'secret-response-body' })
      : route.fulfill({ json: { unexpected: true } });
  });
  await page.goto('./#/search?query=private');
  const preview = await openReport(page, 'Göteborg');
  expect(JSON.parse(await preview.inputValue()).failure.events[0])
    .toMatchObject({ stage: 'vega-request', outcome: 'http-error', httpStatus: 503 });
  await page.getByRole('button', { name: 'Försök igen: Göteborg' }).click();
  await openReport(page, 'Göteborg');
  expect(JSON.parse(await preview.inputValue()).failure.events).toEqual([
    expect.objectContaining({ stage: 'vega-request', outcome: 'ok', httpStatus: 200 }),
    expect.objectContaining({ stage: 'parse', outcome: 'error' }),
  ]);
});

test('captures repeated Arena challenge steps without copying challenge cookies or page scripts', async ({ page }) => {
  await select(page, 'halmstad');
  const cookie = readFileSync(new URL('../fixtures/arena-cookie.html', import.meta.url), 'utf8');
  await page.route(proxyPattern, (route) => reply(route, cookie));
  await page.goto('./#/search?query=private');
  const preview = await openReport(page, 'Halmstad');
  const text = await preview.inputValue();
  const report = JSON.parse(text);
  expect(report.failure.events).toHaveLength(12);
  expect(report.failure.events.filter((event: { pageKind?: string }) => event.pageKind === 'cookie')).toHaveLength(6);
  expect(text).not.toContain('TEST=');
  expect(text).not.toContain('secret-cookie-value');
  expect(text).not.toContain('leastFactor');
});

test('reports local download failures with a manual-copy alternative', async ({ page }) => {
  await select(page, 'halmstad-university');
  await page.addInitScript(() => {
    URL.createObjectURL = () => { throw new Error('Unavailable'); };
  });
  await page.route(proxyPattern, (route) => reply(route, 'unavailable', 503));
  await page.goto('./#/search?query=private');
  await openReport(page, 'Halmstad Högskolebibliotek');
  await page.getByRole('button', { name: 'Ladda ner rapport', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Rapporten kunde inte laddas ner. Kopiera texten manuellt.');
});

test('records Koha proof-of-work stage and algorithm, never its challenge data or solution', async ({ page }) => {
  await select(page, 'falkenberg');
  let requests = 0;
  const challenge = `<script id="anubis_challenge" type="application/json">${JSON.stringify({
    rules: { algorithm: 'fast', difficulty: 0 },
    challenge: { id: 'secret-challenge-id', randomData: 'secret-random-data' },
  })}</script><script id="anubis_base_prefix">""</script>`;
  await page.route(proxyPattern, (route) => {
    requests++;
    return reply(route, requests === 1 ? challenge : '<h1>secret-response-body</h1>');
  });
  await page.goto('./#/search?query=private');
  const preview = await openReport(page, 'Falkenberg');
  const text = await preview.inputValue();
  const events = JSON.parse(text).failure.events;
  expect(events).toEqual([
    expect.objectContaining({ stage: 'proxy-request', outcome: 'ok' }),
    expect.objectContaining({ stage: 'worker-parse', outcome: 'ok', pageKind: 'anubis' }),
    expect.objectContaining({ stage: 'challenge-solve', outcome: 'ok', algorithm: 'fast' }),
    expect.objectContaining({ stage: 'proxy-request', outcome: 'ok' }),
    expect.objectContaining({ stage: 'proxy-request', outcome: 'ok' }),
    expect.objectContaining({ stage: 'worker-parse', outcome: 'error' }),
  ]);
  for (const secret of ['secret-cookie-value', 'secret-challenge-id', 'secret-random-data', 'secret-response-body', 'nonce']) {
    expect(text).not.toContain(secret);
  }
});

for (const outcome of ['network-error', 'invalid-envelope', 'invalid-jsonp'] as const) {
  test(`distinguishes proxy ${outcome} from catalogue parsing failures`, async ({ page }) => {
    await select(page, 'halmstad-university');
    await page.route(proxyPattern, async (route) => {
      if (outcome === 'network-error') await route.abort('failed');
      else if (outcome === 'invalid-envelope') await reply(route, '');
      else await route.fulfill({ contentType: 'application/javascript', body: 'void 0;' });
    });
    await page.goto('./#/search?query=private');
    const preview = await openReport(page, 'Halmstad Högskolebibliotek');
    expect(JSON.parse(await preview.inputValue()).failure.events).toEqual([
      expect.objectContaining({ stage: 'proxy-request', outcome }),
    ]);
  });
}
