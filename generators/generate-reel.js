#!/usr/bin/env node
// Turns one Hindi blog post into a ~10 second 1080×1920 reel.
//
//   node generators/generate-reel.js                  # next in rotation
//   node generators/generate-reel.js <slug>
//
// Three scenes, each a still frame rendered by card.html at 9:16, joined with
// a slow push-in and a crossfade so the result moves without anything being
// animated frame by frame:
//
//   0.0–3.6s  the claim        (navy)
//   3.6–7.2s  the figure       (white)
//   7.2–10.0s the end card     (navy, logo + URL)
//
// Audio is a licence-clear bed from assets/audio/, burned into the file. The
// Instagram API cannot attach a track from Instagram's own library — that
// exists only in the app — so the music has to be in the MP4 or there is no
// music at all.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const CARD = path.join(__dirname, "card.html");
const AUDIO_DIR = path.join(ROOT, "assets", "audio");

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

/** Seconds per scene. The last is shorter: nobody watches a logo for long. */
const SCENES = [3.6, 3.6, 2.8];
const FADE = 0.5;

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchOnePager(slug) {
  const base = process.env.SITE_URL || "https://www.jobs24india.com";
  const url = new URL("/api/social/blog", base);
  url.searchParams.set("format", "onepager");
  if (slug) url.searchParams.set("slug", slug);
  else {
    const posted = loadPostedSlugs("reel");
    if (posted.length) url.searchParams.set("exclude", posted.join(","));
  }
  const res = await fetch(url, { headers: { "x-social-secret": need("SOCIAL_FEED_TOKEN") } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`/api/social/blog ${res.status}: ${body.error || JSON.stringify(body)}`);
  return body;
}

function loadPostedSlugs(format) {
  const p = path.join(ROOT, "state", "posted.json");
  if (!fs.existsSync(p)) return [];
  try {
    const rows = JSON.parse(fs.readFileSync(p, "utf8")).filter(r => r.slug);
    return [...new Set(rows.filter(r => r.format === format).map(r => r.slug))];
  } catch {
    return [];
  }
}

/**
 * Picks the music bed.
 *
 * Fails loudly rather than producing a silent reel: a reel with no audio is
 * not a quieter reel, it is one Instagram shows with a dead soundtrack icon
 * and almost nobody finishes. Rotates by day so consecutive posts do not all
 * carry the same track.
 */
function pickAudio() {
  if (!fs.existsSync(AUDIO_DIR)) {
    throw new Error(
      `No assets/audio/ directory. Add at least one licence-clear instrumental ` +
      `(CC0 or Pixabay, 15s or longer, no vocals) before generating reels.`,
    );
  }
  const beds = fs.readdirSync(AUDIO_DIR)
    .filter(f => /\.(mp3|m4a|wav)$/i.test(f))
    .sort();
  if (!beds.length) {
    throw new Error(`assets/audio/ has no .mp3/.m4a/.wav file to use as a bed.`);
  }

  /**
   * Random, but never the same bed twice running.
   *
   * Pure random repeats more often than people expect — with five beds there
   * is a one-in-five chance of two identical weeks in a row, and the one thing
   * a viewer notices across posts is the music. The last bed used is in
   * posted.json, so it is simply excluded from the draw.
   */
  const last = lastBedUsed();
  const pool = beds.length > 1 ? beds.filter(b => b !== last) : beds;
  return path.join(AUDIO_DIR, pool[Math.floor(Math.random() * pool.length)]);
}

function lastBedUsed() {
  const p = path.join(ROOT, "state", "posted.json");
  if (!fs.existsSync(p)) return null;
  try {
    const rows = JSON.parse(fs.readFileSync(p, "utf8")).filter(r => r.audio);
    return rows.length ? rows[rows.length - 1].audio : null;
  } catch {
    return null;
  }
}

/** Renders one 1080×1920 still through card.html. */
async function renderScene(browser, slide, file) {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(
    ({ slide }) => {
      document.addEventListener("DOMContentLoaded", () => document.body.classList.add("reel"));
      window.__SLIDE__ = { slide, meta: { index: 1, total: 1, tag: slide.tag || "" } };
    },
    { slide },
  );
  await page.goto("file://" + CARD.replace(/\\/g, "/"), { waitUntil: "load" });
  await page.evaluate(() => {
    document.body.classList.add("reel");
    return document.fonts.ready;
  });
  await page.locator(".card").screenshot({ path: file });
  await page.close();
}

/**
 * Builds the MP4.
 *
 * Each still gets a slow zoompan push rather than sitting dead on screen, the
 * scenes crossfade into one another, and the bed is trimmed to the total and
 * faded at both ends. yuv420p and +faststart because without them the file
 * plays on a desktop and fails on half of Instagram's decoders.
 */
function assemble(frames, audio, out) {
  const total = SCENES.reduce((a, b) => a + b, 0);

  const inputs = [];
  for (const [i, f] of frames.entries()) {
    inputs.push("-loop", "1", "-t", String(SCENES[i]), "-i", f);
  }
  inputs.push("-i", audio);

  const filters = [];
  for (let i = 0; i < frames.length; i++) {
    const d = Math.round(SCENES[i] * FPS);
    // zoompan works on its own frame counter; z grows 1.00 → ~1.06 across the
    // scene. s= must be set or it defaults to hd720 and the output is soft.
    filters.push(
      `[${i}:v]scale=${WIDTH}:${HEIGHT},zoompan=z='min(zoom+0.0006,1.06)':d=${d}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS},` +
      `setsar=1[v${i}]`,
    );
  }

  // Chain the crossfades: v0 x v1 -> x1, x1 x v2 -> x2, …
  let last = "v0";
  let offset = 0;
  for (let i = 1; i < frames.length; i++) {
    offset += SCENES[i - 1] - FADE;
    const label = `x${i}`;
    filters.push(
      `[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[${label}]`,
    );
    last = label;
  }

  // Each crossfade overlaps by FADE, so the real duration is shorter than the
  // sum of the scenes. The audio has to match that, not the sum.
  const duration = total - FADE * (frames.length - 1);
  filters.push(
    `[${frames.length}:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=0.4,afade=t=out:st=${(duration - 0.8).toFixed(3)}:d=0.8[a]`,
  );

  execFileSync("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", `[${last}]`, "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    "-movflags", "+faststart",
    "-t", duration.toFixed(3),
    out,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  return duration;
}

async function main() {
  const slug = process.argv.slice(2).find(a => !a.startsWith("--"));
  const payload = await fetchOnePager(slug);

  if (!payload.ready) {
    console.log(`[reel] nothing to post — ${payload.skipReason}`);
    process.exit(payload.exhausted ? 77 : 78);
  }

  const { carousel } = payload;
  const one = carousel.slides[0];
  const audio = pickAudio();

  const outDir = path.join(ROOT, "content", `${carousel.slug}-reel`);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const frames = [];
  try {
    // Scene 1: the claim alone, set as a hook — the fact is withheld so there
    // is a reason to still be watching at 3 seconds.
    await renderScene(browser, { kind: "hook", icon: "\u{1F447}", text: one.headline, tag: carousel.tag },
      path.join(outDir, "f1.png"));
    // Scene 2: the figure, on the one-pager's split layout.
    await renderScene(browser, { kind: "onepager", headline: one.headline, text: one.text, tag: carousel.tag },
      path.join(outDir, "f2.png"));
    // Scene 3: the end card.
    await renderScene(browser, { kind: "endcard", text: "मुफ्त में नौकरी खोजें" },
      path.join(outDir, "f3.png"));
    frames.push(path.join(outDir, "f1.png"), path.join(outDir, "f2.png"), path.join(outDir, "f3.png"));
  } finally {
    await browser.close();
  }

  const mp4 = path.join(outDir, "reel.mp4");
  let duration;
  try {
    duration = assemble(frames, audio, mp4);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().split("\n").slice(-12).join("\n") : "";
    throw new Error(`ffmpeg failed:\n${stderr}`);
  }

  // The frames were scaffolding; only the MP4 gets committed and served.
  for (const f of frames) fs.unlinkSync(f);

  const manifest = {
    slug: carousel.slug,
    format: "reel",
    title: carousel.title,
    tag: carousel.tag,
    url: carousel.url,
    audio: path.basename(audio),
    durationSeconds: Number(duration.toFixed(2)),
    files: [path.relative(ROOT, mp4).replace(/\\/g, "/")],
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const kb = Math.round(fs.statSync(mp4).size / 1024);
  console.log(`[reel] ${path.relative(ROOT, mp4)} — ${duration.toFixed(1)}s, ${kb}KB, bed: ${path.basename(audio)}`);
}

main().catch(err => {
  console.error("[reel] ERROR:", err.message);
  process.exit(1);
});
