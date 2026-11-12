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
const { postCarousel } = require("./lib/graph");
const { postPhotoSet } = require("./lib/facebook");
const { alreadyPosted, record } = require("./lib/state");
const { istDateString } = require("./lib/dateist");
const captions = require("./lib/captions");

const ROOT = path.resolve(__dirname, "..");
const SLOT = process.argv[2];
const SLUG_ARG = process.argv[3];
const DRY = process.env.DRY_RUN === "1";

const REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || "nyxensolutions";
const REPO_NAME = (process.env.GITHUB_REPOSITORY || "nyxensolutions/jobs24india-social").split("/").pop();
const BRANCH = process.env.GITHUB_REF_NAME || "main";
const RAW = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

const log = msg => console.log(`[${SLOT}] ${msg}`);
const fail = msg => { console.error(`[${SLOT}] ERROR: ${msg}`); process.exit(1); };

if (SLOT !== "blog-carousel") fail(`unknown slot "${SLOT}". Expected "blog-carousel".`);

function generate() {
  const args = SLUG_ARG ? ` ${SLUG_ARG}` : "";
  const res = require("child_process").spawnSync(
    process.execPath,
    ["generators/generate-carousel.js", ...(SLUG_ARG ? [SLUG_ARG] : [])],
    { cwd: ROOT, stdio: "inherit" },
  );
  // 78 is the generator's "nothing to post today" exit — a skipped slot is a
  // normal outcome, not a failure, and must not open an issue.
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
    execSync(`${GIT} pull --rebase origin ${BRANCH}`, { cwd: ROOT, stdio: "inherit" });
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
    .map(d => path.join(contentDir, d, "carousel.json"))
    .filter(p => fs.existsSync(p))
    .map(p => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!manifests.length) fail("generator produced no carousel.json");

  const manifest = JSON.parse(fs.readFileSync(manifests[0].p, "utf8"));
  const slotKey = `${istDateString()}-${SLOT}`;

  if (alreadyPosted(slotKey)) {
    log(`${slotKey} already posted — nothing to do`);
    return;
  }

  await commitContent(`content: ${manifest.slug} carousel (${istDateString()})`);

  const imageUrls = manifest.files.map(f => `${RAW}/${f}`);
  const igCaption = captions.instagram(manifest);
  const fbCaption = captions.facebook(manifest);

  log(`${manifest.files.length} slides — "${manifest.title}"`);
  if (DRY) {
    log("DRY_RUN — skipping both API calls");
    log("instagram caption:\n" + igCaption);
    log("image urls:\n" + imageUrls.join("\n"));
    return;
  }

  const igId = await postCarousel({ imageUrls, caption: igCaption });
  log(`instagram published ${igId}`);

  // Facebook failing must not lose the Instagram post that already succeeded,
  // so it is recorded before the Page call and the error is reported after.
  record({ slotKey, slug: manifest.slug, instagram: igId, network: "instagram" });

  let fbId = null;
  try {
    fbId = await postPhotoSet({ imageUrls, caption: fbCaption });
    log(`facebook published ${fbId}`);
    record({ slotKey: slotKey + "-fb", slug: manifest.slug, facebook: fbId, network: "facebook" });
  } catch (err) {
    console.error(`[${SLOT}] facebook failed after Instagram succeeded: ${err.message}`);
    process.exitCode = 1;
  }

  await commitContent(`state: posted ${manifest.slug}`);
}

main().catch(err => fail(err.message));
