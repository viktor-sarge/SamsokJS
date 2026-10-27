# SamsokJS

Browser-only federated library catalogue search. The new React application is
being developed alongside the original Ember application. Both use the existing
external proxy where cross-origin catalogue requests require it. Neither needs
an application backend.

## Migration status

The migration provides React, TypeScript, Vite, validated instance
configuration, two example skins, and Libris Xsearch, Vega, and Koha adapters. It includes
search progress, per-source errors and retries, partial totals, title sorting,
local filtering, catalogue/Libris links, saved source selection, and shareable
search URLs.

The new Halland instance offers **Halmstad Högskolebibliotek** and
**Depåbiblioteket i Umeå** via Libris, **Falkenberg** and **Hylte** via Koha,
plus **Göteborg** and **Malmö** via Vega.
The two Libris sources remain selected by default; visitors can enable other sources in
the catalogue panel. Existing saved selections are preserved.
The depot example includes only Depåbiblioteket i Umeå.
These are preview instances, not replacements for the complete existing service.

The original [Ember entry point](index.html), catalogue definitions, parsers,
styles, and assets are unchanged. Continue deploying the original repository
files to use the full legacy application. Building the new app does not overwrite
them or include them in its output.

## Development

Use Node.js 22.12+ (Node.js 24 LTS recommended) and npm:

```sh
npm ci
npm run dev -- --instance halland
```

Open the URL printed by Vite. The default instance is `halland`.
Use `--instance depot` for the second example.

On Windows, use `npm.cmd` in PowerShell if execution policy blocks `npm.ps1`;
regular `npm` works in Git Bash. If your default registry is an internal feed
whose credentials have expired, these dependencies are all public:

```sh
npm ci --registry=https://registry.npmjs.org
```

No internal feed token is required for this application. Do not put credentials
in instance files or commit them to the repository.

## Static builds and deployment

```sh
npm run build -- --instance halland
npm run preview -- --instance halland
```

Upload the **contents** of `dist/halland/` to your static host or CDN. Build
`depot` to produce `dist/depot/`. Each build contains only the selected instance's
configuration, source definitions, and theme. Builds do not delete other
instances' output.

Assets use relative URLs; deploy at a domain root or a subdirectory such as
`https://example.org/search/`. Use a trailing slash for directory URLs.
Search links use `#/search?query=...`, so the CDN does not need SPA rewrites.
Existing Ember links with that search format also work.

Serve files over HTTP(S), not `file://`. Node is needed only for development,
building, and local preview, not on the production host.

For CDN caching, give fingerprinted `assets/` files long immutable lifetimes and
revalidate `index.html`. Publish the complete build together.

## Configure an instance

1. Copy [instances/halland.json](instances/halland.json) to
   `instances/<your-id>.json`. Set `id` to match the filename.
2. Edit the title, subtitle, introductory/about text, groups, selected defaults,
   proxy URL, and theme.
3. Reference source IDs from [config/sources.json](config/sources.json).
4. Build with `npm run build -- --instance <your-id>`.

IDs use lowercase letters, digits, and single separating hyphens. Configuration
is checked at startup/build time using [config/schema.ts](config/schema.ts).
Unknown properties, invalid URLs, unsupported adapters, missing query
placeholders, unknown sources, duplicate group/source entries, and defaults not
included in the instance fail explicitly. Empty default selection is allowed.
After changing configuration or theme selection, restart the dev server.

`sourceGroups` controls **available** sources and their display order;
`defaultSelectedSources` controls the initial visitor selection. Visitors can
only select sources included by the instance. A source may appear in different
groups, but it is searched once. Saved selections are namespaced by instance
and use stable IDs, not display names. Legacy name-based preferences are not
imported; the first visit uses the configured defaults. Saved IDs removed from
an instance are ignored. Newly included sources can be selected by the visitor.

To add a catalogue using Xsearch, add a source with:

```json
{
  "name": "Example library",
  "adapter": "libris-xsearch",
  "searchUrl": "https://libris.kb.se/xsearch?query=@QUERY@%20AND%20bibl:EXAMPLE&format=json&holdings=true&n=200",
  "catalogueUrl": "https://libris.kb.se/hitlist?q=@QUERY@+bib%3aEXAMPLE&d=libris",
  "encoding": "utf-8"
}
```

`@QUERY@` is URI-component encoded by the adapter. Keep other parameters encoded
in the template. The response limit is controlled by the catalogue URL's `n`
parameter; the UI distinguishes retrieved hits from the upstream total and links
to the catalogue for more results. Metadata can contain strings or string arrays.

Supporting a different catalogue protocol requires a new typed adapter, schema
support, and tests. It does not require changing React presentation components.

### Vega catalogues

To add a Vega tenant, use a source definition like:

