<img src="app/largeIcon.png" alt="Laatste Journaal icon" width="80" height="80">

# webOS Laatste NOS Journaal

Quickly watch the latest NOS Journaal and or 20:00 edition on LG webOS. I wanted a quicker way to just watch the latest news, instead of navigating the NPO Start or NOS app.

## Install with Homebrew Channel

You need [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) already installed on your TV.

1. Open Homebrew Channel and go to its repository settings.
2. Add this custom repository URL:

   ```text
   https://raw.githubusercontent.com/kapoko/webos-latest-news/main/repo.json
   ```

3. Refresh the app list, find **Laatste Journaal**, and select **Install**.

Keep the repository added to receive future updates through Homebrew Channel. The app will appear once the first release is available.

### Open from a computer with the repository URL prefilled

```sh
ares-launch --device <YOUR_TV> org.webosbrew.hbchannel -p '{"launchMode":"addRepository","url":"https://raw.githubusercontent.com/kapoko/webos-latest-news/main/repo.json"}'
```

## Manual installation

Download the `.ipk` file from [Releases](https://github.com/kapoko/webos-latest-news/releases) and install it using your preferred webOS app installer.

## Development

Requires Node.js 26. To run the tests and build an IPK:

```sh
git clone https://github.com/kapoko/webos-latest-news.git
cd webos-latest-news
npm install -g @webos-tools/cli@3.2.6
node --test test/*.cjs
ares-package app service -o dist
```

The package is saved in `dist/`.

---

Unofficial app, not affiliated with NOS. Broadcast availability may vary.
