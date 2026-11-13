#!/usr/bin/env node
// Single entry point, called by the workflow with a slot name:
//
//   node poster/post.js blog-carousel
//   node poster/post.js blog-carousel <slug>     # force one post
//
// Sequence:
//   1. Generate the five PNGs (skips cleanly if the endpoint has nothing).
//   2. Commit them, so raw.githubusercontent.com can serve them — the Graph
//      API fetches images by public URL and will not accept an upload.
//   3. Post to Instagram, then to the Facebook Page.
//   4. Record the slug in state/posted.json so the rotation moves on.
//
// DRY_RUN=1 generates and commits but makes no API call.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { postCarousel, postImage, postReel } = require("./lib/graph");
const { postPhotoSet, postVideo } = require("./lib/facebook");
const { alreadyPosted, record } = require("./lib/state");
const { istDateString } = require("./lib/dateist");
const captions = require("./lib/captions");

const ROOT = path.resolve(__dirname, "..");
const SLOT = process.argv[2];
const SLUG_ARG = process.argv[3];
const DRY = process.env.DRY_RUN === "1";

/** The slot decides the shape; everything downstream reads this. */
const FORMAT =
  SLOT === "blog-onepager" ? "onepager" :
  SLOT === "promo" ? "promo" :
  SLOT === "reel" ? "reel" : "carousel";

/**
 * Promos only. Which audience this run speaks to, and so which language it
 * speaks — the two never share a post. An employer reading seeker copy learns
 * nothing about posting a vacancy.
 */
const AUDIENCE = process.env.PROMO_AUDIENCE || "employer";

const REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || "nyxensolutions";
const REPO_NAME = (process.env.GITHUB_REPOSITORY || "nyxensolutions/jobs24india-social").split("/").pop();
const BRANCH = process.env.GITHUB_REF_NAME || "main";
const RAW = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

const log = msg => console.log(`[${SLOT}] ${msg}`);
const fail = msg => { console.error(`[${SLOT}] ERROR: ${msg}`); process.exit(1); };

if (!["blog-carousel", "blog-onepager", "promo", "reel"].includes(SLOT)) {
  fail(`unknown slot "${SLOT}". Expected "blog-carousel", "blog-onepager", "promo" or "reel".`);
}

/** Hands a flag back to the workflow, which decides whether to raise an issue. */
function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

