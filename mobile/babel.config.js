module.exports = function (api) {
    api.cache(true);
    return {
        presets: [
            [
                "babel-preset-expo",
                {
                    // Zustand's devtools middleware (pulled in via Reown) uses
                    // `import.meta.env`, which Hermes can't parse. Expo's preset
                    // ships its own polyfill — turning it on here means we
                    // don't need a separate babel-plugin-transform-import-meta.
                    unstable_transformImportMeta: true,
                },
            ],
        ],
    };
};
