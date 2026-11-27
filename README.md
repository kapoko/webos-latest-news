# Laatste Journaal

LG webOS app for NOS Journaal and the 20:00 edition. Shows up to three available broadcasts per type with Dutch dates/times and durations. Select with arrow keys and OK to play directly on the TV, without NPO Start or profile selection.

## Earlier broadcasts

The completed list is cached in session storage for two minutes, including across navigation to the player and back. Returning within that time renders it immediately without API calls. **Vernieuwen** bypasses the list cache; expired lists refresh automatically. If session storage is unavailable, an in-page memory cache still works until navigation. Playback always resolves a fresh stream URL.

NOS's current catalogue usually contains only the latest broadcast per type. The service also checks up to 12 IDs before the newest ordinary Journaal using `/smarttv/v3/broadcasts/{id}`. These detail endpoints can retain earlier editions after they disappear from the catalogue, including the longer 07:00 bulletin.

Discovery stops starting requests once three distinct available ordinary Journaal editions have been found, including any in the catalogue. Up to two checks already in flight may still finish. The 20:00 editions in the catalogue and any found along the way remain available. Discovery uses at most three concurrent requests, a four-second request timeout, and stops starting requests after eight seconds. Details and missing IDs are cached in memory for two minutes. Gaps and other programmes are skipped. Partial lookup failures show a warning without hiding the catalogue or successfully found editions. This is a bounded recent-history lookup, not a complete archive: editions outside the ID window or the three-per-type display limit may be absent.

## Playback

Every selection fetches that exact broadcast's details again and resolves a fresh unencrypted HLS URL for the TV's native HTML video player. It never substitutes the newest edition for a missing one. The official NOS TV player only searches its current catalogue, so archived editions cannot reliably use its deep links.

The episode title line shows the current decoded video height beside the duration (for example, `9 min · 720p`). It updates on video resize events, playback updates, and whenever controls are revealed. This is the video element's reported resolution, not the display resolution or the highest available HLS variant; if the TV does not report it, the label reads `kwaliteit onbekend`.

The simple bottom bar has play/pause, a **15 seconds back** button, and a seek slider with a playhead and elapsed/total time. Cursor movement reveals it; it hides after three seconds without interaction. **Back** hides the bar first; another Back returns to the list. Use remote arrows to navigate the buttons; left/right on the slider seek 15 seconds and up/down leave the slider. **OK** activates the selected control (or toggles playback when the bar is hidden). Errors stay visible until dismissed. On a failure, note the displayed video error and retry with Start. Native playback was confirmed on the user's LG TV with the 27 November 2026, 07:00 bulletin. Only direct `npox.nl` stream URLs are currently supported; other resolver formats are reported as unsupported.

## Development

### GitHub builds and Homebrew Channel

GitHub Actions runs the tests and packages both the app and its service on pushes,
pull requests, and manual runs. Download the `webos-ipk` artifact from the run.

To publish a release, first update `version` in `app/appinfo.json`, commit the
changes, then push a matching tag (for example, `v1.4.16`). The workflow publishes
the IPK and a generated `repo.json` as GitHub release assets, then commits the
same manifest to the default branch. Its SHA-256 and size come from the released
IPK. Publishing an older version will not downgrade the repository feed.

After the first successful release, add this custom repository URL in Homebrew
Channel (assuming the default branch is `main`):

```text
https://raw.githubusercontent.com/kapoko/webos-latest-news/main/repo.json
```

The initial feed is empty until a release is built. The repository and release
assets must be publicly accessible. Actions needs permission to write repository
contents; branch protection must permit its manifest commit. If that commit is
blocked, the release still contains `repo.json`, which can be copied to the
default branch manually. This is a custom feed, not a submission to the official
Homebrew Channel catalogue. The app is unofficial and is not affiliated with NOS.

### Local packaging

Requires Node.js and the [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-installation). Enable Developer Mode on the TV and pair it using `ares-setup-device` and `ares-novacom --getkey`.

```sh
npm install -g @webos-tools/cli
node --test test/*.cjs
ares-package app service -o dist
ares-install -d <device> dist/nl.kasper.latestnews_1.4.16_all.ipk
ares-launch -d <device> nl.kasper.latestnews
```

- `app/`: TV interface, native player, and legacy NOS launch configuration.
- `service/`: NOS catalogue/detail requests, archive discovery, and stream resolution.
- `test/`: catalogue and interface tests.
- `scripts/create-icons.py`: regenerate icons (requires Python/Pillow).

The legacy NOS app ID is configured in `app/config.js`; direct playback does not need it. Catalogue endpoints and stream behaviour are unofficial and may change.
