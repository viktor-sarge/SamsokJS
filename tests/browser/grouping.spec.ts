import { expect, test } from '@playwright/test';

test('groups matching records as libraries arrive, preserving links, filtering and selections', async ({ page }) => {
  let releaseDepot!: () => void;
  const depotReady = new Promise<void>((resolve) => { releaseDepot = resolve; });
  let requests = 0;
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const depot = params.get('url')!.includes('bibl:umdp');
    requests++;
    if (depot) await depotReady;
    const record = {
      title: depot ? ' VINTERBOKEN  ' : 'Vinterboken',
      creator: depot ? 'anna   exempel' : 'Anna Exempel', date: '2020',
      type: depot ? 'BOK' : 'Bok', identifier: depot ? 'https://example.org/depot' : 'https://example.org/halmstad',
    };
    const list = [record,
      { ...record, type: 'E-bok', identifier: `${record.identifier}/ebook` },
      { ...record, creator: '', identifier: `${record.identifier}/anonymous` }];
    await route.fulfill({
      contentType: 'application/javascript',
      body: `${params.get('callback')}(${JSON.stringify({ content: JSON.stringify({ xsearch: { records: 3, list } }) })});`,
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/search?query=book');
  await expect(page.locator('.result-card')).toHaveCount(3);
  releaseDepot();
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 6 hämtade träffar. 4 grupperade träffar.');
  await expect(page.locator('.result-card')).toHaveCount(4);
  const print = page.locator('.result-card').filter({ has: page.locator('.library-links a[href="https://example.org/halmstad"]') });
  await expect(print.getByRole('heading', { name: 'Vinterboken', exact: true })).toBeVisible();
  await expect(print.locator('.library-links a')).toHaveCount(2);
  await expect(print.getByRole('link', { name: /^Halmstad Högskolebibliotek\s*: Vinterboken$/ }))
    .toHaveAttribute('href', 'https://example.org/halmstad');
  await expect(print.getByRole('link', { name: /^Depåbiblioteket i Umeå\s*: Vinterboken$/ }))
    .toHaveAttribute('href', 'https://example.org/depot');
  await expect(print.getByRole('link', { name: /^Sök i Libris\s*: Vinterboken$/ })).toBeVisible();
  await page.getByLabel('Filtrera hämtade träffar').fill('Depåbiblioteket');
  await expect(page.locator('.result-card')).toHaveCount(3);
  await expect(print.locator('.library-links a')).toHaveCount(2);
  await expect(page.getByText('Visar 3 av 4 grupperade träffar (6 hämtade träffar)')).toBeVisible();
  await page.getByLabel('Filtrera hämtade träffar').fill('');
  await page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek', exact: true }).uncheck();
  await expect(page.locator('.result-card')).toHaveCount(3);
  await expect(page.locator('.library-links a[href="https://example.org/halmstad"]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek', exact: true }).check();
  await expect(page.locator('.result-card')).toHaveCount(4);
  await expect(print.locator('.library-links a')).toHaveCount(2);
  expect(requests).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
