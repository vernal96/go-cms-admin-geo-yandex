# @go-cms/admin-geo-yandex

Vue editor plugin for Go CMS fields whose semantic editor is
`geo-yandex.coordinates`. The editor stores one scalar coordinate as
`{ "lat": number, "lon": number }`. Fields configured with `options.multiple`
use the admin SDK ordered list editor and store an ordered array of these values.

## Install and register

Install this package alongside `@go-cms/admin`, then register its default
export with the host:

```ts
import { mountAdmin } from '@go-cms/admin/app'
import geoYandexPlugin from '@go-cms/admin-geo-yandex'
import '@go-cms/admin-geo-yandex/style.css'

mountAdmin({ target: '#app', plugins: [geoYandexPlugin] })
```

The host and this package must share the same Vue and admin SDK instances. Both
are peer dependencies and excluded from the package bundle.

## API and map key

The editor calls the same-origin public endpoints:

- `GET /api/geo-yandex/config` returns `{ "js_api_key": "..." }`;
- `GET /api/geo-yandex/suggests?text=...` returns
  `{ "results": [{ "title", "subtitle", "address", "uri" }] }`;
- `GET /api/geo-yandex/geocode?address=...` returns
  `{ "lat": number, "lon": number, "address": string }`.

When the host provides an access token, the editor includes it as a Bearer
header. Calls work without a token because the geolocation API is public.
Configure the browser JavaScript API key with HTTP referer restrictions; it is
retrieved from the server and is necessarily visible to the browser.

Users can search and select an address, resolve an entered address, click the
map to set a point and edit latitude/longitude directly. API and map loading
errors appear inline. The component does not access browser APIs until mounted.

## Development

Requires Node.js 24+ and npm, matching the Go CMS Admin SDK:

```sh
npm install
npm test
npm run typecheck
npm run build
npm pack
```
