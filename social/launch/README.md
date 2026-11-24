# Launch campaign builders

Each post is an HTML page that draws itself at any size (`?w=1080&h=1350`), with a `frame(t)` function for animation.
`render.js` turns a page into a still PNG and, optionally, a frame sequence for a video.

```
node render.js 01-teaser-door.html out/teaser-4x5 1080 1350          # still only
node render.js 01-teaser-door.html out/teaser-9x16 1080 1920 7       # still + 7 s of frames
ffmpeg -framerate 30 -i out/teaser-9x16_f/%04d.png -f lavfi -i anullsrc=r=44100:cl=stereo -shortest \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -movflags +faststart out/teaser-9x16.mp4
```

Artwork comes from `brand-logos/mascot/` and `shop/assets/` (Hoodini cut-outs, logos). Look: the site's own palette
(#121211 background, #f2f0ea text, Montserrat).
