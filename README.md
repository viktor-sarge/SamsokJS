# SamsokJS

Browser-only federated library catalogue search. The new React application is
being developed alongside the original Ember application. Both use the existing
external proxy where cross-origin catalogue requests require it. Neither needs
an application backend.

## Migration status

The migration provides React, TypeScript, Vite, validated instance
configuration, two example skins, and Libris Xsearch, Vega, Koha, Arena,
Stockholm GraphQL, and Mina bibliotek SSE adapters. It includes
search progress, per-source errors and retries, partial totals, author-first sorting,
local filtering, catalogue/Libris links, saved source selection, and shareable
search URLs.

A compact “Till toppen” button appears in the bottom-right corner after scrolling
past one viewport height. It returns to the top and focuses the search field
without changing the search URL or catalogue selection. Scrolling is animated
unless the visitor prefers reduced motion.

Search coverage is shown separately from search completion. Each successful
catalogue has a compact inline count: `15 träffar` when fully retrieved,
`Visar 10% (10 träffar av totalt 100)` with a subtle yellow background when
partially retrieved, or `15 träffar (totalt antal okänt)` when no total is
available. Rows wrap naturally on narrow screens. Partial percentages
are truncated to one decimal place so they never round up to 100%; fractions
below 0.1% are labelled as less than 0.1%. Zero matches with a known zero total
count as fully retrieved. The overall coverage summary also lists pending and
failed catalogues and only reports full coverage when every selected catalogue
has returned all its reported matches. Counts use retrieved records before
grouping and filtering; no combined percentage is calculated across catalogues.
Catalogue links remain available for the full results or to check unknown totals.

Results are nested by **author → title → format → publication year**, with
separate links to each library's record at the year level. Authors, titles, and
formats are sorted alphabetically using Swedish ordering, with years in ascending
order within each format. Title variations have their own entries under the author;
different formats have their own groups under the title; different years have
their own library links under the format. Matching ignores capitalization,
extra whitespace, and Unicode composition, but not punctuation, word order, or
format translations. All four fields must be present; incomplete metadata stays
in isolated author/title/format/year entries. Missing author, year, and format
are explicitly labelled. Different record URLs from the same library are retained,
while identical source/URL links are shown only once.

Grouping applies only to retrieved records, not the catalogues' complete holdings.
Per-source totals and the retrieved-record count remain unchanged; the filter
also shows the number of grouped year entries. Filtering keeps matching year
entries with their author/title/format context. Filtering by a library name keeps
all links on each matching year entry, including its other libraries.

The new Halland instance includes all **37 original catalogue entries** across
**Halland**, **Lånecentralen**, **Andra regioner**, **Västra Götaland**, and
**Övriga**, in their original order. These resolve to **31 named source
selections**. Sources repeated in different groups share one selection and are
searched once. The original **Umeå - Mina bibliotek** and **Mina bibliotek** names
remain separate selections pointing to the same catalogue, as in the legacy app.
The two Libris sources remain selected by default; visitors can enable other sources in
the catalogue panel. Existing saved selections are preserved.
The depot example includes only Depåbiblioteket i Umeå.
Catalogue/group coverage is restored, but these remain preview instances:
legacy service/contact/accessibility content, preference migration, and other
UI/behaviour parity still need review before replacing the existing service.

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

The catalogue panel's **Mina favoriter** section saves named source selections
in local storage, separately for each instance and browser origin. Use
**Spara aktuellt val** to name the current selection (including an empty selection).
Applying a favorite replaces the entire selection, unchecking sources not saved
in it, and updates any ongoing search through the normal selection workflow.
Matching selections are highlighted; clicking one again does not toggle it off.
Names must be unique regardless of case, extra whitespace, or Unicode composition,
and are limited to 80 characters. Each favorite has a delete control that asks
for confirmation before removing it; cancelling leaves it unchanged. Removed
source IDs are ignored when loading; newly added sources are not automatically
included. Favorites store source IDs and names, never search queries or results.
Storage and validation failures are shown explicitly; failed saves or deletions
do not appear to have succeeded.

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