```json
{
  "name": "Göteborg",
  "adapter": "vega",
  "apiUrl": "https://eu.iiivega.com/api/search-result/search/format-groups",
  "customerDomain": "gsb.eu.iiivega.com",
  "catalogueUrl": "https://bibliotek.goteborg.se/search?query=@QUERY@&searchType=everything&pageSize=40",
  "pageSize": 40
}
```

`customerDomain` is the tenant hostname sent in the catalogue's
`iii-customer-domain` API header. `iii-host-domain` is derived from the public
`catalogueUrl` host. `apiUrl` must support direct browser CORS POST requests
with those headers and `api-version: 2`. No proxy or API secret is used.
`pageSize` is an integer from 1 to 40; the adapter requests the first page,
preserves the API's total, and links to the public catalogue for additional hits.
Keep `catalogueUrl`'s page size consistent with the API limit for a matching
catalogue experience. Vega record links use that catalogue's `/search/card`
route with encoded `id` and `entityType` parameters.

Vega format groups become individual result cards with available material types
combined into one label. The adapter preserves the legacy author/date
normalization: remove parenthetical author qualifiers/lifespan suffixes and show
the start of publication date ranges. Missing optional metadata is allowed;
missing IDs, blank titles, invalid totals, and malformed API responses are errors,
not successful empty searches.

All deployed configuration is public. Do not include API secrets. Configuration
is build-time only: changes require a rebuild and deployment.

### Koha catalogues

```json
{
  "name": "Falkenberg",
  "adapter": "koha",
  "searchUrl": "https://bibliotekskatalog.falkenberg.se/cgi-bin/koha/opac-search.pl?q=@QUERY@",
  "catalogueUrl": "https://bibliotekskatalog.falkenberg.se/cgi-bin/koha/opac-search.pl?q=@QUERY@",
  "encoding": "utf-8"
}
```

Koha searches retrieve HTML through the configured proxy. Modern and older
result markup, Swedish/English result counts, known empty-result pages, and
single-record redirects are supported. Unsupported HTML, incomplete records, and
invalid links produce explicit source errors rather than empty successes.
Relative links are resolved against the proxy's final `status.resolved_url`.

The proxy must preserve its opaque `cookies` value across verification requests
and accept a `cookies` query parameter. Cookies remain within that source's
current search, not browser storage. The adapter supports Koha's `KOHA_INIT`
cookie check (one retry), Anubis `metarefresh`, and SHA-256 `fast`/`slow`
proof-of-work with object-shaped `challenge.id`/`challenge.randomData`.
Unknown challenge versions/algorithms fail explicitly. No page scripts execute.
Anubis acceptance also depends on the upstream service and proxy IP/cookie
continuity; fixture tests cannot guarantee compatibility with every installation.

Limits are fixed rather than accepting arbitrary work from a remote page:
four proxy requests per search; a 2,000,000-character HTML parsing limit;
Anubis difficulty 0–6; at most 500,000 nonce attempts or 15 seconds per solver.
The instance's `proxy.timeoutMs` bounds the entire Koha workflow, including
waiting, worker computation, and requests. Cancellation terminates the worker
and pending waits. Verification URLs are restricted to the catalogue origin.
Proof-of-work requires WebCrypto in a secure context (HTTPS or localhost).

### Cheerio dependency and workers

Cheerio is pinned to version 1.2.0 and imported through `cheerio/slim` in a module
worker. This uses htmlparser2 without parse5 or Node's HTTP client in the browser
bundle. The npm package still installs its wider dependency tree for development;
the slim import does not eliminate those installed dependencies.
Use the lockfile with `npm ci`, review dependency updates, and run `npm audit`
against the registry you trust. An audit reports known advisories, not a
guarantee of safety. The package currently emits a transitive
`whatwg-encoding` deprecation warning during installation.

The worker asset is fetched when a Koha search needs it, not when the app opens.
At this milestone the worker is about 216 KB uncompressed, 74 KB with gzip, or
65 KB with Brotli (actual transfer size depends on CDN compression).
Parsing never inserts catalogue HTML into a browser document, executes its
scripts, or loads its embedded images. Workers keep parsing and hashing off the
UI thread; no claim is made that they reduce total search latency. The worker
has a separate fingerprinted asset and must be deployed along with other build
assets. A Content Security Policy must permit `worker-src 'self'`.

## Skinning

Themes live in [modern/themes](modern/themes). Set an instance's `theme` to the
CSS filename without its extension. Copy a supplied theme to create a new one.
Only that theme is included in the build.

The supplied themes demonstrate different palettes, heading fonts, corner
treatments, and content widths. Required CSS variables:

- `--color-primary`, `--color-primary-hover`, `--color-on-primary`
- `--color-background`, `--color-surface`, `--color-text`, `--color-muted`
- `--color-border`, `--color-tint`, `--color-error`
- `--font-body`, `--font-heading`, `--radius-panel`, `--content-width`

