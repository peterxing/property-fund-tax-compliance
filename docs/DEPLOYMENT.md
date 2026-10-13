# Deployment

The app is a **static site**: HTML, one JavaScript bundle (plus lazy chunks) and one stylesheet. There is no server, no database and no secrets. All demo data and your edits live in the browser (`localStorage`, key `pfc.state.v1`).

## Production: GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main` (and on demand):

1. **build** (read-only token): `npm ci`, then `npm run typecheck`, `npm test`, `npm run build`. A failing check stops the deploy. `dist/` is uploaded as the Pages artifact.
2. **deploy** (the only job with `pages: write` and `id-token: write`): publishes the artifact to the `github-pages` environment with `actions/deploy-pages`.

Every third-party action is pinned to a full commit SHA (the tag is kept in a comment) and checkout does not persist credentials.

Live URL: <https://peterxing.github.io/property-fund-tax-compliance/>

Why it works from a sub-path with no extra config:

* every asset URL in the build is **relative** (`./assets/...`), so `/<repo>/` and a custom domain both work;
* routing uses the **hash** (`#/trial-balance?fund=southbank`), so a refresh or a deep link never needs a server rewrite or a `404.html`;
* `dist/.nojekyll` is written so Pages serves the hashed asset folders untouched;
* `index.html` carries a strict Content-Security-Policy `<meta>` (scripts, styles, fonts and images from the same origin only, no network connections, no frames, no objects) and `no-referrer`. A static host cannot send headers, so the meta tag is the policy. If you add a feature that needs another origin or inline code, relax it in `scripts/build.mjs`.

One-time repository setup (already done for this repo): **Settings, Pages, Build and deployment, Source: GitHub Actions**. GitHub Pages on the Free plan needs a public repository.

### Rollback

Revert the bad commit on `main` (or re-run the workflow on a known-good commit from the Actions tab: *Deploy to GitHub Pages, Run workflow*). The previous artifact is replaced atomically.

### Custom domain

Add a `public/CNAME` file containing the domain, set the same domain under **Settings, Pages**, and point DNS at GitHub Pages. Nothing in the app depends on the host name.

## Local

```powershell
npm ci
npm run build      # writes dist/
npm run preview    # serves dist/ at http://127.0.0.1:4173 (static files only, like Pages)
npm run dev        # rebuilds on change; serve dist/ with npm run preview in a second terminal
```

`PFC_OUT=<folder>` changes the build/preview folder; `PORT=<n>` changes the preview port.

## CI

`.github/workflows/ci.yml` runs typecheck, tests and build on pull requests and on pushes to any branch other than `main`.

## What replaced what

Before October 2026 the demo was served from a laptop through a Microsoft Dev Tunnel, which was offline whenever the laptop was asleep, off, or at the sign-in screen. The static build removes that dependency: the site is up whenever GitHub Pages is up.

## Data and privacy

* No network requests are made by the app after the page loads (fonts are bundled, nothing is fetched from third-party hosts).
* Edits are stored only in the visitor's browser and are not shared between people or devices. **Access, Reset demo data** restores the original data.
* `localStorage` is scoped to the site's origin (`peterxing.github.io` for every project page under that account). The stored value is namespaced (`pfc.state.v1`), but treat the demo as public: **do not enter real client or investor data.**
* The funds, holders, trial balances and people in the demo are fictional.