function generate() {
  const res = require("child_process").spawnSync(
    process.execPath,
    [
      // Reels need ffmpeg and a music bed, so they have their own generator
      // rather than another branch inside the still-image one.
      FORMAT === "reel" ? "generators/generate-reel.js" : "generators/generate-carousel.js",
      ...(FORMAT === "reel" ? [] : ["--format", FORMAT]),
      ...(FORMAT === "promo" ? ["--audience", AUDIENCE] : []),
      // A promo is chosen from the bank by rotation, so a slug means nothing
      // to it; passing one through would be silently ignored.
      ...(SLUG_ARG && FORMAT !== "promo" ? [SLUG_ARG] : []),
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  // 77: the rotation is out of material. Every future run will say the same
  // thing, so the workflow raises an issue — otherwise the account goes quiet
  // and looks exactly like one that is working.
  if (res.status === 77) {
    log(`${FORMAT} rotation is exhausted — flagging for an issue`);
    setOutput("exhausted", "true");
    setOutput("format", FORMAT);
    process.exit(0);
  }
  // 78: nothing today, but there will be something tomorrow. Normal.
  if (res.status === 78) {
    log("nothing to post today — exiting clean");
    process.exit(0);
  }
  if (res.status !== 0) fail(`generator failed (exit ${res.status})`);
}

function commitContent(message) {
  try {
    execSync("git add content/ state/", { cwd: ROOT, stdio: "ignore" });
    const changed = execSync("git diff --cached --name-only", { cwd: ROOT }).toString().trim();
    if (!changed) { log("no new content to commit"); return Promise.resolve(); }
    const GIT = `git -c user.name="social-bot" -c user.email="nyxencloud@gmail.com"`;
    execSync(`${GIT} commit -m "${message}"`, { cwd: ROOT, stdio: "inherit" });
    // --autostash because only content/ and state/ were staged above: any other
    // dirty file in the tree aborts the rebase and fails the run *after* the
    // commit is already made. CI always checks out clean, but a local dry run
    // with edits in progress hit exactly that.
    execSync(`${GIT} pull --rebase --autostash origin ${BRANCH}`, { cwd: ROOT, stdio: "inherit" });
    execSync(`git push origin HEAD:${BRANCH}`, { cwd: ROOT, stdio: "inherit" });
    log("pushed content — waiting 15s for raw URLs to propagate");
    return new Promise(r => setTimeout(r, 15_000));
  } catch (err) {
    fail(`could not commit content: ${err.message}`);
  }
}

async function main() {
  generate();

  // The generator wrote exactly one manifest; find the newest.
  const contentDir = path.join(ROOT, "content");
  const manifests = fs.readdirSync(contentDir)
    // carousel.json is the pre-one-pager name; runs already in the repo still
    // use it, so both are accepted rather than orphaning that history.
    .flatMap(d => ["manifest.json", "carousel.json"].map(n => path.join(contentDir, d, n)))
    .filter(p => fs.existsSync(p))
    .map(p => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!manifests.length) fail("generator produced no manifest.json");

  const manifest = JSON.parse(fs.readFileSync(manifests[0].p, "utf8"));
  const slotKey = `${istDateString()}-${SLOT}`;

  if (alreadyPosted(slotKey)) {
    log(`${slotKey} already posted — nothing to do`);
    return;
  }

  await commitContent(`content: ${manifest.slug} ${FORMAT} (${istDateString()})`);

  const imageUrls = manifest.files.map(f => `${RAW}/${f}`);
  // A promo's caption is written for its audience, not derived from a blog
  // post, so it comes from a different builder entirely.
  const igCaption = FORMAT === "promo"
    ? captions.promoInstagram(manifest)
    : captions.instagram(manifest);
  const fbCaption = FORMAT === "promo"
    ? captions.promoFacebook(manifest)
    : captions.facebook(manifest);

  log(`${manifest.files.length} slides — "${manifest.title}"`);
  if (DRY) {
    log("DRY_RUN — skipping both API calls");
    log("instagram caption:\n" + igCaption);
    log("image urls:\n" + imageUrls.join("\n"));
    return;
  }

  // Three shapes, three calls. A reel is a video container that Instagram
  // transcodes before it will publish, so it polls for longer than a photo;
  // a one-pager is a single image, and the carousel endpoint rejects fewer
  // than two children.
  const igId = FORMAT === "reel"
    ? await postReel({ videoUrl: imageUrls[0], caption: igCaption })
    : imageUrls.length === 1
      ? await postImage({ imageUrl: imageUrls[0], caption: igCaption })
      : await postCarousel({ imageUrls, caption: igCaption });
  log(`instagram published ${igId}`);

  // Facebook failing must not lose the Instagram post that already succeeded,
  // so it is recorded before the Page call and the error is reported after.
  record({ slotKey, slug: manifest.slug, format: FORMAT, instagram: igId, network: "instagram" });

  let fbId = null;
  try {
    fbId = FORMAT === "reel"
      ? await postVideo({ videoUrl: imageUrls[0], caption: fbCaption })
      : await postPhotoSet({ imageUrls, caption: fbCaption });
    log(`facebook published ${fbId}`);
    record({ slotKey: slotKey + "-fb", slug: manifest.slug, format: FORMAT, facebook: fbId, network: "facebook" });
  } catch (err) {
    console.error(`[${SLOT}] facebook failed after Instagram succeeded: ${err.message}`);
    process.exitCode = 1;
  }

  await commitContent(`state: posted ${manifest.slug}`);
}

main().catch(err => fail(err.message));
