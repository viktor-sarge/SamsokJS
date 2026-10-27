import { expect, test } from '@playwright/test';

const key = 'samsok:halland:source-favorites:v1';

test.beforeEach(async ({ page }) => {
  await page.route('https://samsokproxy.appspot.com/crossdomain?**', (route) => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({
      contentType: 'application/javascript',
      body: `${callback}(${JSON.stringify({ content: '{"xsearch":{"records":0,"list":[]}}' })});`,
    });
  });
});

test('saves, applies, validates, reloads and deletes exact selections without changing the query', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/search?query=book');
  const favorites = page.getByRole('region', { name: 'Mina favoriter' });
  const university = page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek', exact: true });
  const depot = page.getByRole('checkbox', { name: 'Depåbiblioteket i Umeå', exact: true });
  const url = page.url();
  await university.uncheck();
  await favorites.getByRole('button', { name: 'Spara aktuellt val' }).click();
  await expect(page.getByLabel('Namn på favorit')).toBeFocused();
  await page.getByLabel('Namn på favorit').fill('Depå');
  await page.getByRole('button', { name: 'Spara favorit', exact: true }).click();
  await expect(favorites.getByRole('button', { name: 'Depå', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await university.check();
  await expect(favorites.getByRole('button', { name: 'Depå', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await favorites.getByRole('button', { name: 'Spara aktuellt val' }).click();
  await page.getByLabel('Namn på favorit').fill('  DEPÅ  ');
  await page.getByRole('button', { name: 'Spara favorit', exact: true }).click();
  await expect(favorites.getByRole('alert')).toContainText('Det finns redan en favorit');
  await expect(favorites.locator('.favorite-list li')).toHaveCount(1);
  await page.getByLabel('Namn på favorit').fill('Båda');
  await page.getByRole('button', { name: 'Spara favorit', exact: true }).click();
  await favorites.getByRole('button', { name: 'Depå', exact: true }).click();
  await expect(university).not.toBeChecked();
  for (const checkbox of await depot.all()) await expect(checkbox).toBeChecked();
  await expect(page.getByRole('status')).toContainText('Sökningen är klar');
  await expect(page).toHaveURL(url);
  await page.reload();
  await expect(favorites.getByRole('button', { name: 'Depå', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await favorites.getByRole('button', { name: 'Båda', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(university).toBeChecked();
  await page.getByRole('checkbox', { name: 'Markera alla', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Markera alla', exact: true }).uncheck();
  await favorites.getByRole('button', { name: 'Spara aktuellt val' }).click();
  await page.getByLabel('Namn på favorit').fill('Inga');
  await page.getByRole('button', { name: 'Spara favorit', exact: true }).click();
  await favorites.getByRole('button', { name: 'Båda', exact: true }).click();
  await favorites.getByRole('button', { name: 'Inga', exact: true }).click();
  await expect(page.getByText('Välj minst en katalog för att söka.')).toBeVisible();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
  const beforeDelete = await page.evaluate((key) => localStorage.getItem(key), key);
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toBe('Vill du ta bort favoriten ”Depå”?');
    await dialog.dismiss();
  });
  await favorites.getByRole('button', { name: 'Ta bort favorit: Depå', exact: true }).click();
  await expect(favorites.getByRole('button', { name: 'Depå', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(beforeDelete);
  page.once('dialog', (dialog) => dialog.accept());
  await favorites.getByRole('button', { name: 'Ta bort favorit: Depå', exact: true }).click();
  await expect(favorites.getByRole('button', { name: 'Depå', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(favorites.locator('.favorite-list li')).toHaveCount(2);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(saved).toEqual([
    { name: 'Båda', selected: ['umea-depot', 'halmstad-university'] },
    { name: 'Inga', selected: [] },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ignores removed sources and keeps instance favorites isolated', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify([{ name: 'Gammalt val', selected: ['umea-depot', 'removed', 'umea-depot'] }]));
  }, { key });
  await page.goto('./');
  const favorites = page.getByRole('region', { name: 'Mina favoriter' });
  await favorites.getByRole('button', { name: 'Gammalt val', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Halmstad Högskolebibliotek', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Depåbiblioteket i Umeå', exact: true }).first()).toBeChecked();
  await page.goto('http://127.0.0.1:4174/depot/');
  await expect(favorites.locator('.favorite-list li')).toHaveCount(0);
});

test('reports malformed favorites and storage failures without pretending mutations succeeded', async ({ page }) => {
  await page.addInitScript(({ key }) => localStorage.setItem(key, '{bad'), { key });
  await page.goto('./');
  const favorites = page.getByRole('region', { name: 'Mina favoriter' });
  await expect(favorites.getByRole('alert')).toContainText('Dina favoriter kunde inte läsas');
  await favorites.getByRole('button', { name: 'Spara aktuellt val' }).click();
  await page.getByLabel('Namn på favorit').fill('Test');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes('source-favorites')) throw new DOMException('Full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Spara favorit', exact: true }).click();
  await expect(favorites.getByText('Ändringen av dina favoriter kunde inte sparas. Försök igen.')).toBeVisible();
  await expect(page.getByLabel('Namn på favorit')).toHaveValue('Test');
  await expect(favorites.locator('.favorite-list li')).toHaveCount(0);
  await page.reload();
  await favorites.getByRole('button', { name: 'Spara aktuellt val' }).click();
  await page.getByLabel('Namn på favorit').fill('Test');
  await page.getByRole('button', { name: 'Spara favorit', exact: true }).click();
  await expect(favorites.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  page.once('dialog', (dialog) => dialog.accept());
  await favorites.getByRole('button', { name: 'Ta bort favorit: Test', exact: true }).click();
  await expect(favorites.getByRole('alert')).toContainText('kunde inte sparas');
  await expect(favorites.getByRole('button', { name: 'Test', exact: true })).toBeVisible();
});
