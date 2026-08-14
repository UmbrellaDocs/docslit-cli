/**
 * Resolve build feature flags from docslit.json and CLI args.
 */
export function resolveBuildOptions(config, cliArgs = {}) {
  const build = config.build || {};
  const offline = !!cliArgs.offline;

  return {
    offline,
    minify: cliArgs.minify !== false,
    incremental: !!cliArgs.incremental || build.cache === true,
    ogImages: !offline && cliArgs.noOgImages !== true && build.ogImages !== false && config.ogImage !== false,
    searchIndex: !offline && cliArgs.noSearchIndex !== true && build.searchIndex !== false,
    llmsTxt: !offline && cliArgs.noLlmsTxt !== true && build.llmsTxt !== false,
    mcp: !offline && cliArgs.noMcp !== true && build.mcp !== false,
    sitemap: !offline && cliArgs.noSitemap !== true && build.sitemap !== false,
    profile: !!cliArgs.profile || process.env.DOCSLIT_PROFILE === '1',
    verbose: !!cliArgs.verbose,
  };
}

export function isOgImageEnabled(buildOptions, meta) {
  return buildOptions.ogImages && meta?.ogImage !== false;
}
