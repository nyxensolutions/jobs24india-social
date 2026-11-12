// Facebook Page publishing.
//
// Separate from graph.js because the Page endpoints are a different shape from
// Instagram's: there is no container/poll/publish dance, photos are uploaded
// unpublished and then attached to one feed post in a single call.
//
// Cross-posting from Instagram to the linked Page is deliberately not used. It
// is unreliable, it silently drops the caption on some account types, and when
// it fails there is nothing to retry — so each network is posted explicitly.

const API = "https://graph.facebook.com/v21.0";

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function call(pathQ, init = {}) {
  const res = await fetch(`${API}${pathQ}`, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    const code = body?.error?.code;
    const sub = body?.error?.error_subcode;
    throw new Error(`Graph API ${res.status} [${code}/${sub}] ${msg} — ${pathQ}`);
  }
  return body;
}

/**
 * Resolves the Page access token at runtime from the long-lived user token.
 *
 * The Page token is deliberately not stored as a secret of its own: Page tokens
 * derived from a user token die whenever that token is rotated, so a stored one
 * turns into a silent 190 at 11am some weeks later. Deriving it per run means
 * the only secret to keep fresh is the user token.
 */
async function pageToken() {
  const pageId = need("FB_PAGE_ID");
  const userToken = need("IG_ACCESS_TOKEN");
  const body = await call(
    `/me/accounts?fields=id,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
  );
  const page = (body.data || []).find(p => p.id === pageId);
  if (!page) {
    const ids = (body.data || []).map(p => p.id).join(", ") || "none";
    throw new Error(
      `FB_PAGE_ID ${pageId} is not among the Pages this token manages (${ids}). ` +
      `Check the token's pages_manage_posts permission.`,
    );
  }
  return page.access_token;
}

/** Uploads one photo without publishing it, returning its media id. */
async function uploadUnpublished(pageId, token, imageUrl) {
  const params = new URLSearchParams({
    url: imageUrl,
    published: "false",
    access_token: token,
  });
  const body = await call(`/${pageId}/photos`, { method: "POST", body: params });
  return body.id;
}

/**
 * Posts a multi-photo feed post — the Page equivalent of an Instagram carousel.
 * Facebook renders these as a photo grid rather than a swipeable deck, so slide
 * order matters less here than on Instagram, but it is preserved anyway.
 */
async function postPhotoSet({ imageUrls, caption }) {
  const pageId = need("FB_PAGE_ID");
  const token = await pageToken();

  const mediaIds = [];
  for (const url of imageUrls) {
    mediaIds.push(await uploadUnpublished(pageId, token, url));
  }

  const params = new URLSearchParams({ message: caption || "", access_token: token });
  mediaIds.forEach((id, i) => {
    params.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }));
  });

  const body = await call(`/${pageId}/feed`, { method: "POST", body: params });
  return body.id;
}

module.exports = { postPhotoSet, pageToken };
