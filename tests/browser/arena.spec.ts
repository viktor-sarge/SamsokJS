import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

const results = readFileSync(new URL('../fixtures/arena-results.html', import.meta.url), 'utf8');
const cookie = readFileSync(new URL('../fixtures/arena-cookie.html', import.meta.url), 'utf8');
const proxyPattern = 'https://samsokproxy.appspot.com/crossdomain?**';

async function reply(route: Route, content: string, cookies?: string) {
  const params = new URL(route.request().url()).searchParams;
  await route.fulfill({
    contentType: 'application/javascript',
    body: `${params.get('callback')}(${JSON.stringify({
      content, cookies, status: { http_code: 200, resolved_url: params.get('url') },
    })});`,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('samsok:halland:selected-sources:v1', JSON.stringify(['halmstad'])));
});

test('solves a cookie challenge in a module worker and never executes remote scripts or loads images', async ({ page }) => {
  let attempts = 0;
  const errors: Error[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error));
  page.on('request', (request) => requests.push(request.url()));
  await page.route(proxyPattern, async (route) => {
    attempts++;
    const params = new URL(route.request().url()).searchParams;
    const target = new URL(params.get('url')!);
    expect(target.searchParams.get('p_r_p_arena_urn:arena_search_query')).toBe('räv & bok +');
    if (attempts === 1) await reply(route, cookie);
    else {
      expect(params.get('cookies')).toBe('TEST=7*11:2:123:1');
      await reply(route, results);
    }
  });
  await page.goto('./#/search?query=r%C3%A4v%20%26%20bok%20%2B');
  await expect(page.locator('.result-card')).toHaveCount(1);
  await expect(page.locator('.source-status')).toContainText('1 hämtade av 1234 träffar');
  await expect(page.locator('.result-card .library-links a')).toHaveAttribute('href',
    'https://nova.halmstad.se/web/arena/results?p_r_p_arena_urn%3Aarena_member_id=123');
  expect(attempts).toBe(2);
  expect(requests.some((url) => /\/halland\/assets\/arena\.worker-.*\.js$/.test(url))).toBe(true);
  expect(requests.some((url) => url.includes('arena-image.png'))).toBe(false);
  expect(errors).toEqual([]);
});

test('follows a single-hit redirect and preserves opaque proxy cookies', async ({ page }) => {
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    const params = new URL(route.request().url()).searchParams;
    if (attempts === 1) {
      await reply(route, '<script>location.replace("\\x2fweb\\x2farena\\x2fresults?id=123")</script>', 'opaque-cookie');
    } else {
      expect(params.get('url')).toBe('https://nova.halmstad.se/web/arena/results?id=123');
      expect(params.get('cookies')).toBe('opaque-cookie');
      await reply(route, `<div class="arena-detail-title"><span>Vinterboken</span></div>
        <div class="arena-detail-author"><span class="arena-value">Anna Exempel</span></div>`);
    }
  });
  await page.goto('./#/search?query=book');
  await expect(page.locator('.result-card')).toHaveCount(1);
  await expect(page.locator('.result-card .library-links a')).toHaveAttribute('href',
    'https://nova.halmstad.se/web/arena/results?id=123');
  expect(attempts).toBe(2);
});

test('bounds repeating cookie challenges and supports retry after unknown formats', async ({ page }) => {
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    await reply(route, cookie);
  });
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Arenas kontroll eller omdirigering återkom för många gånger.', { exact: false })).toBeVisible();
  expect(attempts).toBe(6);
  await page.route(proxyPattern, (route) => reply(route, cookie.replace('p+=0;', 'p=unknown();')));
  await page.getByRole('button', { name: 'Försök igen: Halmstad' }).click();
  await expect(page.getByText('Arenas cookie-kontroll har ett okänt format.', { exact: true })).toBeVisible();
  await page.route(proxyPattern, (route) => reply(route, results));
  await page.getByRole('button', { name: 'Försök igen: Halmstad' }).click();
  await expect(page.locator('.result-card')).toHaveCount(1);
});

test('rejects external redirects and does not forward cookies to them', async ({ page }) => {
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    await reply(route, '<script>location.replace("https://evil.example/")</script>', 'private-cookie');
  });
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Arena returnerade en ogiltig eller extern länk.', { exact: true })).toBeVisible();
  expect(attempts).toBe(1);
});

test('reports known no-hit pages without hiding unexpected maintenance pages', async ({ page }) => {
  await page.route(proxyPattern, (route) => reply(route, '<div class="arena-feedback">Din sökning gav inga träffar</div>'));
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  await page.route(proxyPattern, (route) => reply(route, '<h1>Maintenance</h1>'));
  await page.getByLabel('Vad letar du efter?').fill('other');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByText('Arena returnerade ett okänt eller ofullständigt söksvar.', { exact: false })).toBeVisible();
});

test('reports zero exact matches after a cookie challenge when Arena returns spelling alternatives', async ({ page }) => {
  const alternatives = readFileSync(new URL('../fixtures/arena-alternatives.html', import.meta.url), 'utf8');
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    await reply(route, attempts === 1 ? cookie : alternatives);
  });
  await page.goto('./#/search?query=nyaga');
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  await expect(page.locator('.source-status')).toContainText('Halmstad 0 hämtade av 0 träffar.');
  await expect(page.locator('.source-error')).toHaveCount(0);
  await expect(page.locator('.result-card')).toHaveCount(0);
  await expect(page.locator('.source-status a')).toHaveAttribute('href',
    'https://nova.halmstad.se/search?p_r_p_arena_urn%3Aarena_search_query=nyaga');
  expect(attempts).toBe(2);
});

test('treats the dedicated zero-hit panel as empty without fetching deferred suggestions', async ({ page }) => {
  let requests = 0;
  await page.route(proxyPattern, async (route) => {
    requests++;
    await reply(route, `<div class="arena-feedback"></div>
      <script>wicketAjaxGet("https://nova.halmstad.se/search?panelZeroHit")</script>
      <div class="arena-zero-list"><wicket-container><img alt="Loading..." src="/indicator.gif"></wicket-container></div>`);
  });
  await page.goto('./#/search?query=empty');
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

test('cancels a pending challenge request when sources are deselected', async ({ page }) => {
  let requests = 0;
  await page.route(proxyPattern, async (route) => {
    requests++;
    if (requests === 1) await reply(route, cookie);
  });
  await page.goto('./#/search?query=book');
  await expect.poll(() => requests).toBe(2);
  await page.getByRole('checkbox', { name: 'Halmstad', exact: true }).uncheck();
  await expect(page.getByText('Välj minst en katalog för att söka.')).toBeVisible();
  await expect(page.locator('script[src*="crossdomain"]')).toHaveCount(0);
  expect(page.workers()).toHaveLength(0);
});

test('renders all original Halland sources in their legacy order', async ({ page }) => {
  await page.goto('./');
  const group = page.getByRole('group', { name: 'Halland', exact: true });
  expect(await group.getByRole('checkbox').evaluateAll((elements) =>
    elements.map((element) => element.closest('label')?.textContent?.trim()))).toEqual([
    'Falkenberg', 'Halmstad', 'Halmstad Högskolebibliotek', 'Hylte', 'Kungsbacka', 'Laholm', 'Varberg',
  ]);
});
