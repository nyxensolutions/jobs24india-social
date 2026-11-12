// Thin wrapper over the Instagram Graph API.
// All four publish flows we need:
//   - postImage(url, caption)            -> single feed image
//   - postCarousel([urls], caption)      -> multi-image carousel
//   - postReel(url, caption)             -> video reel
//   - refreshToken()                     -> rotate the 60-day token

const API = "https://graph.facebook.com/v21.0";

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function call(pathQ, init = {}) {
  const url = `${API}${pathQ}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    const code = body?.error?.code;
    const sub  = body?.error?.error_subcode;
    throw new Error(`Graph API ${res.status} [${code}/${sub}] ${msg} — ${pathQ}`);
  }
  return body;
}

async function createImageContainer(igUserId, token, imageUrl, caption, isCarouselItem = false) {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption || "",
    access_token: token,
  });
  if (isCarouselItem) params.set("is_carousel_item", "true");
  const body = await call(`/${igUserId}/media`, { method: "POST", body: params });
  return body.id;
}

async function createCarouselContainer(igUserId, token, childrenIds, caption) {
  const params = new URLSearchParams({
    media_type: "CAROUSEL",
    children: childrenIds.join(","),
    caption: caption || "",
    access_token: token,
  });
  const body = await call(`/${igUserId}/media`, { method: "POST", body: params });
  return body.id;
}

async function createReelContainer(igUserId, token, videoUrl, caption) {
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption: caption || "",
    share_to_feed: "true",
    access_token: token,
  });
  const body = await call(`/${igUserId}/media`, { method: "POST", body: params });
  return body.id;
}

async function waitForReady(containerId, token, { timeoutMs = 5 * 60_000, intervalMs = 5000 } = {}) {
  const started = Date.now();
  while (true) {
    const body = await call(`/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    if (body.status_code === "FINISHED") return;
    if (body.status_code === "ERROR" || body.status_code === "EXPIRED") {
      throw new Error(`Container ${containerId} failed: ${body.status_code} — ${body.status || ""}`);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Container ${containerId} not ready after ${timeoutMs/1000}s (last status: ${body.status_code})`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

async function publish(igUserId, containerId, token) {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: token,
  });
  const body = await call(`/${igUserId}/media_publish`, { method: "POST", body: params });
  return body.id; // permanent media ID
}

// ── high-level helpers ────────────────────────────────────────────
async function postImage({ imageUrl, caption }) {
  const ig = need("IG_USER_ID"); const tok = need("IG_ACCESS_TOKEN");
  const c = await createImageContainer(ig, tok, imageUrl, caption);
  await waitForReady(c, tok);
  return publish(ig, c, tok);
}

async function postCarousel({ imageUrls, caption }) {
  const ig = need("IG_USER_ID"); const tok = need("IG_ACCESS_TOKEN");
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Carousel needs 2–10 images, got ${imageUrls.length}`);
  }
  const children = [];
  for (const url of imageUrls) {
    const id = await createImageContainer(ig, tok, url, "", true);
    await waitForReady(id, tok);
    children.push(id);
  }
  const parent = await createCarouselContainer(ig, tok, children, caption);
  await waitForReady(parent, tok);
  return publish(ig, parent, tok);
}

async function postReel({ videoUrl, caption }) {
  const ig = need("IG_USER_ID"); const tok = need("IG_ACCESS_TOKEN");
  const c = await createReelContainer(ig, tok, videoUrl, caption);
  await waitForReady(c, tok, { timeoutMs: 8 * 60_000 }); // reels take longer
  return publish(ig, c, tok);
}

async function refreshLongLivedToken() {
  const id  = need("IG_APP_ID");
  const sec = need("IG_APP_SECRET");
  const tok = need("IG_ACCESS_TOKEN");
  const url = `${API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${id}&client_secret=${sec}&fb_exchange_token=${encodeURIComponent(tok)}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(body)}`);
  }
  return body; // { access_token, token_type, expires_in }
}

module.exports = { postImage, postCarousel, postReel, refreshLongLivedToken };
