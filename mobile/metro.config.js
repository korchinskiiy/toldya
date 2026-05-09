// Learn more https://docs.expo.dev/guides/customizing-metro
const {getDefaultConfig} = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// wagmi/viem use the modern `exports` field with explicit `.js` extensions in
// their ESM entry points. Metro doesn't honor that by default; this flag turns
// it on so resolution actually walks `exports` like Node + bundlers do.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ["require", "import", "react-native", "browser", "default"];

module.exports = config;
