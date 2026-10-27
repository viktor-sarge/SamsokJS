import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

const results = readFileSync(new URL('../fixtures/koha-results.html', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../fixtures/koha-detail.html', import.meta.url), 'utf8');
const proxyPattern = 'https://samsokproxy.appspot.com/crossdomain?**';
const base = 'https://bibliotekskatalog.falkenberg.se';
const searchUrl = `${base}/cgi-bin/koha/opac-search.pl?q=book`;
const cookiePage = '<script src="/opac-tmpl/lib/koha_fast_challenge/index.js"></script><div class="loading-overlay"></div>';
const challenge = (algorithm: string, difficulty = 1) =>
  `<script id="anubis_challenge" type="application/json">${JSON.stringify({
    rules: { algorithm, difficulty }, challenge: { id: 'test-id', randomData: 'test-data' },
  })}</script><script id="anubis_base_prefix">""</script>`;

async function reply(route: Route, content: string, options: { url?: string; cookies?: string; status?: number } = {}) {
  const callback = new URL(route.request().url()).searchParams.get('callback');
  await route.fulfill({
    contentType: 'application/javascript',
    body: `${callback}(${JSON.stringify({
      content, cookies: options.cookies,
      status: { http_code: options.status ?? 200, resolved_url: options.url ?? searchUrl },
    })});`,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem(
    'samsok:halland:selected-sources:v1', JSON.stringify(['falkenberg']),
  ));
});

test('parses Koha in a production module worker without executing scripts or loading embedded resources', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  const resources: string[] = [];
  page.on('request', (request) => resources.push(request.url()));
  await page.route(proxyPattern, (route) => reply(route, results));
  await page.goto('./#/search?query=book');
  await expect(page.getByRole('status')).toContainText('Sökningen är klar. 2 hämtade träffar.');
  await expect(page.locator('.source-status')).toContainText('Visar 0,1% (2 träffar av totalt 1234)');
  await expect(page.locator('.author-group').first()).toContainText('Vinter & vår');
  await expect(page.locator('.result-card .library-links a').first()).toHaveAttribute('href',
    `${base}/cgi-bin/koha/opac-detail.pl?biblionumber=12`);
  expect(resources.some((url) => /\/halland\/assets\/koha\.worker-.*\.js$/.test(url))).toBe(true);
  expect(resources.some((url) => url.includes('should-not-load'))).toBe(false);
  expect(errors).toEqual([]);
});

test('retries Koha cookie challenges once and forwards no challenge script to the page', async ({ page }) => {
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    const url = new URL(route.request().url());
    if (attempts === 1) {
      await reply(route, cookiePage);
    } else {
      expect(url.searchParams.get('cookies')).toBe('KOHA_INIT=1; path=/; SameSite=Lax; Secure');
      expect(new URL(url.searchParams.get('url')!).searchParams.get('q')).toBe('räv & bok');
      await reply(route, results);
    }
  });
  await page.goto('./#/search?query=r%C3%A4v%20%26%20bok');
  await expect(page.locator('.result-card')).toHaveCount(2);
  expect(attempts).toBe(2);
});

test('uses proxy redirect metadata for a single result', async ({ page }) => {
  await page.route(proxyPattern, (route) => reply(route, detail.replace(/<a id="ISBDview"[\s\S]*?<\/a>/, ''), {
    url: `${base}/cgi-bin/koha/opac-detail.pl?biblionumber=12`,
  }));
  await page.goto('./#/search?query=book');
  await expect(page.locator('.result-card')).toHaveCount(1);
  await expect(page.locator('.result-card .library-links a')).toHaveAttribute('href',
    `${base}/cgi-bin/koha/opac-detail.pl?biblionumber=12`);
  await expect(page.locator('.source-status')).toContainText('1 träff');
});

for (const algorithm of ['fast', 'slow']) {
  test(`solves Anubis ${algorithm} proof-of-work in a worker and forwards proxy cookies`, async ({ page }) => {
    let attempts = 0;
    await page.route(proxyPattern, async (route) => {
      attempts++;
      const url = new URL(route.request().url());
      const target = new URL(url.searchParams.get('url')!);
      if (attempts === 1) {
        await reply(route, challenge(algorithm), { status: 403, cookies: 'opaque-verification-cookie' });
      } else {
        expect(target.pathname).toBe('/.within.website/x/cmd/anubis/api/pass-challenge');
        expect(target.searchParams.get('id')).toBe('test-id');
        expect(target.searchParams.get('redir')).toBe(searchUrl);
        expect(url.searchParams.get('cookies')).toBe('opaque-verification-cookie');
        const nonce = target.searchParams.get('nonce');
        expect(Number(nonce)).toBeGreaterThanOrEqual(0);
        const hash = createHash('sha256').update('test-data' + nonce).digest('hex');
        expect(target.searchParams.get('response')).toBe(hash);
        expect(hash.startsWith('0')).toBe(true);
        expect(Number(target.searchParams.get('elapsedTime'))).toBeGreaterThanOrEqual(1);
        await reply(route, results, { cookies: 'opaque-auth-cookie' });
      }
    });
    await page.goto('./#/search?query=book');
    await expect(page.locator('.result-card')).toHaveCount(2);
    expect(attempts).toBe(2);
  });
}

