# Changelog

## [1.6.3] — 2026-08-03

### Fixed

- **Alpine JS syntax highlighting never activated in plain `.html` files** — the injection grammar's `injectTo` (`package.json`) and `injectionSelector` (`syntaxes/alpine-injection.tmLanguage.json`) targeted scope `text.html.basic`, which is real, but isn't what VS Code actually loads as the root grammar for the `html` language. VS Code's bundled `html` extension contributes two grammars from the same TextMate bundle: `text.html.basic` (no `language` binding — used only as a shared pattern repository via `#include`, e.g. by PHP's and this extension's own `html.tmLanguage.json`-derived grammars) and `text.html.derivative` (bound to `"language": "html"`, the grammar actually loaded when a `.html` file is opened). Since `#include` reuses patterns without pushing the referenced grammar's scope name onto the token stack, `text.html.basic` never appears anywhere in a real `.html` document's scope stack, so the injection selector could never match — regardless of `injectTo`. Every other supported language was unaffected because their companion extensions bind `"language"` directly to the same scope name this extension targets (e.g. PHP binds `"language": "php"` straight to `text.html.php`), so this particular basic/derivative split is unique to VS Code's own built-in HTML grammar. Verified directly by tokenizing sample files with `vscode-textmate` against the real bundled HTML grammar: with only `text.html.basic` injected, zero Alpine scopes were produced in a `.html` file; adding `text.html.derivative` to both `injectTo` and `injectionSelector` produces `entity.other.attribute-name.alpine.html` and `source.js`-tokenized values as expected, with the existing `text.html.basic` targeting left in place (still needed for consumers that embed HTML via that scope directly, e.g. Markdown-embedded HTML blocks). This is the same class of bug as the Blade scope-name mismatch fixed in v1.6.2, but one layer further upstream — the wrong grammar being targeted, rather than the wrong companion-extension scope name.

---

## [1.6.2] — 2026-07-30

### Fixed

