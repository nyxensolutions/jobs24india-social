# Music beds

Reels burn their audio into the MP4. The Instagram Content Publishing API has
no field for picking a track from Instagram's own audio library — that exists
only in the app — so whatever is in this folder is the only music a scheduled
reel can have.

That makes the licence the important part. Commercial music gets a reel muted
or taken down, and an automated account cannot notice or recover from that.

## What to put here

- **Instrumental.** No vocals. Words in the music fight the words on screen.
- **15 seconds or longer**, so a ~9 second reel trims rather than loops.
- **`.mp3`, `.m4a` or `.wav`.**
- **CC0 or the Pixabay licence** — something that needs no attribution. Avoid
  "free with credit" tiers such as Uppbeat's: a credit cannot go in a reel
  without looking amateur, and omitting it breaks the licence.

Good sources: [Pixabay Music](https://pixabay.com/music/) (no attribution
required) and the YouTube Audio Library filtered to "no attribution required".
Search for *corporate uplifting*, *minimal optimistic*, *light background*,
around 100–120 BPM.

## The beds in use

Five, trimmed to 20 seconds each from 0:15 of the source track — past the
intro, where the arrangement is established — and loudness-matched to
-16 LUFS so five beds do not post at five different volumes.

| File | Source | Licence |
|---|---|---|
| `bed-01.mp3` | **to fill in** | **to fill in** |
| `bed-02.mp3` | **to fill in** | **to fill in** |
| `bed-03.mp3` | **to fill in** | **to fill in** |
| `bed-04.mp3` | **to fill in** | **to fill in** |
| `bed-05.mp3` | **to fill in** | **to fill in** |

**These rows are not paperwork.** If a track turns out to be licensed rather
than CC0, the reel using it gets muted or pulled, and an automated account
cannot notice that happening. Without a record there is no way to work out
afterwards which posts are affected or which file to remove.

The full-length sources are kept in `originals/`, which is gitignored: CI
clones this repo on every run, and committing 21MB of MP3 to use nine seconds
of each would sit in the history permanently.

To add another: drop the track in `originals/`, then

```bash
ffmpeg -y -ss 15 -t 20 -i assets/audio/originals/NEW.mp3 \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:a libmp3lame -b:a 128k -ar 44100 assets/audio/bed-06.mp3
```

## How they are used

`generate-reel.js` picks one per day by rotation, trims it to the reel's
length, and fades it in and out. One bed works; two or three is better, since
every reel sharing a single track is noticeable quickly. That is also the main
reason reels run once a week rather than daily.

The generator **refuses to build a silent reel**. A reel with no audio is not a
quieter reel — Instagram shows it with a dead soundtrack icon and almost nobody
finishes it.
