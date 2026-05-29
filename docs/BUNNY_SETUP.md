# VITAS · Bunny Stream — Setup Guide

Bunny Stream is the video CDN / hosting service used for ALL video
features in VITAS:

- Set Piece video upload + analysis
- Highlights reel playback
- Scanning video analysis
- Coach Dashboard session videos
- PlayerHub video review
- VITAS Lab analysis pipeline

When configured, uploaded videos go to Bunny which:
- Stores the original + multiple transcoded versions (HD, mobile)
- Provides adaptive HLS streaming (auto picks quality for the user's connection)
- Generates thumbnails automatically
- Gives Modal a public HTTPS URL to read the video for AI analysis

When NOT configured, the app falls back to local `blob:` URLs. Modal
cannot read these so AI features fall back to mocks. **Everything still
works**, just without the real backend pipeline.

---

## Setup in 10 minutes

### 1. Create a Bunny account

Go to **https://bunny.net/** and sign up. The Stream product needs a
$1 minimum top-up. Add a card or use PayPal.

### 2. Create a Video Library

In Bunny dashboard → **Stream** → **Add Video Library**

- Name: `vitas-videos` (or whatever)
- Replication regions: pick the closest to your users (Europe for Spain)
- Click Create

Bunny will give you:
- **Library ID** (numeric, e.g. `123456`)
- **CDN Hostname** (e.g. `vz-abc123-def.b-cdn.net`)
- **API Key** (long string, hidden in settings)

### 3. Find your API Key

In the Library settings → **API** tab → copy the **API Key**.

### 4. Configure Vercel

On your Vercel project → **Settings** → **Environment Variables**:

```
BUNNY_STREAM_LIBRARY_ID = 123456            (your numeric library id)
BUNNY_STREAM_API_KEY     = abc-def-ghi-...   (the API key from step 3)
BUNNY_CDN_HOSTNAME       = vz-abc123-def.b-cdn.net
```

Apply to **Production, Preview, Development**.

### 5. Redeploy

Either push a new commit or hit **Deployments → Redeploy** in Vercel.

### 6. Verify

After redeploy, open `https://futuro-club.vercel.app/set-pieces`.
Click **Subir video** → choose a small MP4 from your device.

If Bunny is working:
- Progress bar shows `Subiendo · X%` then `Bunny procesando · X%`
- Toast: *"Video subido a Bunny correctamente"*
- Console: no `BunnyNotConfiguredError`

If Bunny isn't working:
- Progress bar runs a fake 1.2s simulation
- Toast: *"Video guardado localmente (Bunny no configurado)"*
- Console: `[VideoUploadDialog] Bunny disabled, using blob: fallback`

---

## How videos are stored

Every uploaded video creates a record in `VideoService` (localStorage)
with these fields:

```typescript
{
  id: "video_1730_abc",
  title: "vs Rival FC · 24 May",
  streamUrl: "https://vz-abc123-def.b-cdn.net/<guid>/play_720p.mp4",
  embedUrl: "https://iframe.mediadelivery.net/embed/123456/<guid>",
  localPath: "https://vz-abc123-def.b-cdn.net/<guid>/playlist.m3u8",
  thumbnailUrl: "https://vz-abc123-def.b-cdn.net/<guid>/thumbnail.jpg",
  // ...other fields
}
```

- `streamUrl` (MP4) → used by `<video>` elements and Modal
- `embedUrl` (iframe) → drop into `<iframe>` for the full Bunny player
- `localPath` (HLS) → adaptive streaming for browsers that support HLS
- `thumbnailUrl` → preview/cover image

---

## Cost reference (Bunny Stream pricing)

| Item | Cost |
|---|---|
| Storage | $0.005/GB/month |
| Bandwidth (EU/US) | $0.005-0.01/GB |
| Bandwidth (Asia/Other) | $0.02-0.04/GB |
| Encoding | Included |
| Minimum | $1/month |

**Real estimate for VITAS:**

| Volume | Cost/month |
|---|---|
| 10 partidos/month (~50 GB) | ~$1.50 |
| 100 partidos/month (~500 GB) | ~$10 |
| 500 partidos/month (~2.5 TB) | ~$40 |

---

## Troubleshooting

### "BunnyNotConfiguredError" in console
**Cause:** env vars not set or not applied to current environment.
**Fix:** Check Vercel env vars are set for the right environment.
Redeploy after changing.

### Upload fails with 401
**Cause:** API Key incorrect or library wrong.
**Fix:** Re-copy the API key from Bunny dashboard. It's specific per
library.

### Upload completes but encoding never finishes
**Cause:** Bunny is slow for free tier or video has unusual codec.
**Fix:** Check Bunny dashboard → Library → check that specific video.
Encoding usually takes 1-5 min.

### Modal can't reach the video URL
**Cause:** Library not public, or hostname wrong.
**Fix:** In Bunny Library settings, check "Public" is enabled for
the library, or set up signed URLs (advanced).

### Cost surprise
**Cause:** Bandwidth blew up (someone re-watched videos a lot).
**Fix:** Bunny dashboard → set a hard limit. Or proxy playback through
a Cloudflare R2 CDN.

---

## When to move off Bunny

Bunny gets pricey only at **>500 partidos/month sostenido**. At that
volume:

| Alternative | Cost |
|---|---|
| Cloudflare R2 + your own HLS pipeline | ~$30/month flat |
| S3 + CloudFront | ~$40/month |
| Self-host with MinIO + nginx | $30/month VPS |

Migration is straightforward: change the URLs in the upload pipeline,
keep VideoService schema identical.
