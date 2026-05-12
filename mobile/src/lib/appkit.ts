// TypeScript-only resolution shim. Metro picks `appkit.native.ts` for iOS/
// Android and `appkit.web.ts` for web at runtime via its platform-suffix
// resolver — TS doesn't honor that, so we point at the native variant here.
export * from "./appkit.native";
