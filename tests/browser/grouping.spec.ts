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
  await expect(print.getByRole('heading', { name: '2020', exact: true })).toBeVisible();
  const author = page.locator('.author-group').filter({ has: page.getByRole('heading', { name: 'Anna Exempel', exact: true }) });
  await expect(author.locator('.title-group')).toHaveCount(1);
  await expect(author.getByRole('heading', { name: 'Vinterboken', exact: true })).toBeVisible();
  await expect(author.locator('.format-group')).toHaveCount(2);
  await expect(author.locator('.year-group')).toHaveCount(2);
  await expect(author.getByRole('heading', { name: 'Bok', exact: true })).toBeVisible();
  await expect(author.locator('.result-card')).toHaveCount(2);
  await expect(print.locator('.library-links a')).toHaveCount(2);
  await expect(print.getByRole('link', { name: /^Halmstad Högskolebibliotek\s*: Vinterboken, 2020, Bok$/ }))
    .toHaveAttribute('href', 'https://example.org/halmstad');
  await expect(print.getByRole('link', { name: /^Depåbiblioteket i Umeå\s*: Vinterboken, 2020, Bok$/ }))
    .toHaveAttribute('href', 'https://example.org/depot');
  await expect(print.getByRole('link', { name: /^Sök i Libris\s*: Vinterboken, 2020, Bok$/ })).toBeVisible();
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

test('keeps title variations, years and formats under their matching author with exact source links', async ({ page }) => {
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const depot = params.get('url')!.includes('bibl:umdp');
    const library = depot ? 'depot' : 'halmstad';
    const records = [
      { title: 'Vinterboken', creator: 'Anna Exempel', date: '2021', type: 'E-bok', id: 'ebook' },
      { title: 'Vinterboken!', creator: 'Anna Exempel', date: '2018', type: 'Bok', id: 'variation' },
      { title: 'Vinterboken', creator: 'Anna Exempel', date: '2020', type: 'Bok', id: 'original' },
      { title: 'Vinterboken', creator: 'Bo Exempel', date: '2020', type: 'Bok', id: 'other-author' },
      { title: 'Vinterboken', creator: 'Anna Exempel', date: '2021', type: 'Bok', id: 'new-year' },
    ].filter((record) => !depot || ['ebook', 'original'].includes(record.id))
      .map(({ id, ...record }) => ({ ...record, identifier: `https://example.org/${library}/${id}` }));
    await route.fulfill({
      contentType: 'application/javascript',
      body: `${params.get('callback')}(${JSON.stringify({ content: JSON.stringify({ xsearch: { records: records.length, list: records } }) })});`,
    });
  });
  await page.goto('./#/search?query=book');
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 7 hämtade träffar. 5 grupperade träffar.');
  await expect(page.locator('.author-group')).toHaveCount(2);
  const author = page.locator('.author-group').first();
  await expect(author.getByRole('heading', { level: 3 })).toHaveText('Anna Exempel');
  await expect(author.locator('.title-group > h4')).toHaveText(['Vinterboken', 'Vinterboken!']);
  const title = author.locator('.title-group').first();
  await expect(title.locator('.format-group > h5')).toHaveText(['Bok', 'E-bok']);
  const books = title.locator('.format-group').first();
  await expect(books.locator('h6')).toHaveText(['2020', '2021']);
  await expect(books.locator('.result-card').first().locator('.library-links a')).toHaveCount(2);
  await expect(books.locator('.result-card').nth(1).locator('.library-links a')).toHaveCount(1);
  const ebook = page.locator('.format-group').filter({ has: page.getByRole('heading', { name: 'E-bok', exact: true }) }).locator('.result-card');
  await expect(ebook.locator('.library-links a').first()).toHaveAttribute('target', '_blank');
  await expect(ebook.locator('.library-links a')).toHaveCount(2);
  await expect(ebook.locator('.library-links a').first()).toHaveAttribute('href', 'https://example.org/halmstad/ebook');
  await expect(ebook.locator('.library-links a').nth(1)).toHaveAttribute('href', 'https://example.org/depot/ebook');
  await page.getByLabel('Filtrera hämtade träffar').fill('E-bok');
  await expect(page.locator('.author-group')).toHaveCount(1);
  await expect(page.locator('.title-group > h4')).toHaveText(['Vinterboken']);
  await expect(page.locator('.format-group > h5')).toHaveText(['E-bok']);
  await expect(page.locator('.year-group h6')).toHaveText(['2021']);
  await expect(page.locator('.result-card')).toHaveCount(1);
  await expect(ebook.locator('.library-links a')).toHaveCount(2);
});
