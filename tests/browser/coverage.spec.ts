import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import fixture from '../fixtures/xsearch.json' with { type: 'json' };

const proxyPattern = 'https://samsokproxy.appspot.com/crossdomain?**';

async function reply(route: Route, total: number | null, count = 2) {
  const callback = new URL(route.request().url()).searchParams.get('callback');
  const list = Array.from({ length: count }, (_, index) => ({
    ...fixture.xsearch.list[index % fixture.xsearch.list.length],
    identifier: `https://example.org/record/${index}`,
  }));
  await route.fulfill({
    contentType: 'application/javascript',
    body: `${callback}(${JSON.stringify({ content: JSON.stringify({ xsearch: { records: total, list } }) })});`,
  });
}

for (const scenario of [
  { total: 3, count: 2, label: 'Visar 66,6% (2 träffar av totalt 3)', heading: 'Träfflistan är ofullständig.' },
  { total: 10000, count: 1, label: 'Visar <0,1% (1 träff av totalt 10000)', heading: 'Träfflistan är ofullständig.' },
  { total: 10000, count: 10, label: 'Visar 0,1% (10 träffar av totalt 10000)', heading: 'Träfflistan är ofullständig.' },
  { total: 2000, count: 1999, label: 'Visar 99,9% (1999 träffar av totalt 2000)', heading: 'Träfflistan är ofullständig.' },
  { total: 1, count: 0, label: 'Visar 0% (0 träffar av totalt 1)', heading: 'Träfflistan är ofullständig.' },
  { total: 2, count: 2, label: '2 träffar', heading: 'Alla träffar från de valda katalogerna har hämtats.' },
  { total: 0, count: 0, label: '0 träffar', heading: 'Alla träffar från de valda katalogerna har hämtats.' },
  { total: null, count: 2, label: '2 träffar (totalt antal okänt)', heading: 'Träfflistans täckning är okänd.' },
  { total: null, count: 0, label: '0 träffar (totalt antal okänt)', heading: 'Träfflistans täckning är okänd.' },
]) {
  test(`shows coverage for ${scenario.count} retrieved out of ${scenario.total}`, async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('samsok:halland:selected-sources:v1', '["halmstad-university"]'));
    await page.route(proxyPattern, (route) => reply(route, scenario.total, scenario.count));
    await page.goto('./#/search?query=book');
    const coverage = page.locator('.source-status .source-coverage');
    await expect(coverage).toHaveText(scenario.label);
    const summary = page.getByRole('region', { name: 'Träfflistans täckning' });
    await expect(summary.locator('strong')).toHaveText(scenario.heading);
    if (scenario.total !== null && scenario.count < scenario.total) {
      await expect(coverage).toHaveCSS('background-color', 'rgb(255, 244, 204)');
    }
    const row = page.locator('.source-status > li');
    expect(await row.evaluate((element) => {
      const link = element.querySelector('a')!;
      const count = element.querySelector('.source-coverage')!;
      return Math.abs(link.getBoundingClientRect().top - count.getBoundingClientRect().top) < 2;
    })).toBe(true);
    await expect(page.locator('.source-status a')).toHaveAttribute('href', /^https:\/\/libris\.kb\.se\/hitlist/);
  });
}

test('distinguishes completion from coverage and preserves coverage through grouping, filtering and selection', async ({ page }) => {
  let pending: Route | undefined;
  await page.route(proxyPattern, async (route) => {
    const target = new URL(route.request().url()).searchParams.get('url')!;
    if (target.includes('bibl:umdp')) pending = route;
    else await reply(route, 3);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/search?query=book');
  const summary = page.getByRole('region', { name: 'Träfflistans täckning' });
  await expect(summary).toContainText('Delvis hämtade: 1 katalog.');
  await expect(summary).toContainText('Söker fortfarande: 1 katalog.');
  await expect(page.locator('.source-status .source-coverage')).toHaveText('Visar 66,6% (2 träffar av totalt 3)');
  await expect.poll(() => pending !== undefined).toBe(true);
  await reply(pending!, 2);
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 4 hämtade träffar. 2 grupperade träffar.');
  await expect(summary).toContainText('Alla träffar hämtade: 1 av 2 kataloger.');
  await expect(summary).not.toContainText('Söker fortfarande');
  await page.getByLabel('Filtrera hämtade träffar').fill('does not match');
  await expect(page.locator('.result-card')).toHaveCount(0);
  await expect(page.locator('.source-status .source-coverage')).toHaveText(['Visar 66,6% (2 träffar av totalt 3)', '2 träffar']);
  await expect(summary.locator('strong')).toHaveText('Träfflistan är ofullständig.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek', exact: true }).uncheck();
  await expect(summary.locator('strong')).toHaveText('Alla träffar från de valda katalogerna har hämtats.');
  await page.getByRole('checkbox', { name: 'Depåbiblioteket i Umeå', exact: true }).first().uncheck();
  await expect(summary).toHaveCount(0);
});

test('does not claim full coverage for pending or failed sources and updates after retry', async ({ page }) => {
  let pending: Route | undefined;
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    const target = new URL(route.request().url()).searchParams.get('url')!;
    if (target.includes('bibl:umdp')) await reply(route, 0, 0);
    else if (++attempts === 1) pending = route;
    else await reply(route, 0, 0);
  });
  await page.goto('./#/search?query=book');
  const summary = page.getByRole('region', { name: 'Träfflistans täckning' });
  await expect(summary).toContainText('Alla träffar hämtade: 1 av 2 kataloger.');
  await expect(summary.locator('strong')).toHaveText('Träfflistan är inte färdig.');
  await expect.poll(() => pending !== undefined).toBe(true);
  await pending!.abort('failed');
  await expect(summary.locator('strong')).toHaveText('Träfflistan är ofullständig.');
  await expect(summary).toContainText('Kunde inte sökas: 1 katalog.');
  await page.getByRole('button', { name: 'Försök igen: Halmstad Högskolebibliotek' }).click();
  await expect(summary.locator('strong')).toHaveText('Alla träffar från de valda katalogerna har hämtats.');
  await expect(summary).toContainText('Alla träffar hämtade: 2 av 2 kataloger.');
  await expect(summary).not.toContainText('Kunde inte sökas');
});