### Arena catalogues

The Halland Arena definitions in [config/sources.json](config/sources.json)
use the catalogue's search-result portlet URL with an `@QUERY@` placeholder:

```json
{
  "name": "Example Arena library",
  "adapter": "arena",
  "searchUrl": "https://catalogue.example.org/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr",
  "catalogueUrl": "https://catalogue.example.org/web/arena/search?p_r_p_arena_urn%3Aarena_search_query=@QUERY@",
  "encoding": "utf-8",
  "queryEncoding": "percent"
}
```

`queryEncoding` is required: `percent` encodes spaces as `%20`; `plus` encodes
them as `+`, as used by Halmstad and Bibliotek Dalsland. Literal plus signs remain `%2B` in both
modes. Preserve any additional portlet parameters needed by the installation.

Arena HTML is fetched through the same trusted proxy and parsed in a module
worker. The adapter supports listing metadata, Swedish feedback/paging totals,
explicit empty-result pages (including `arena-zero-list` panels), detail pages, and literal single-result redirects
including `\xHH`-escaped URLs. Missing records, malformed links, and unrecognized
pages produce source errors, not successful empty searches.

The currently deployed arithmetic `leastFactor` cookie check is handled by
recognizing a restricted numeric grammar and calculating its result locally.
Unlike the legacy preprocessor, the adapter never evaluates upstream JavaScript.
Unsupported challenge formats fail explicitly. The final factorization input is
limited to 4,000,000,000,000 (trial divisors up to 2,000,000); HTML is limited to
2,000,000 characters, and the workflow allows at most six proxy requests within
the instance's total `proxy.timeoutMs` deadline. Cancellation terminates the worker.
Redirects and record links must stay on the catalogue origin. Opaque proxy cookies
are carried across redirects; calculated challenge cookies are sent only for the
current search and never persisted in browser storage.

Zero-hit panels can defer alternative suggestions to an upstream script.
Those suggestions are not fetched or executed; the original query has no hits.
When Arena explicitly reports no matches for the original query but includes
records and totals for alternative spellings (as Halmstad does), Samsök reports
zero exact matches and does not include those alternative records. Visitors can
follow the catalogue link to explore its spelling suggestions.

### Stockholm GraphQL

```json
{
  "name": "Stockholms stadsbibliotek",
  "adapter": "stockholm",
  "apiUrl": "https://biblioteket.stockholm.se/graphql/",
  "catalogueUrl": "https://biblioteket.stockholm.se/sok?text=@QUERY@",
  "pageSize": 40
}
```

The existing proxy must support `method=POST`, `contentType=application/json`,
JSON `postData`, and JSON `headers` parameters. The adapter sends a
`searchWithFilter` GraphQL request with the query in variables, never interpolated
into GraphQL syntax. It supplies the catalogue Origin/Referer through the proxy.
No initial catalogue HTML fetch or embedded application script is needed.

`pageSize` (1–40) controls `rows` **per format group**, not a global hit cap.
All returned format groups are flattened, including responses with empty/null
media lists. Titles and record keys are required, optional metadata is normalized,
and record links use `/titel/<encoded-key>`. GraphQL errors, even alongside partial
data, inconsistent totals, invalid JSON, and incomplete records produce source errors.

### Mina bibliotek SSE

```json
{
  "name": "Mina bibliotek",
  "adapter": "mina-bibliotek",
  "searchUrl": "https://minabibliotek.se/federated-search/customers/umea/search?sourceId=catalogue&source=catalogue&size=40&facetSize=0&start=0&fuzzy=true&sort=score+desc&q=@QUERY@",
  "catalogueUrl": "https://minabibliotek.se/search#/?q=@QUERY@&fuzzy=true&source=catalogue",
  "encoding": "utf-8"
}
```

