import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import fixture from '../fixtures/xsearch.json' with { type: 'json' };
import vegaFixture from '../fixtures/vega.json' with { type: 'json' };
import stockholmFixture from '../fixtures/stockholm.json' with { type: 'json' };
import { readFileSync } from 'node:fs';

const kohaFixture = readFileSync(new URL('../fixtures/koha-results.html', import.meta.url), 'utf8');
const arenaFixture = readFileSync(new URL('../fixtures/arena-results.html', import.meta.url), 'utf8');
const minaFixture = readFileSync(new URL('../fixtures/mina-bibliotek.txt', import.meta.url), 'utf8');

const vegaApi = 'https://eu.iiivega.com/api/search-result/search/format-groups';

async function reply(route: Route, envelope: unknown) {
  const callback = new URL(route.request().url()).searchParams.get('callback');
  await route.fulfill({
    contentType: 'application/javascript',
    body: `${callback}(${JSON.stringify(envelope)});`,
  });
}

async function mockSearch(page: Page) {
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', (route) => {
    const target = new URL(route.request().url()).searchParams.get('url')!;
    const content = target.includes('/koha/') ? kohaFixture
      : target.includes('arena_') || target.includes('arena%') ? arenaFixture
      : target.includes('/graphql/') ? JSON.stringify(stockholmFixture)
      : target.includes('/federated-search/') ? minaFixture : JSON.stringify(fixture);
    return reply(route, {
      content,
      status: { http_code: 200 },
    });
  });
  await page.route(vegaApi, (route) =>
    route.fulfill({ json: vegaFixture }));
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`back-to-top appears after one screen and restores search focus (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 600 });
    await mockSearch(page);
    await page.goto('./#/search?query=book');
    await expect(page.getByRole('status')).toContainText('Sökningen är klar');
    const url = page.url();
    const button = page.getByRole('button', { name: 'Till toppen', exact: true });
    await expect(button).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, innerHeight - 1));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(599);
    await expect(button).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, innerHeight + 1));
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS('position', 'fixed');
    const first = await button.boundingBox();
    expect(first!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => window.scrollBy(0, 100));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(701);
    expect(await button.boundingBox()).toEqual(first);
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(button).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 600 });
    await expect(button).toBeVisible();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect(page.getByLabel('Vad letar du efter?')).toBeFocused();
    await expect(page.getByLabel('Vad letar du efter?')).toHaveValue('book');
    await expect(button).toHaveCount(0);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek', exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('searches, sorts, filters, preserves navigation URLs and catalogue preferences', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await mockSearch(page);
  await page.goto('./');
  await expect(page).toHaveTitle('Samsök Halland');
  await page.getByLabel('Vad letar du efter?').fill('räv & bok');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 4 hämtade träffar.');
  await expect(page.locator('.author-group').first().getByRole('heading', { level: 3 })).toHaveText('Anna Exempel');
  await expect(page.locator('.author-group').first()).toContainText('Vinterboken');
  await expect(page.locator('.source-status')).toContainText('Visar 66,6% (2 träffar av totalt 3)');
  await page.getByLabel('Filtrera hämtade träffar').fill('Anna');
  await expect(page.locator('.result-card')).toHaveCount(1);
  const sharedUrl = page.url();
  await page.getByRole('link', { name: 'Välj kataloger' }).click();
  await expect(page).toHaveURL(sharedUrl);
  await page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek' }).uncheck();
  await expect(page.locator('.result-card')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek' })).not.toBeChecked();
  await expect(page.locator('.result-card')).toHaveCount(2);
  await expect(page.getByLabel('Vad letar du efter?')).toHaveValue('räv & bok');
  await page.getByRole('checkbox', { name: 'Markera alla' }).check();
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 44 hämtade träffar.');
  await expect(page.locator('.result-card')).toHaveCount(12);
  await page.getByRole('checkbox', { name: 'Markera alla' }).uncheck();
  await expect(page.getByRole('button', { name: 'Sök', exact: true })).toBeDisabled();
  await expect(page.getByText('Välj minst en katalog för att söka.')).toBeVisible();
  await expect(page.locator('.result-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('shows a per-source failure and retries only that source', async ({ page }) => {
  let halmstadRequests = 0;
  let depotRequests = 0;
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', async (route) => {
    const target = new URL(new URL(route.request().url()).searchParams.get('url')!);
    if (target.searchParams.get('query')?.includes('bibl:hal')) {
      halmstadRequests++;
      if (halmstadRequests === 1) {
        await reply(route, { content: 'Unavailable', status: { http_code: 503 } });
        return;
      }
    } else {
      depotRequests++;
    }
    await reply(route, { content: JSON.stringify(fixture) });
  });
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Katalogen returnerade HTTP 503.', { exact: false })).toBeVisible();
  await expect(page.locator('.result-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Försök igen: Halmstad Högskolebibliotek' }).click();
  await expect(page.locator('.result-card')).toHaveCount(2);
  await expect(page.locator('.result-card').first().locator('.library-links a')).toHaveCount(2);
  expect(halmstadRequests).toBe(2);
  expect(depotRequests).toBe(1);
});

test('supports direct search links, browser back/forward and empty results', async ({ page }) => {
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', (route) =>
    reply(route, { content: '{"xsearch":{"records":0,"list":[]}}' }));
  await page.goto('./#/search?query=first');
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  await page.getByLabel('Vad letar du efter?').fill('second');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sökresultat för ”second”' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Vad letar du efter?')).toHaveValue('first');
  await page.goForward();
  await expect(page.getByLabel('Vad letar du efter?')).toHaveValue('second');
});

test('shows explicit network failures rather than reporting no matches', async ({ page }) => {
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', (route) => route.abort('failed'));
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Kunde inte kontakta proxyn.', { exact: false })).toHaveCount(2);
  await expect(page.getByText('Inga träffar kunde hämtas.', { exact: false })).toBeVisible();
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toHaveCount(0);
});

test('ignores delayed results after a newer search and releases aborted callbacks', async ({ page }) => {
  const delayed: Route[] = [];
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', async (route) => {
    const target = new URL(new URL(route.request().url()).searchParams.get('url')!);
    if (target.searchParams.get('query')?.startsWith('old ')) {
      delayed.push(route);
      return;
    }
    await reply(route, { content: '{"xsearch":{"records":0,"list":[]}}' });
  });
  await page.goto('./#/search?query=old');
  await expect.poll(() => delayed.length).toBe(2);
  await page.getByLabel('Vad letar du efter?').fill('new');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  for (const route of delayed) await reply(route, { content: JSON.stringify(fixture) });
  await expect(page.locator('.result-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sökresultat för ”new”' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(window.__samsokJsonp ?? {}))).toEqual([]);
  expect(errors).toEqual([]);
});

test('reports unavailable storage while keeping selection functional', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('./');
  await expect(page.getByRole('alert').filter({ hasText: 'Standardvalen används' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mina favoriter' }).getByRole('alert')).toContainText('kunde inte läsas');
  await page.getByRole('checkbox', { name: 'Markera alla' }).check();
  await page.getByRole('checkbox', { name: 'Markera alla' }).uncheck();
  await expect(page.getByRole('alert').filter({ hasText: 'Katalogvalet gäller nu' })).toContainText('kunde inte sparas');
  await expect(page.getByText('0 av 31 kataloger valda')).toBeVisible();
});

test('times out stalled requests and safely discards late responses', async ({ page }) => {
  await page.clock.install();
  const pending: Route[] = [];
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', (route) => { pending.push(route); });
  await page.goto('./#/search?query=book');
  await expect.poll(() => pending.length).toBe(2);
  await page.clock.fastForward(30001);
  await expect(page.getByText('Katalogen svarade inte i tid.', { exact: false })).toHaveCount(2);
  await expect(page.locator('script[src*="crossdomain"]')).toHaveCount(0);
  for (const route of pending) await reply(route, { content: JSON.stringify(fixture) });
  await expect.poll(() => page.evaluate(() => Object.keys(window.__samsokJsonp ?? {}))).toEqual([]);
  await expect(page.locator('.result-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reports a response without a JSONP callback and cleans up the request', async ({ page }) => {
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'void 0;' }));
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Proxyn svarade utan giltig JSONP-data.', { exact: true })).toHaveCount(2);
  expect(await page.evaluate(() => Object.keys(window.__samsokJsonp ?? {}))).toEqual([]);
});

test('searches Vega and Libris together with correct tenant POSTs and card links', async ({ page }) => {
  await mockSearch(page);
  const requests: { customer: string; host: string; body: unknown }[] = [];
  await page.route(vegaApi, async (route) => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.headers()['api-version']).toBe('2');
    expect(request.headers()['content-type']).toBe('application/json');
    requests.push({
      customer: request.headers()['iii-customer-domain'],
      host: request.headers()['iii-host-domain'],
      body: request.postDataJSON(),
    });
    await route.fulfill({ json: vegaFixture });
  });
  await page.goto('./');
  await page.getByRole('checkbox', { name: 'Markera alla' }).check();
  await page.getByLabel('Vad letar du efter?').fill('räv & bok +');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 44 hämtade träffar.');
  expect(requests).toHaveLength(2);
  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ customer: 'gsb.eu.iiivega.com', host: 'bibliotek.goteborg.se' }),
    expect.objectContaining({ customer: 'malmo.eu.iiivega.com', host: 'malin.malmo.se' }),
  ]));
  for (const request of requests) {
    expect(request.body).toEqual({
      searchText: 'räv & bok +', sorting: 'relevance', sortOrder: 'asc',
      searchType: 'everything', pageNum: 0, pageSize: 40, resourceType: 'FormatGroup',
    });
  }
  await expect(page.locator('.source-status')).toContainText('Visar 28,5% (2 träffar av totalt 7)');
  await page.getByLabel('Filtrera hämtade träffar').fill('Göteborg');
  await expect(page.locator('.result-card')).toHaveCount(2);
  await expect(page.locator('.result-card').first().locator('.library-links a').filter({ hasText: 'Göteborg' })).toHaveAttribute('href',
    'https://bibliotek.goteborg.se/search/card?id=example-alphabet&entityType=FormatGroup');
  await page.getByLabel('Filtrera hämtade träffar').fill('Malmö');
  await expect(page.locator('.result-card').first().locator('.library-links a').filter({ hasText: 'Malmö' })).toHaveAttribute('href',
    'https://malin.malmo.se/search/card?id=example-alphabet&entityType=FormatGroup');
});

test('retries only the failed Vega tenant without blocking other catalogues', async ({ page }) => {
  await mockSearch(page);
  const attempts: Record<string, number> = {};
  await page.route(vegaApi, async (route) => {
    const tenant = route.request().headers()['iii-customer-domain'];
    attempts[tenant] = (attempts[tenant] ?? 0) + 1;
    if (tenant === 'gsb.eu.iiivega.com' && attempts[tenant] === 1) {
      await route.fulfill({ status: 503, body: 'Unavailable' });
    } else {
      await route.fulfill({ json: vegaFixture });
    }
  });
  await page.goto('./');
  await page.getByRole('checkbox', { name: 'Markera alla' }).check();
  await page.getByLabel('Vad letar du efter?').fill('book');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByText('Vega returnerade HTTP 503.', { exact: false })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('42 hämtade träffar.');
  await expect(page.locator('.result-card')).toHaveCount(11);
  await page.getByRole('button', { name: 'Försök igen: Göteborg' }).click();
  await expect(page.locator('.result-card')).toHaveCount(12);
  expect(attempts).toEqual({ 'gsb.eu.iiivega.com': 2, 'malmo.eu.iiivega.com': 1 });
});

test('cancels pending Vega requests when the query changes', async ({ page }) => {
  const delayed: Route[] = [];
  await page.route(vegaApi, async (route) => {
    if (route.request().postDataJSON().searchText === 'old') {
      delayed.push(route);
    } else {
      await route.fulfill({ json: { totalResults: 0, data: [] } });
    }
  });
  await page.goto('./');
  await page.getByRole('checkbox', { name: 'Markera alla' }).check();
  await page.getByRole('checkbox', { name: 'Markera alla' }).uncheck();
  await page.getByRole('group', { name: 'Andra regioner' }).getByRole('checkbox', { name: 'Göteborg' }).check();
  await page.getByRole('group', { name: 'Andra regioner' }).getByRole('checkbox', { name: 'Malmö' }).check();
  await page.getByLabel('Vad letar du efter?').fill('old');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect.poll(() => delayed.length).toBe(2);
  await page.getByLabel('Vad letar du efter?').fill('new');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  for (const route of delayed) await route.fulfill({ json: vegaFixture });
  await expect(page.locator('.result-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sökresultat för ”new”' })).toBeVisible();
});

test('reports Vega network errors explicitly and allows retry', async ({ page }) => {
  await page.route(vegaApi, (route) => route.abort('failed'));
  await page.goto('./');
  await page.getByRole('checkbox', { name: 'Markera alla' }).check();
  await page.getByRole('checkbox', { name: 'Markera alla' }).uncheck();
  await page.getByRole('group', { name: 'Andra regioner' }).getByRole('checkbox', { name: 'Göteborg' }).check();
  await page.getByLabel('Vad letar du efter?').fill('book');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByText('Kunde inte kontakta Vega.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Försök igen: Göteborg' })).toBeVisible();
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toHaveCount(0);
});

test('builds a distinct depot skin and source selection beneath a nested path', async ({ page }) => {
  await mockSearch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4174/depot/#/search?query=book');
  await expect(page).toHaveTitle('Samsök Depå');
  await expect(page.getByText('Fler berättelser att upptäcka.')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek' })).toHaveCount(0);
  await expect(page.locator('.result-card')).toHaveCount(2);
  await expect(page.locator('button[type="submit"]')).toHaveCSS('background-color', 'rgb(129, 53, 29)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const assets = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('src') ?? element.getAttribute('href')));
  expect(assets.every((asset) => asset?.startsWith('./assets/'))).toBe(true);
  const scriptUrl = await page.locator('script[type="module"]').getAttribute('src');
  const script = await page.request.get(new URL(scriptUrl!, page.url()).href);
  expect(await script.text()).not.toContain('halmstad-university');
  expect(await script.text()).not.toContain('Samsök Halland');
  expect(await script.text()).not.toContain('gsb.eu.iiivega.com');
  expect(await script.text()).not.toContain('malmo.eu.iiivega.com');
});