test('waits for Anubis metarefresh and preserves cookies through repeated challenges', async ({ page }) => {
  let attempts = 0;
  let issuedAt = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    const url = new URL(route.request().url());
    const target = new URL(url.searchParams.get('url')!);
    if (attempts === 1) {
      issuedAt = Date.now();
      await reply(route, challenge('metarefresh', 0), { cookies: 'verification-one' });
    } else {
      expect(Date.now() - issuedAt).toBeGreaterThanOrEqual(950);
      expect(target.searchParams.get('challenge')).toBe('test-data');
      expect(target.searchParams.get('redir')).toBe('/cgi-bin/koha/opac-search.pl?q=book');
      expect(url.searchParams.get('cookies')).toBe(attempts === 2 ? 'verification-one' : 'verification-two');
      if (attempts === 2) {
        issuedAt = Date.now();
        await reply(route, challenge('metarefresh', 0), { cookies: 'verification-two' });
      } else {
        await reply(route, results);
      }
    }
  });
  await page.goto('./#/search?query=book');
  await expect(page.locator('.result-card')).toHaveCount(2);
  expect(attempts).toBe(3);
});

test('bounds repeated challenges and surfaces unsupported challenge errors', async ({ page }) => {
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    await reply(route, cookiePage);
  });
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Kohas cookie-kontroll misslyckades.', { exact: false })).toBeVisible();
  expect(attempts).toBe(2);
  await page.route(proxyPattern, (route) => reply(route, challenge('unknown')));
  await page.getByRole('button', { name: 'Försök igen: Falkenberg' }).click();
  await expect(page.getByText('Katalogens Anubis-utmaning stöds inte.', { exact: false })).toBeVisible();
});

test('cancels a timed challenge on a new query without issuing a verification request', async ({ page }) => {
  let verificationRequests = 0;
  let issued = false;
  await page.route(proxyPattern, async (route) => {
    const target = new URL(new URL(route.request().url()).searchParams.get('url')!);
    if (target.pathname.includes('pass-challenge')) verificationRequests++;
    if (target.searchParams.get('q') === 'old') issued = true;
    await reply(route, target.searchParams.get('q') === 'old' ? challenge('metarefresh', 2)
      : '<h1 id="numresults">Inga resultat hittades!</h1>', { cookies: 'opaque-cookie' });
  });
  await page.goto('./#/search?query=old');
  await expect.poll(() => issued).toBe(true);
  await expect.poll(() => page.workers().length).toBe(0);
  await page.getByLabel('Vad letar du efter?').fill('new');
  await page.getByRole('button', { name: 'Sök', exact: true }).click();
  await expect(page.getByText('Inga träffar hittades.', { exact: true })).toBeVisible();
  expect(verificationRequests).toBe(0);
});

test('retries the search with auth cookies when Anubis verification does not redirect', async ({ page }) => {
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const target = new URL(params.get('url')!);
    attempts++;
    if (attempts === 1) {
      await reply(route, challenge('fast'), { cookies: 'verification' });
    } else if (attempts === 2) {
      await reply(route, 'Verified', { url: target.href, cookies: 'authenticated' });
    } else {
      expect(target.href).toBe(searchUrl);
      expect(params.get('cookies')).toBe('authenticated');
      await reply(route, results);
    }
  });
  await page.goto('./#/search?query=book');
  await expect(page.locator('.result-card')).toHaveCount(2);
  expect(attempts).toBe(3);
});

test('bounds repeating Anubis challenges to four proxy requests', async ({ page }) => {
  let attempts = 0;
  await page.route(proxyPattern, async (route) => {
    attempts++;
    await reply(route, challenge('fast', 0), { cookies: 'verification' });
  });
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Katalogens kontroll återkom för många gånger.', { exact: false })).toBeVisible();
  expect(attempts).toBe(4);
});

test('terminates a proof-of-work worker when the selected sources change', async ({ page }) => {
  await page.route(proxyPattern, (route) => reply(route, challenge('fast', 6), { cookies: 'verification' }));
  await page.goto('./#/search?query=book');
  await expect.poll(() => page.workers().some((worker) => worker.url().includes('koha.worker'))).toBe(true);
  await page.getByRole('checkbox', { name: 'Falkenberg' }).uncheck();
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.locator('.result-card')).toHaveCount(0);
});

test('rejects cross-origin redirect metadata instead of submitting challenge cookies elsewhere', async ({ page }) => {
  await page.route(proxyPattern, (route) => reply(route, challenge('fast'), {
    url: 'https://other.example/search', cookies: 'private-cookie',
  }));
  await page.goto('./#/search?query=book');
  await expect(page.getByText('Koha omdirigerade till en annan webbplats.', { exact: false })).toBeVisible();
});