- **Blade's `@foreach`, `@endforeach`, `@if`, `@csrf`, and other `@`-prefixed directives were mistaken for Alpine's `@` shorthand** — the `@` shorthand hover and the dot-triggered modifier completions matched any `@word` token anywhere in the document, with no check on whether it was actually an HTML attribute name. Blade uses `@` as its own body-text directive prefix (unlike Livewire's `wire:*`, which is at least always an attribute), so a bare boundary check like the one used for `v1.6.1`'s `:` fix wasn't sufficient here — `@foreach`'s `@` starts a token exactly the same way `@click`'s does. Both now additionally require the match to sit inside an HTML tag's angle brackets (`<tag ...|...>`) rather than in body text between tags, which is where Blade's directives always appear and Alpine's attribute shorthand never does. Applied to both the bare `@` and bare `:` alternatives for consistency, since the underlying invariant (Alpine's shorthand is only ever an attribute name) applies to both.

- **Alpine JS syntax highlighting inside directive values never activated in real Blade files** — the injection grammar's `injectTo` (`package.json`) and `injectionSelector` (`syntaxes/alpine-injection.tmLanguage.json`) targeted scope `text.blade.php`, but the actual scope the standard Blade extension (`onecentlin.laravel-blade`, i.e. "Laravel Blade Snippets") registers is `text.html.php.blade` — a different string, so the injection silently never matched. Verified directly by tokenizing sample files with `vscode-textmate` against the real installed Blade grammar: with the old scope name, zero Alpine scopes were produced anywhere; with the corrected name, `x-data`/`:`/`@`/`wire:*` attribute values all tokenize and get JS syntax highlighting correctly. While investigating, the other 6 injected scope names (`text.html.ejs`, `text.html.php`, `text.html.twig`, `text.html.nunjucks`, `text.html.liquid`, `text.html.jinja`) were each cross-checked against a real, currently-published copy of their respective standard companion extension and confirmed correct — Blade was the only mismatch.

---

## [1.6.1] — 2026-07-30

### Fixed

- **Livewire's `wire:model` (and other `wire:*` / colon-containing attributes) were mistaken for Alpine's `:` shorthand** — the `:` shorthand hover, the dot-triggered modifier completions, and the directive-value completions all matched a bare `:` followed by word characters anywhere in the attribute name, with no check on what preceded the colon. Since `wire:model` literally contains the substring `:model`, hovering it showed "`:model` is shorthand for `x-bind:model`", typing `wire:model.` offered Alpine's `x-bind` modifiers (`camel`, `dot`, `attr`), and `wire:model="…"` offered Alpine `x-data` property completions inside the value — none of which apply to a Livewire attribute. All three now require the colon to not be immediately preceded by an identifier character (`(?<![\w-]):`), so the colon must sit at an actual attribute-name boundary rather than merely appear somewhere in the string. This is the same class of boundary-matching bug as the `translate-x-1/2` false positive (v1.4.1) and the `x-trap` allow-list miskey (v1.5.0), but for the `:` shorthand family rather than the `x-` prefix. As a side effect, this also resolves the `:` shorthand hover firing inside Tailwind pseudo-variant classes like `hover:text-red-500` (previously noted under Known Issues).

---

## [1.6.0] — 2026-07-27

### Added

- **`$event` magic property** — hover documentation and `$`-triggered completion for `$event`, matching the existing support for `$el`, `$refs`, `$store`, etc. `$event` gives access to the native browser Event object inside an `x-on` (or `@event`) handler expression; its docs link points to the `x-on` directive page since Alpine documents it there rather than on a dedicated Magics page.

---

## [1.5.0] — 2026-07-25

### Added

- **`$persist` magic property** — hover documentation and `$`-triggered completion for `$persist`, matching the existing support for `$el`, `$refs`, `$store`, etc. Includes a type signature and a docs link to the `@alpinejs/persist` plugin.

### Fixed

- **`x-trap` (the `@alpinejs/focus` plugin's directive) was flagged as an unknown directive** — the diagnostics allow-list keyed the entry by the plugin's package name (`focus`) instead of the directive it actually registers (`x-trap`), so any use of `x-trap` triggered a false-positive `unknown-directive` warning. The allow-list now keys on `trap`.
- **`x-trap` was missing from HTML IntelliSense** — `customData/alpine.html-data.json` (which powers VS Code's built-in attribute completion and hover) never had an entry for it, so it didn't appear in autocomplete even once the diagnostic above was fixed. Added, with its `.inert`, `.noscroll`, `.noreturn`, and `.noautofocus` modifiers documented.
- **`x-morph` and `x-persist` were incorrectly treated as valid directives** — neither `@alpinejs/morph` nor `@alpinejs/persist` registers an `x-*` directive (they expose `Alpine.morph()`/`Alpine.morphBetween()` and the `$persist` magic property respectively), so listing them in the diagnostics allow-list suppressed a warning that should have fired for a genuine mistake. Removed; both attributes are now correctly flagged as unknown.

---

## [1.4.1] — 2026-06-17

### Fixed

- **False-positive diagnostics on Tailwind/CSS class names containing `x-`** — the directive-detection regex used `\b` (word boundary) to anchor matches, which fires at any word/non-word transition including the hyphens in class names like `translate-x-1/2` and `x-1/2`. Both forms were falsely flagged as unknown Alpine directives. The regex now uses `(?<=\s)` (requires whitespace before `x-`) combined with `(?=[=\s>]|$)` (requires `=`, whitespace, `>`, or end-of-string after the directive name). Alpine attributes always satisfy both conditions; CSS class fragments like `x-1/2` and `x-auto` do not.

---

## [1.4.0] — 2026-06-16

### Added

- **Liquid and Jinja2 language support** — hover documentation, magic property completions, modifier completions, directive-value completions, unknown-directive diagnostics, Quick Fix actions, Go to Definition, and snippets now work in `liquid` and `jinja-html` files, on par with the existing HTML/PHP/Twig/Blade support. Liquid support targets files opened with language id `liquid` (used by `Shopify.theme-check-vscode` and `panoply/vscode-liquid`). Jinja2 support targets `jinja-html` (used by `samuelcolvin.jinjahtml`); files kept as `html` language id via `wholroyd.jinja` are already covered by the existing `html` support.

- **`Alpine.data()` / `Alpine.store()` registrations in Liquid and Jinja files** — the workspace scanner now indexes `**/*.liquid`, `**/*.jinja`, `**/*.jinja2`, and `**/*.j2` in addition to the existing JS/TS/HTML globs. Registrations found in those files become valid Go to Definition jump targets and appear in `$store.name` / `x-data="name"` completions.

- **Generic template-delimiter passthrough in attribute values** — `{{ ... }}` and `{% ... %}` sequences inside Alpine attribute values (e.g. `x-data="{ open: {{ value }} }"`) are now captured as `meta.template-expression` before JavaScript tokenisation is applied, preventing mis-tokenisation of Liquid, Jinja2, Twig, and Nunjucks output expressions in directive values.

- **Centralized language list** — all three language-list constants previously maintained independently in `extension.ts`, `diagnosticProvider.ts`, and `codeActionProvider.ts` are replaced by a single `ALPINE_LANGUAGES` export in `src/constants.ts`, imported everywhere.

### Fixed

- **Blade grammar injection not loading** — `text.blade.php` was present in the `injectionSelector` of the Alpine injection grammar (added in v1.1.0) but was missing from the `injectTo` field in `package.json`. VS Code uses `injectTo` to decide when to load the grammar package, so Alpine JS syntax highlighting inside attribute values was silently never activating in Blade files. Added `text.blade.php` to `injectTo`.

- **Nunjucks grammar injection not wired** — `nunjucks` was listed as a supported language in activation events, providers, and snippets, but `text.html.nunjucks` was never added to `injectionSelector` or `injectTo`. Alpine JS syntax highlighting inside attribute values was silently never activating in Nunjucks files. Fixed by adding `text.html.nunjucks` to both.

---

## [1.3.4] — 2026-05-19

### Changed

- package.json engine version updated to support Open VSX and Cursor.

## [1.3.3] — 2026-05-16

### Changed

- README: added VS Marketplace version, license, and TypeScript badges.

---

## [1.3.2] — 2026-05-15

### Fixed

- **`ALL_DIRECTIVES` rebuilt on every diagnostic call** — the combined `[...CORE_DIRECTIVES, ...PLUGIN_DIRECTIVES]` array used for "did you mean" suggestions was constructed inside `buildDiagnostic`, allocating a new array for every unknown directive found in every document scan. Moved to a module-level constant.

- **O(N×M) line counting in `extractDataLocations`** — for each `Alpine.data(...)` match, the previous code allocated a substring from the start of the file, ran `/\n/g` on it, then ran `lastIndexOf` — repeating work proportional to the match's position for every match. Replaced with an incremental `line`/`lineStart` accumulator that advances only from the previous match, making the total work O(N).

- **`getAlpineStoreNames` used array spread then `new Set` to deduplicate** — entries were collected via `all.push(...entry.storeNames)` (a spread allocation per cached file) and then deduped. Now uses `Set.add()` directly during iteration, matching the pattern already used by `getAlpineDataNames`.

---

## [1.3.1] — 2026-05-09

### Fixed

- **Blade snippets missing** — `blade` was omitted from the snippet contribution points in `package.json`, so Alpine snippets never appeared in Blade template files despite Blade being a fully supported language.

- **"Did you mean" hint wrong for plugin directive typos** — the suggestion search only covered core directives, causing incorrect or absent hints for plugin directive typos (e.g. `x-anch` produced no suggestion instead of `x-anchor`; `x-collaps` suggested `x-cloak` instead of `x-collapse`). The search now covers both core and plugin directives and picks the shortest-distance candidate using a 2-character shared-prefix filter to avoid false matches.

---

## [1.3.0] — 2026-05-09

### Added

- **Quick Fix code actions** — when a directive is flagged as unknown, a lightbulb action appears offering `Replace with 'x-data'` (or whichever directive was suggested). The fix applies in one click, replacing the typo with the correct directive name.

- **Go to Definition for Alpine components** — when the cursor is inside `x-data="componentName"` (a string reference to an `Alpine.data()` registration, not an inline object), pressing F12 / Ctrl+Click jumps to the `Alpine.data('componentName', ...)` call in the workspace. Multiple registration sites are all listed. Inline objects (`x-data="{ open: false }"`) are intentionally skipped.

- **Plugin directive snippets** — 9 new snippets for the Alpine plugin directives: `x-intersect`, `x-intersect.enter`, `x-intersect.leave`, `x-collapse`, `x-mask`, `x-mask:dynamic`, `x-sort`, `x-sort:handle`, and `x-anchor` (with position variant picker). Total snippet count: 41.

---

## [1.2.0] — 2026-05-09

### Added

- **Unknown directive diagnostics** — Alpine directives that don't match any known core or plugin directive (e.g. `x-dat`, `x-models`) are underlined with a Warning. Where possible, a "did you mean `x-data`?" suggestion is included. Plugin directives (`x-intersect`, `x-collapse`, `x-mask`, `x-sort`, `x-anchor`) are never flagged. The diagnostic collection is named `Alpine.js Tools` and debounced 500 ms to avoid flicker while typing.

- **Plugin directive custom data** — `x-intersect`, `x-collapse`, `x-mask`, `x-sort`, and `x-anchor` are now included in the HTML custom data file so they appear in VS Code's attribute IntelliSense with hover descriptions and links to their respective plugin documentation pages.

### Fixed

- `diagnosticProvider.ts`: corrected the Alpine directive regex to stop matching at `=`, `>`, `'`, or `"` characters, so the underline covers only the attribute name rather than spilling into the value.

---

## [1.1.0] — 2026-05-09

### Added

- **Magic property hover** — hovering `$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`, `$root`, `$data`, or `$id` inside any Alpine expression now shows the same type signature and docs link that were previously only available in the completion list.

- **Modifier completions** — typing `.` after an Alpine directive name (e.g. `@click.`, `x-model.`, `x-transition.`, `:attr.`) shows the valid modifier list for that directive. Modifiers already applied in the chain are filtered out. Includes key modifiers (`enter`, `escape`, `arrow-up`, `ctrl`, `shift`, `meta`, …) for keyboard event directives.

- **`$refs.name` completions** — typing `$refs.` inside any Alpine expression shows the names of all `x-ref` declarations found in the current document.

- **`$store.name` completions** — typing `$store.` offers the names of all `Alpine.store('name', ...)` registrations found in workspace JS/TS/HTML files. Results are cached and updated by a file-system watcher.

- **`x-data` component completions** — when the cursor is inside `x-data="…"`, all `Alpine.data('name', ...)` component names found in the workspace are offered as completions.

- **Directive value completions** — inside any other Alpine directive value (e.g. `x-show="…"`, `@click="…"`), the top-level property names extracted from the nearest `x-data` object literal are offered as completions.

### Fixed

- `tsconfig.json`: updated to `moduleResolution: "bundler"` and `module: "ESNext"` (correct settings for esbuild-bundled projects); added `forceConsistentCasingInFileNames`, `types: ["node"]`, `outDir`, and excluded the test directory from the main compile to avoid needing Mocha types in the extension bundle.

- `syntaxes/alpine-injection.tmLanguage.json`: added `text.blade.php` to the injection selector so Alpine JS syntax highlighting works in Blade templates (was active for all other supported languages but missing for Blade despite it being listed in `activationEvents` and snippets).

---

## [1.0.0] — 2026-05-06

### Added
- Injection grammar: full JavaScript syntax highlighting inside `x-*`, `:`, and `@` Alpine attribute values across HTML, EJS, PHP, and Twig
- Hover documentation for all 18 Alpine v3 directives with descriptions and links to alpinejs.dev
- Hover support for `@event` and `:attr` shorthands with contextual notes
- `$` CompletionProvider returning all 9 Alpine magic properties (`$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`, `$root`, `$data`, `$id`) with SnippetString tab-stop insert text
- 32 snippets across HTML, EJS, PHP, Twig, Nunjucks, and JavaScript: directive attributes, `<template>` block wrappers, `Alpine.data()` / `Alpine.store()` scaffolds, magic properties, and event modifiers
- HTML custom data file for `x-*` attribute name completions in VS Code's HTML IntelliSense