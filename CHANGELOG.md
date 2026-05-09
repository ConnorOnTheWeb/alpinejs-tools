# Changelog

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