For deeper overrides, append rules targeting `.site-header`, `.brand`, `.hero`,
`.search-form`, `.search-layout`, `.catalogue-panel`, `.result-card`, or
`.site-footer`. Theme files can reference local fonts/images using relative CSS
`url(...)`; Vite fingerprints and includes those assets. There is no dedicated
logo configuration field yet; the header currently uses the configured title.

Core responsive styles live in [modern/src/styles.css](modern/src/styles.css).
Keep branding/editorial text in instance JSON rather than hardcoding it in React.
Check color contrast, focus visibility, keyboard navigation, and mobile layouts
when creating a skin. The preview does not claim formal accessibility compliance.

## Search and proxy compatibility

- [modern/src/search/xsearch.ts](modern/src/search/xsearch.ts) implements Xsearch
  requests and normalizes results without React dependencies.
- [modern/src/search/vega.ts](modern/src/search/vega.ts) implements direct CORS
  POST requests, tenant-specific result links, and normalized Vega format groups.
- [modern/src/search/koha.ts](modern/src/search/koha.ts) coordinates cookie and
  Anubis verification through the proxy.
- [modern/src/search/koha-parser.ts](modern/src/search/koha-parser.ts) and
  [modern/src/search/koha.worker.ts](modern/src/search/koha.worker.ts) parse HTML
  and compute bounded proofs in a module worker.
- [modern/src/search/adapters.ts](modern/src/search/adapters.ts) dispatches on the
  validated source adapter, independently of the UI and search coordinator.
- [modern/src/search/session.ts](modern/src/search/session.ts) coordinates up to
  four concurrent requests, cancels obsolete searches, ignores stale responses,
  retries individual failures, and caches up to 32 successful source/query pairs
  in memory for the current page session.
- [modern/src/search/transport.ts](modern/src/search/transport.ts) isolates the
  legacy JSONP proxy protocol, timeouts, abort cleanup, and response validation.

The examples use the existing public
[SamsokProxy](https://github.com/regionbibliotekhalland/SamsokProxy) endpoint.
Its availability and third-party catalogue behavior are outside this app's
control. Configure an alternative compatible proxy for your deployment.
The Xsearch and Koha adapters request UTF-8 content and expect JSONP wrapping an object
with `content` and optional `status.http_code`.

JSONP executes JavaScript from the configured proxy: use only a trusted endpoint.
Search queries are sent to that proxy and the selected catalogues. Cancellation
stops local processing but cannot guarantee that a proxy-side request stops.
Aborted/timed-out JSONP requests retain an inert callback until the pending
script finishes, preventing late responses from throwing or changing results.
If you configure a Content Security Policy, allow the proxy in `script-src`;
this milestone does not require `unsafe-eval`.

Vega queries go directly to the configured API, without proxying, credentials,
or browser referrers. Add the Vega API origin to `connect-src` if you set a
Content Security Policy. The adapters use the instance's `proxy.timeoutMs`
as their per-request deadline (including reading Vega's response body).
Vega HTTP, network/CORS, malformed-response, and timeout failures appear per
source and can be retried without repeating successful source requests.

The transport is intentionally separate so a future CORS JSON proxy can replace
JSONP. Other planned migrations include Arena, Stockholm, and
Mina bibliotek, preserving their redirects, cookies, encodings, and API behavior.
No remote challenge-script execution has been ported. The JSON adapters
do not need workers; expensive parsers should use module workers, not the
legacy eval-based worker.

### Legacy maintenance

The legacy HTML parsers use the vendored Cheerio Browserify bundle in `js/`,
not the new app's npm dependencies. The original bundle was generated with
`browserify index.js --standalone cheerio > cheerio.browserified.js` and then
minified, with a manual workaround for
[cheerio issue 549](https://github.com/cheeriojs/cheerio/issues/549) in the
2014 version. Those historical build notes apply only to the legacy app.

## Validation

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

The browser command builds **both** instances and tests their production output
under `/halland/` and `/depot/`, including mocked proxy responses, partial totals,
retry isolation, preferences, shared links, error states, and mobile layout.
Vega coverage also checks tenant headers, POST bodies, mixed Libris/Vega searches,
safe record URLs, response validation, deadlines, and cancellation.
Koha tests exercise production module workers under a subpath, metadata extraction,
cookie forwarding, redirect URLs, both proof-of-work algorithms, timed challenges,
retry/computation limits, and cancellation. Catalogue scripts and embedded images
in test HTML must never execute or load.
Fixtures in [tests/fixtures](tests/fixtures) are synthetic representative data.
Unit/browser tests do not depend on live catalogue uptime. Browser binaries are
local development dependencies and are not deployed.

Alternatively, use an installed Edge or Chrome without downloading Chromium:
set `PLAYWRIGHT_CHANNEL=msedge` or `PLAYWRIGHT_CHANNEL=chrome` when running the
browser tests. For example, in PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e
```

Before releasing an adapter, also check real queries against its catalogue and
proxy. A successful fixture test cannot guarantee that an external catalogue
still supports the same endpoint or data format.
