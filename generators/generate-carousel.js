#!/usr/bin/env node
// Renders one Hindi blog carousel to five 1080×1350 PNGs.
//
//   node generators/generate-carousel.js                 # next post in rotation
//   node generators/generate-carousel.js <slug>          # a specific post
//
// Slides come from jobs24india.com/api/social/blog — the bot holds no database
// credentials and writes no copy. Every rupee figure on a card is a string the
// endpoint lifted verbatim from a table in the article.
//
// Output: content/<slug>/01.png … 05.png, plus carousel.json for the poster.

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const CARD = path.join(__dirname, "card.html");

const WIDTH = 1080;
const HEIGHT = 1350;

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchCarousel(slug) {
  const base = process.env.SITE_URL || "https://www.jobs24india.com";
  const url = new URL("/api/social/blog", base);
  if (slug) url.searchParams.set("slug", slug);
  else {
    // The rotation's memory lives in state/posted.json, not on the server.
    const posted = loadPostedSlugs();
    if (posted.length) url.searchParams.set("exclude", posted.join(","));
  }

  const res = await fetch(url, { headers: { "x-social-secret": need("SOCIAL_FEED_TOKEN") } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`/api/social/blog ${res.status}: ${body.error || JSON.stringify(body)}`);
  }
  return body;
}

function loadPostedSlugs() {
  const p = path.join(ROOT, "state", "posted.json");
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
      .filter(r => r.slug)
      .map(r => r.slug);
  } catch {
    return [];
  }
}

/**
 * Devanagari that falls back to a font without those glyphs renders as a row of
 * identical tofu boxes. It throws no error, the PNG looks plausible at a glance
 * in a file listing, and a month of unreadable cards is a real way to lose the
 * account. So measure a known Hindi word against a deliberately bogus family:
 * if the widths match, the real font never loaded.
 */
async function assertDevanagari(page) {
  const ok = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;font-size:100px;white-space:nowrap";
    probe.textContent = "नौकरी";
    document.body.append(probe);

    probe.style.fontFamily = "__definitely_not_a_font__";
    const fallback = probe.getBoundingClientRect().width;
    probe.style.fontFamily = '"Noto Sans Devanagari", sans-serif';
    const actual = probe.getBoundingClientRect().width;

    probe.remove();
    return { fallback, actual, differs: Math.abs(actual - fallback) > 1 };
  });
  if (!ok.differs) {
    throw new Error(
      `Noto Sans Devanagari did not load — Hindi would render as tofu boxes. ` +
      `(probe width ${ok.actual}px matched the fallback ${ok.fallback}px). ` +
      `Install fonts-noto-devanagari on the runner.`
    );
  }
}

/**
 * Catches text that overflowed rather than wrapping.
 *
 * Measured on `.card-body`, not on `.card`. The decorative rings are deliberately
 * positioned past the card's edge and clipped by `overflow: hidden`, but a
 * clipped child still counts toward the parent's scrollWidth — so measuring the
 * card reports a 1404×1674 "overflow" on every slide, including empty ones.
 */
async function assertNoOverflow(page, label) {
  const box = await page.evaluate(() => {
    const body = document.querySelector(".card-body");
    const card = document.querySelector(".card");
    const bodyRect = body.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      scrollH: body.scrollHeight,
      clientH: body.clientHeight,
      // Does the text box sit inside the card's own bounds?
      spillTop: cardRect.top - bodyRect.top,
      spillBottom: bodyRect.bottom - cardRect.bottom,
    };
  });
  if (box.scrollH > box.clientH + 2 || box.spillTop > 2 || box.spillBottom > 2) {
    throw new Error(
      `${label}: text overflows its box ` +
      `(content ${box.scrollH}px in ${box.clientH}px; ` +
      `spill top ${Math.round(box.spillTop)}px, bottom ${Math.round(box.spillBottom)}px). ` +
      `The slide text is too long for the layout.`
    );
  }
}

async function main() {
  const slugArg = process.argv[2];
  const payload = await fetchCarousel(slugArg);

  if (!payload.ready) {
    // A skipped slot is a signal, not an error: say why and exit clean so the
    // workflow does not open an issue for "there was nothing to post".
    console.log(`[generate] nothing to post — ${payload.skipReason}`);
    process.exit(78); // EX_TEMPFAIL-ish; the workflow treats this as "skip"
  }

  const { carousel } = payload;
  const outDir = path.join(ROOT, "content", carousel.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const files = [];

  try {
    for (const [i, slide] of carousel.slides.entries()) {
      const page = await browser.newPage({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 1,
      });

      await page.addInitScript(
        ({ slide, meta }) => { window.__SLIDE__ = { slide, meta }; },
        { slide, meta: { index: i + 1, total: carousel.slides.length, tag: carousel.tag } },
      );

      await page.goto("file://" + CARD.replace(/\\/g, "/"), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await assertDevanagari(page);
      await assertNoOverflow(page, `slide ${i + 1}`);

      const file = path.join(outDir, String(i + 1).padStart(2, "0") + ".png");
      await page.locator(".card").screenshot({ path: file });
      await page.close();

      files.push(path.relative(ROOT, file).replace(/\\/g, "/"));
      console.log(`[generate] ${path.relative(ROOT, file)}`);
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    slug: carousel.slug,
    title: carousel.title,
    tag: carousel.tag,
    url: carousel.url,
    files,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, "carousel.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[generate] ${files.length} slides for "${carousel.title}"`);
}

main().catch(err => {
  console.error("[generate] ERROR:", err.message);
  process.exit(1);
});
