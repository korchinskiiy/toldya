# toldya — mobile

Expo (React Native) app for toldya. Shares chain config / ABIs / formatters
with the web app under `frontend/`.

## What works

- Sign in with Google or email (Reown AppKit RN)
- Browse markets, see live YES/NO odds
- Open a new market
- Place a bet (approve + stake in two txs)
- Settle: vote YES/NO if you're a staker on an open market
- Claim winnings on resolved markets
- Pull-to-refresh
- Share a market via the native share sheet

## What's still TODO

- Push notifications when bets settle / it's your turn to vote
- Native splash + branded icons
- Deep-link handling from the web (`#market-N`) into the app

## Run locally (Expo Go preview, read-only-ish)

```bash
cd mobile
cp .env.example .env       # then fill EXPO_PUBLIC_REOWN_PROJECT_ID
npm install
npm start
```

In Expo Go, scan the QR code from your terminal. Note: **Reown's social/email
sign-in doesn't work in Expo Go** — you'll see the UI but the sign-in modal
won't open. For full functionality, use an EAS dev build (below).

## Build an installable Android APK (full functionality)

This is the path for actually testing the app with auth working.

```bash
# one-time
npm install -g eas-cli
eas login                  # uses your https://expo.dev account

# every build
cd mobile
eas build --platform android --profile development
```

Wait ~10-15 min for the build to finish in Expo's cloud. The CLI prints a URL
where you can download the APK. Install it on your Android phone (allow
"install from unknown sources" the first time). The app icon launches with
full auth working.

For an APK you can share with friends to install (no dev menu):

```bash
eas build --platform android --profile preview
```

For Play Store upload later:

```bash
eas build --platform android --profile production
```

You'll need a Google Play Console account ($25 one-time) to publish to the
store; building the APK itself is free.

## Project layout

```
App.tsx                          Provider tree (Wagmi + QueryClient + AppKit init)
src/
  lib/
    appkit.native.ts             Reown AppKit RN setup
    appkit.web.ts                Stub for web preview (auth disabled)
    appkit.ts                    TS resolution shim
    chain.ts                     Taiko Hoodi config + contract addresses
    contracts.ts                 Hub + ERC-20 ABIs
    format.ts                    formatTaiko, parseTaiko, deadlineLabel
    theme.ts                     Shared design tokens (colors, radii, shadows)
    errors.ts                    friendlyError() — wallet error humanizer
  components/
    OnboardingPanel.tsx          Gas + mTAIKO onboarding card
    MarketCard.tsx               Single market row + actions
    BetSheet.tsx                 Bottom-sheet modal for staking
    CreateMarketSheet.tsx        Bottom-sheet modal for opening a market
    WalletGate.native.tsx        Re-exports AppKit RN bits
    WalletGate.web.tsx           Web stubs
  screens/
    HomeScreen.tsx               Hero + onboarding + create + market list
```
