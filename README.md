# StoryHIE

Turn a photo and a song into a 1080 × 1920 Instagram Story PNG. Search Deezer and Apple Music by song or artist, or enter the details manually. The editor offers nine layouts, four color palettes plus Auto, and three Arabic and three English writing fonts.

## Run locally

Use Node.js 20.9 or later.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

Photos and drafts stay in the browser. Song search sends the query to Deezer and Apple’s iTunes catalog. The optional Spotify preview sends a validated track URL and depends on oEmbed availability. Catalog artwork is included in the story preview and PNG when the provider returns a cover. You can upload a replacement. You can attach audio after uploading the story in Instagram.

Spotify search is optional. Set server-side `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for an app with access to the Spotify Search endpoint. Deezer and Apple Music work without these variables.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

[Original design in Figma](https://www.figma.com/design/u1b4aMPp5ozmQE5dFYjDoJ)
