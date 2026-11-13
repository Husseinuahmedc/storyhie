# Implementation specification

## MVP behavior

1. Start at `/` with a sample composition and **اختار صورة**. Accept local photos from the device picker and allow replacing them. Decode before committing state. Show an Arabic error for unsupported or corrupt files. Downscale large images before editing and release unused object URLs.
2. Show **اختار أغنية**. The manual path accepts title and artist and an optional user-provided cover that they have permission to use. Spotify is optional. Show distinct loading, invalid URL, missing artwork and network error states. Manual entry must remain available in all states.
3. In **عدّل الستوري**, switch templates, move or zoom the photo, and add or clear a short caption. Preserve the draft when navigating backward. Use touch gestures plus accessible zoom and reset controls. Clamp photo position so required image regions stay covered.
4. In **ستوريك جاهز**, render and download an actual PNG at exactly 1080 × 1920. Expose the track URL as a separate copyable value when provided. Tell the user they can add audio with Instagram Music or the URL with a Link sticker. Provide retry and return-to-editor actions. Starting a new story resets the draft.
5. Store a draft in memory for the editing session. The browser renders the preview and export locally. No sign-in, database, persistent upload storage or analytics is required.

## Spotify integration

Implement `POST /api/track-preview` with a JSON body containing `url`. Parse the URL server-side. Accept only HTTPS, exact `open.spotify.com`, and `/track/<22-character alphanumeric ID>` with optional trailing slash. Reject credentials and custom ports, strip tracking parameters, and reconstruct a canonical URL. Fetch a fixed Spotify oEmbed endpoint using the canonical URL as a query parameter, with a short timeout, bounded requests, and normalized responses. Treat upstream HTML and strings as untrusted. Return only required, validated fields. Missing thumbnail or artist should degrade gracefully. Provide a direct link back to the track, use the required attribution, and display provider art intact.

Keep Spotify-provided data in the linked in-app preview. Use user-entered text and original or permitted user-supplied artwork in the exported PNG. Verify rights and provider terms before shipping any direct export of Spotify artwork. The user can enter missing information manually. Search by name is a later feature, subject to Spotify Web API access and quota. Do not depend on scraping or a user Spotify login for MVP.

- [Spotify oEmbed reference](https://developer.spotify.com/documentation/embeds/reference/oembed)
- [Spotify design guidelines](https://developer.spotify.com/documentation/design)
- [Spotify Developer Policy](https://developer.spotify.com/policy)

## Implementation order

1. Scaffold the app and tokens. Build photo selection and the manual track flow.
2. Build shared story composition and three templates. Preview at 9:16 with responsive scaling. Use a single renderer or shared layout model for preview and export.
3. Add Canvas PNG export. Await font loading, measure and wrap Arabic correctly, use RTL alignment, and use Blob download. Test the output dimensions and legibility.
4. Add the Spotify route and in-app preview. Preserve the local workflow if the provider fails.
5. Verify and document setup, checks, and known limits in the project README.

## Acceptance checks

- A user can import a portrait and landscape photo, fill song details manually, choose each template, move and zoom, and download a PNG.
- The PNG is 1080 × 1920 and matches preview crop, template, Arabic shaping and caption wrapping.
- Long titles and captions remain readable and within bounds. Mixed Arabic and Latin text and URLs display correctly.
- Invalid URLs and upstream failures show a readable recovery action. The user can still export through the manual flow.
- Files stay in the browser. Only the track URL reaches the metadata endpoint.
- The flow is usable at 320 and 390 CSS pixels. Test iOS Safari and Android Chrome when available and distinguish emulation from real-device testing.
- Run lint, TypeScript, production build, and an end-to-end export check. Verify an actual valid provider response when network access permits.

## First release

Test with five users. Target four completing their first download unassisted in under a minute. For the launch reel, show one photo in the three templates and ask «لو هاي اللقطة إلها أغنية، شنو تختار؟».
