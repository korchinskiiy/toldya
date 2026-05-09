module.exports = function (api) {
    api.cache(true);
    return {
        presets: ["babel-preset-expo"],
        // Zustand's devtools middleware (pulled in via Reown) uses
        // `import.meta.env`, which can't be parsed unless the bundle is loaded
        // as a module script. Metro doesn't apply transforms to node_modules by
        // default — `overrides.test` opts those files into the rewrite.
        overrides: [
            {
                test: /node_modules/,
                plugins: ["babel-plugin-transform-import-meta"],
            },
            {
                test: /\.(t|j)sx?$/,
                exclude: /node_modules/,
                plugins: ["babel-plugin-transform-import-meta"],
            },
        ],
    };
};
