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

## Record where each one came from

Add a line here for every file, so that in six months there is a record of why
we are allowed to use it:

| File | Source | Licence |
|---|---|---|
| _(none yet)_ | | |

## How they are used

`generate-reel.js` picks one per day by rotation, trims it to the reel's
length, and fades it in and out. One bed works; two or three is better, since
every reel sharing a single track is noticeable quickly. That is also the main
reason reels run once a week rather than daily.

The generator **refuses to build a silent reel**. A reel with no audio is not a
quieter reel — Instagram shows it with a dead soundtrack icon and almost nobody
finishes it.
