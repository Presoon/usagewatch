# Landing page

The public page (<https://usagewatch.seev.pro>) is plain HTML and CSS in `web/`,
served by Caddy. There is no build step, no JavaScript bundle and no analytics.

## Preview and check

```sh
python -m http.server 4173 --directory web   # open http://localhost:4173
node scripts/check-site.mjs                   # structure/asset checks (also run in CI)
```

To test the production container (including security headers):

```sh
docker build -t usagewatch-site:test web
docker run --rm -p 127.0.0.1:6723:80 usagewatch-site:test   # open http://localhost:6723
```

## Screenshots

The screenshots in `web/assets/` are rendered from the real `App` and
`WidgetStrip` components with demo fixtures, never from a real account. To
refresh them with [Playwright CLI](https://github.com/microsoft/playwright-cli),
start `npm run dev:mock`, then:

```sh
playwright-cli -s=uw-capture open http://127.0.0.1:1420 --browser chrome
playwright-cli -s=uw-capture run-code --filename=scripts/capture-site.cjs
playwright-cli -s=uw-capture run-code --filename=scripts/preview-site.cjs   # responsive checks
```

Review every screenshot before committing.

## Deployment

`.github/workflows/website.yml` checks the page and the container on pull
requests. Pushes to `main` that touch `web/` or `deploy/` publish the image to
GHCR and deploy it with `deploy/deploy.sh` on the maintainer's self-hosted
runner (with automatic rollback). Contributors do not need to do anything for
deployment.
