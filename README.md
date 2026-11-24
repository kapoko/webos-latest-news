# Journaal

LG webOS launcher for NOS Journaal and the 20:00 edition. Shows up to two available broadcasts per type with Dutch dates/times. Select with arrow keys and OK to open the broadcast in the official NOS app. No custom player.

**Limitation:** the NOS TV catalogue currently returns only the latest broadcast per type. Earlier editions, including 18:00 after the 20:00 edition appears, may be absent.

## Development

Requires Node.js and the [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-installation). Enable Developer Mode on the TV and pair it using `ares-setup-device` and `ares-novacom --getkey`.

```sh
npm install -g @webos-tools/cli
node --test test/*.cjs
ares-package app service -o dist
ares-install -d <device> dist/nl.kasper.latestnews_1.3.4_all.ipk
ares-launch -d <device> nl.kasper.latestnews
```

- `app/`: TV interface and NOS launch configuration.
- `service/`: NOS catalogue requests and broadcast selection.
- `test/`: catalogue and interface tests.
- `scripts/create-icons.py`: regenerate icons (requires Python/Pillow).

The NOS app ID is configured in `app/config.js`. Catalogue endpoints and deep-link behaviour are unofficial and may change.
