# Static asset integrity and JavaScript syntax

Run from the repository root with Git and Node.js 22:

```sh
node .github/scripts/validate-static.cjs
```

CI checks the root debug output and every tracked
`bin-release/web/*/manifest.json` release. Each has its own asset root. It checks
entrypoint script, link and image references, initial/game manifest scripts,
resource catalog URLs, and image files referenced by Egret font and sprite-sheet
descriptors against the case-sensitive Git file list and files on disk.
Relative and site-root paths are normalized; query strings and fragments are
removed. External URLs, data URLs, anchors and empty dynamic image placeholders
are ignored. Local references outside the relevant asset root fail.

All tracked `.js` files, including bundled libraries and native template scripts,
and inline web entrypoint scripts are parsed without execution using Node's
JavaScript parser. `template/web/index.html` is an input template, not a deployed
entrypoint with its own manifest, and is not checked for asset integrity.
The HTML/CSS extractors cover the simple generated markup here; dynamic URLs
constructed by application JavaScript are outside this check.

This is not a TypeScript build, unit test, browser test, or runtime compatibility
check. No packages or Egret SDK are installed. A reproducible source build is
currently blocked by `egretProperties.json` requiring Egret/compiler 5.2.9 and
the external `../libsrc/bin/particle` module. These checks make no claim that
the committed JavaScript was generated from the current TypeScript sources.
