# jobs24india-social

Posts Hindi carousels to Instagram and the Facebook Page, three mornings a week.

It holds no database credentials and writes no copy. Slides come from
`jobs24india.com/api/social/blog`, which extracts them from the Hindi blog
posts — so every rupee figure on a card is a string lifted verbatim from a
table in an article that was already reviewed. The bot renders what it is
handed and nothing else.

## The week

| When (IST) | Slot | What | Language |
|---|---|---|---|
| Mon / Wed / Fri 11:00 | `blog-carousel` | 5 slides from a Hindi blog post | Hindi |
| Tue / Thu 19:00 | `blog-onepager` | 1 split card from a Hindi blog post | Hindi |
| Wed 11:00 | `promo` | Jobs24India itself, for employers | English |
| Sat 11:00 | `promo` | Jobs24India itself, for seekers | Hindi |

Blog slots read from the site. Promos read from `generators/promo-bank.js` in
this repo, so they need no `SOCIAL_FEED_TOKEN` and still post on a day the app
is unreachable.

Carousels and one-pagers keep **separate rotations** over the same articles, so
one translation serves both. Promos **cycle** rather than exhaust —
least-recently-used — because an advert is meant to be seen more than once.

## What it does

```
Mon/Wed/Fri 11:00 IST
  └─ GET /api/social/blog            next untranslated-yet-unposted article
  └─ render 5 × 1080×1350 PNG        Playwright, generators/card.html
  └─ commit them to this repo        the Graph API needs a public image URL
  └─ POST to Instagram               carousel
  └─ POST to the Facebook Page       multi-photo feed post
  └─ record the slug                 state/posted.json, so the rotation moves on
```

A post is skipped — cleanly, no issue opened — when the endpoint has nothing
left to give. That means every translated article has been posted, and the fix
is more Hindi translations in the main repo, not more code here.

## Running it by hand

```bash
npm install
npx playwright install --with-deps chromium

# render only, no posting
SITE_URL=https://www.jobs24india.com \
SOCIAL_FEED_TOKEN=… \
node generators/generate-carousel.js how-to-spot-a-fake-job-offer

# full dry run: renders and commits, makes no API call
DRY_RUN=1 npm run post:blog
```

From GitHub: **Actions → Hindi blog carousel → Run workflow**, which takes an
optional slug and a dry-run checkbox.

## Secrets

Set in Settings → Secrets and variables → Actions.

| Secret | Where it comes from |
|---|---|
| `SOCIAL_FEED_TOKEN` | same value as `SOCIAL_FEED_TOKEN` in the app's Vercel env |
| `IG_USER_ID` | Instagram Business account numeric id |
| `SYSTEM_USER_TOKEN` | Meta system user token — `expires_at: 0`, so it never lapses |
| `FB_PAGE_ID` | the Facebook Page id |

`IG_APP_ID` and `IG_APP_SECRET` are also set on the repo but nothing reads them:
they exist for the 60-day token exchange, which a system user token does not
need. `olympiadready-social` calls this same token `IG_ACCESS_TOKEN`; the name
differs here because this one really is a system user token, and keeping the
same value under two names would mean a rotation silently leaves one stale.

There is deliberately **no** `FB_PAGE_ACCESS_TOKEN`. Page tokens derived from a
user token stop working the moment that token is rotated, and a stored one
turns into a silent failure some weeks later. `poster/lib/facebook.js` derives
it per run from `/me/accounts` instead, so the only secret to keep fresh is the
user token.

## The two things that break quietly

**Devanagari.** Without `fonts-noto-devanagari` on the runner every Hindi glyph
renders as an identical tofu box. It throws no error and the PNG looks
plausible in a file listing. `generate-carousel.js` measures a known Hindi word
against a deliberately bogus font family and refuses to screenshot if the
widths match, but the workflow installing the font is what actually prevents
it. **Look at the first PNG of any run you change the renderer in.**

**Card sizes are in `cqw`, not `px`.** `card.html` was designed and approved in
a browser at 262px wide and renders at 1080px in CI. Any `px` value for type or
spacing will look right in one and wrong in the other.

## Layout

```
generators/
  card.html              one slide, 1080×1350 — the approved design
  generate-carousel.js   fetch → render → PNG, with the font and overflow guards
poster/
  post.js                the entry point the workflow calls
  lib/graph.js           Instagram Graph API (from olympiadready-social)
  lib/facebook.js        Facebook Page publishing
  lib/captions.js        Hindi captions and hashtags
  lib/state.js           posted.json ledger
  lib/dateist.js         IST date helpers
assets/                  logo-light.png (on navy), logo-navy.png (on white)
content/<slug>/          rendered PNGs, committed so raw URLs can serve them
state/posted.json        what has been posted, and when
```

## Not built yet

- **Job carousels.** `/api/social/feed` exists and works, but there are 4
  card-ready jobs today and two of them are the same company. The carousel
  minimum is 4 and a reel needs 5. This turns on when employers sign up, not
  when more code is written.
- **Reels.** Nothing here renders video.
- **Token refresh.** `npm run refresh-token` is declared in package.json but
  `poster/refresh-token.js` is not written; `refreshLongLivedToken()` in
  `lib/graph.js` is the piece it would call.
