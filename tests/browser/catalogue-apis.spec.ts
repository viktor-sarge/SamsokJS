import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import stockholmFixture from '../fixtures/stockholm.json' with { type: 'json' };

const minaFixture = readFileSync(new URL('../fixtures/mina-bibliotek.txt', import.meta.url), 'utf8');
const arenaFixture = readFileSync(new URL('../fixtures/arena-results.html', import.meta.url), 'utf8');
const pattern = 'https://samsokproxy.appspot.com/crossdomain?**';

async function reply(route: Route, content: string, status = 200) {
  const callback = new URL(route.request().url()).searchParams.get('callback');
  await route.fulfill({
    contentType: 'application/javascript',
    body: `${callback}(${JSON.stringify({ content, status: { http_code: status } })});`,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('samsok:halland:selected-sources:v1',
    JSON.stringify(['stockholm', 'mina-bibliotek'])));
});

test('sends Stockholm GraphQL POST through the proxy and reads Mina bibliotek search events', async ({ page }) => {
  const requests: string[] = [];
  await page.route(pattern, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const target = new URL(params.get('url')!);
    requests.push(target.host);
    if (target.host === 'biblioteket.stockholm.se') {
      expect(target.href).toBe('https://biblioteket.stockholm.se/graphql/');
      expect(params.get('method')).toBe('POST');
      expect(params.get('contentType')).toBe('application/json');
      expect(JSON.parse(params.get('postData')!)).toEqual({
        query: expect.stringContaining('searchWithFilter'),
        variables: { filterQuery: { query: 'räv & bok +', rows: 40 }, __operation: 'search' },
      });
      const headers = JSON.parse(params.get('headers')!);
      expect(headers.Origin).toBe('https://biblioteket.stockholm.se');
      expect(new URL(headers.Referer).searchParams.get('text')).toBe('räv & bok +');
      await reply(route, JSON.stringify(stockholmFixture));
    } else {
      expect(target.host).toBe('minabibliotek.se');
      expect(target.searchParams.get('q')).toBe('räv & bok +');
      expect(target.searchParams.get('size')).toBe('40');
      expect(params.has('postData')).toBe(false);
      await reply(route, minaFixture);
    }
  });
  await page.goto('./#/search?query=r%C3%A4v%20%26%20bok%20%2B');
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 4 hämtade träffar.');
  await expect(page.locator('.source-status')).toContainText('Visar 16,6% (2 träffar av totalt 12)');
  await expect(page.locator('.source-status')).toContainText('Visar 25% (2 träffar av totalt 8)');
  await expect(page.locator('.result-card .library-links a[href="https://biblioteket.stockholm.se/titel/example-1"]')).toBeVisible();
  await expect(page.locator('.result-card .library-links a[href="https://minabibliotek.se/search#/entity/catalogue/example-1"]')).toBeVisible();
  expect(requests.sort()).toEqual(['biblioteket.stockholm.se', 'minabibliotek.se']);
});

test('reports GraphQL partial errors and retries only Stockholm', async ({ page }) => {
  let stockholmRequests = 0;
  let minaRequests = 0;
  await page.route(pattern, async (route) => {
    if (new URL(route.request().url()).searchParams.get('url')!.includes('/graphql/')) {
      stockholmRequests++;
      await reply(route, JSON.stringify(stockholmRequests === 1
        ? { ...stockholmFixture, errors: [{ message: 'Search unavailable' }] } : stockholmFixture));
    } else {
      minaRequests++;
      await reply(route, minaFixture);
    }
  });
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Stockholm returnerade ett oväntat eller ofullständigt GraphQL-svar.')).toBeVisible();
  await expect(page.locator('.result-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Försök igen: Stockholms stadsbibliotek' }).click();
  await expect(page.locator('.result-card')).toHaveCount(4);
  expect(stockholmRequests).toBe(2);
  expect(minaRequests).toBe(1);
});

test('distinguishes explicit no-hit events from unknown or invalid API responses', async ({ page }) => {
  await page.route(pattern, (route) => reply(route,
    new URL(route.request().url()).searchParams.get('url')!.includes('/graphql/')
      ? JSON.stringify({ data: { searchWithFilter: { totalHits: 0, groupedMedia: [] } } })
      : 'event:search\ndata:{"totalHits":0}\n\n'));
  await page.goto('./#/search?query=empty');
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  await page.route(pattern, (route) => reply(route, 'Maintenance'));
  await page.getByLabel('Vad letar du efter?').fill('other');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByText('Stockholm returnerade inte giltig JSON.')).toBeVisible();
  await expect(page.getByText('Mina bibliotek returnerade ett oväntat händelseformat.')).toBeVisible();
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toHaveCount(0);
});

test('cancels old proxy requests and does not display stale API results', async ({ page }) => {
  const delayed: Route[] = [];
  await page.route(pattern, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const old = params.get('postData')?.includes('"old"') || new URL(params.get('url')!).searchParams.get('q') === 'old';
    if (old) delayed.push(route);
    else await reply(route, params.has('postData') ? JSON.stringify(stockholmFixture) : minaFixture);
  });
  await page.goto('./#/search?query=old');
  await expect.poll(() => delayed.length).toBe(2);
  await page.getByLabel('Vad letar du efter?').fill('new');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.locator('.result-card')).toHaveCount(4);
  for (const route of delayed) await reply(route, 'stale');
  await expect(page.locator('.result-card')).toHaveCount(4);
  await expect(page.getByText('Stockholm returnerade inte giltig JSON.')).toHaveCount(0);
});

test('shared catalogue controls stay in sync and search once across restored groups', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('samsok:halland:selected-sources:v1', '[]'));
  let requests = 0;
  await page.route(pattern, async (route) => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get('url')).toContain('falkopingsbibliotek.se');
    await reply(route, arenaFixture);
  });
  await page.goto('./');
  await expect(page.getByRole('group')).toHaveCount(5);
  await expect(page.locator('fieldset input[type=checkbox]')).toHaveCount(37);
  const first = page.getByRole('group', { name: 'Andra regioner' }).getByRole('checkbox', { name: 'Falköping' });
  const second = page.getByRole('group', { name: 'Västra Götaland' }).getByRole('checkbox', { name: 'Falköping' });
  await first.check();
  await expect(second).toBeChecked();
  await page.getByLabel('Vad letar du efter?').fill('book');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.locator('.result-card')).toHaveCount(1);
  expect(requests).toBe(1);
  await second.uncheck();
  await expect(first).not.toBeChecked();
  await expect(page.locator('.result-card')).toHaveCount(0);
  await page.reload();
  await expect(first).not.toBeChecked();
  await expect(second).not.toBeChecked();
});
