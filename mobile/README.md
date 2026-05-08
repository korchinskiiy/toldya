# toldya — mobile

Expo (React Native) app for toldya. Shares chain config / ABIs / formatters
with the web app under `frontend/`.

## Run locally

```bash
cd mobile
cp .env.example .env       # then fill EXPO_PUBLIC_REOWN_PROJECT_ID
npm install
npm start                  # opens Expo dev tools
# press i for iOS simulator (macOS only) or a for Android emulator
```

For physical-device testing, install the **Expo Go** app on your phone, scan
the QR code from `npm start`. Note that Reown AppKit's social/email login
requires a physical device or full simulator — Expo Go cannot run all native
modules. For full functionality use a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

## What's here

- `App.tsx` — wraps `HomeScreen` in WagmiProvider + QueryClientProvider; loads AppKit at boot.
- `src/lib/chain.ts` — Taiko Hoodi chain config + contract addresses from env.
- `src/lib/contracts.ts` — Hub + ERC-20 ABIs (mirror `frontend/src/lib/contracts.ts`).
- `src/lib/format.ts` — `formatTaiko`, `parseTaiko`, `deadlineLabel` (mirror frontend).
- `src/lib/appkit.ts` — Reown AppKit + WagmiAdapter init.
- `src/screens/HomeScreen.tsx` — hero + market list (read-only feed for now).

## Roadmap

This is the bootstrap. Next sessions:

1. **Bet flow** — modal-based stake screen (Reown signs the tx), claim button.
2. **Push notifications** — server-side listener pushes to APNs/FCM.
3. **Polish** — splash, icons, micro-interactions, store screenshots.

## Build/store deployment

To ship to TestFlight / Play Internal we'll use **EAS Build**:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios
eas build --platform android
```

Requires:
- Apple Developer account ($99/yr)
- Google Play Console ($25 once)