The proxy returns the completed server-sent-event stream as text, not a live
browser EventSource connection. The adapter requires exactly one `search` event,
supports LF/CRLF and multiline `data:` fields, and validates its JSON.
An explicit zero total may omit `hits`; missing search events, malformed data,
positive totals without records, and responses over 2,000,000 characters are
errors. Authors use `creator.author` or `creator.creator`, publication year uses
the first value, and record links use an encoded ID under `/search#/entity/catalogue/`.
No cookies, API credentials, or extra browser storage are required.

### Cheerio dependency and workers

Cheerio is pinned to version 1.2.0 and imported through `cheerio/slim` in module
workers for Koha and Arena. This uses htmlparser2 without parse5 or Node's HTTP client in the browser
bundle. The npm package still installs its wider dependency tree for development;
the slim import does not eliminate those installed dependencies.
Use the lockfile with `npm ci`, review dependency updates, and run `npm audit`
against the registry you trust. An audit reports known advisories, not a
guarantee of safety. The package currently emits a transitive
`whatwg-encoding` deprecation warning during installation.

Each worker asset is fetched when its adapter needs it, not when the app opens.
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
All proxied adapters request UTF-8 content and expect JSONP wrapping an object
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
JSONP. All protocols used by the configured legacy catalogues now have adapters.
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

## Reporting catalogue problems

When a source fails, expand **Felsökningsrapport: [library]** beneath its error.
The librarian can inspect the report and choose **Kopiera rapport** or
**Ladda ner rapport**, then send it through the organisation's normal support
channel. If clipboard access is blocked (for example on a non-secure origin),
download the JSON file or select and copy the report text manually. Export errors
are shown explicitly. Download confirmation means the browser was asked to save
the file, not that the app can verify where it was saved.

Search queries are **omitted by default**. Check **Ta med sökfrågan i rapporten**
only if needed to reproduce the problem and safe to share. Review the preview
before sending. Retrying or starting a new failure resets this consent.
Librarians should also describe what they were trying to do and whether retrying
or opening the catalogue directly worked.

The versioned JSON report includes:

- App version, build timestamp, instance ID, and deployment origin/path.
- Browser user agent, language, and browser-reported online/offline state
  (not a connectivity test).
- Source ID/name/adapter, configured endpoint origins/paths and parameter
  **names**, tenant/page-size/encoding settings where relevant, and proxy deadline.
- Failure message, UTC start/end timestamps, elapsed milliseconds, and retry
  attempt number for that source in the current search run.
- Ordered request/parser/worker/challenge stages, HTTP methods, offsets/durations, outcomes,
  HTTP status when available, response character counts for proxy responses,
  recognized page kinds, and supported challenge algorithm names.

Reports never capture catalogue response bodies, result titles, raw request URLs,
POST bodies/headers, cookies, challenge IDs/proofs, error stacks, or browser storage.
Page query strings/fragments and configured URL parameter values are excluded;
error-message URLs and the current search query are redacted. Explicit query opt-in
adds only a separate `query` field, not raw network payloads. Treat the remaining
deployment/browser details as support information and share only with trusted staff.

No analytics, uploads, new backend, or persistent diagnostic storage is used.
Diagnostics are bounded to 40 events per attempt and retained only with the
current failed source state. Retrying replaces the old failure; save a report
first if needed. Cancelled/obsolete searches are not reported as failures.
HTTP and proxy/network errors are distinguished from parser/worker errors, but
browser CORS/network failures cannot reliably reveal the upstream HTTP status.
The build timestamp identifies the deployed build even while the package version
has not changed. Developers should request the JSON report and reproduce using
the reported adapter/configuration, not ask librarians to share cookies or raw pages.

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
Arena tests cover arithmetic challenge branches, URL encoding, paging totals,
single-result redirects, cookie continuity, request limits, cancellation, and
the original Halland group order.
Stockholm/Mina bibliotek tests cover proxy POST variables and headers, format
groups, SSE framing, empty-result variants, partial errors, links, cancellation,
and retry isolation. Configuration tests compare every original group and name
against the legacy definitions; browser tests verify shared-group controls stay
in sync and do not duplicate requests.
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
