# Alpine.js Tools

The best Alpine.js developer experience for VS Code. Syntax highlighting, hover documentation, IntelliSense completions, and snippets — across HTML, EJS, PHP, Twig, Nunjucks, and Blade.

## Features

### JavaScript syntax highlighting inside Alpine directives

Attribute values on `x-*`, `:`, and `@` attributes are tokenised as full JavaScript — operators, strings, arrow functions, ternaries, and method calls all get correct colours from your theme.

```html
<div x-data="{ open: false }">
  <button @click="open = !open" :aria-expanded="open">Toggle</button>
  <div x-show="open" x-transition>
    <!-- content -->
  </div>
</div>
```

### Hover documentation

Hover over any Alpine directive, shorthand, or magic property to see documentation and a link to alpinejs.dev.

- `x-data`, `x-show`, `x-model`, `x-for`, `x-if`, `x-transition` … all 18 directives
- `@click` → shows `x-on` docs with a note that `@click` is shorthand for `x-on:click`
- `:class` → shows `x-bind` docs with a note that `:class` is shorthand for `x-bind:class`
- `$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`, `$root`, `$data`, `$id` → type signature and docs link
- Dot-modifiers are handled: hovering `x-model.number` shows `x-model` docs

### Magic property completions

Type `$` inside any Alpine expression to get completions for all Alpine magic properties with type signatures, descriptions, and tab-stop-aware insert text.

After `$refs.` — completions list every `x-ref` name declared in the current file.

After `$store.` — completions list every `Alpine.store('name', ...)` registration found in workspace JS/TS/HTML files (backed by a file-system watcher).

### Modifier completions

Type `.` after any Alpine directive name to get the valid modifiers for that directive:

| Directive | Modifiers |
|---|---|
| `@event.` | `prevent`, `stop`, `self`, `window`, `once`, `passive`, `debounce`, `throttle`, + key names (`enter`, `escape`, `ctrl`, `shift`, `meta`, …) |
| `x-model.` | `lazy`, `number`, `boolean`, `trim` |
| `x-transition.` | `enter`, `leave`, `opacity`, `scale`, `origin-*` |
| `:attr.` / `x-bind:attr.` | `camel`, `dot`, `attr` |

Already-applied modifiers in a chain are filtered out automatically.

### Unknown directive diagnostics

Any `x-*` attribute that isn't a recognised Alpine core or plugin directive is underlined with a Warning. A "did you mean" hint is shown when a close match exists.

- Core directives (`x-data`, `x-show`, `x-model`, … all 18) and official plugin directives are never flagged.
- Diagnostics are debounced 500 ms and cleared as you type.

### Plugin directive completions

`x-intersect`, `x-collapse`, `x-mask`, `x-sort`, and `x-anchor` now appear in VS Code's HTML attribute IntelliSense alongside the core directives, with hover descriptions and links to each plugin's documentation.

### Directive value completions

Inside `x-data="…"` — suggests `Alpine.data('name', ...)` component names from the workspace.

Inside any other Alpine directive value (`x-show="…"`, `@click="…"`, etc.) — suggests the reactive property names extracted from the nearest `x-data` object literal in the current file.

### Magic property completions table

| Magic | Insert |
|---|---|
| `$el` | `$el` |
| `$refs` | `$refs.‹name›` |
| `$store` | `$store.‹storeName›` |
| `$watch` | `$watch('‹prop›', (value) => { … })` |
| `$dispatch` | `$dispatch('‹event›'‹, detail›)` |
| `$nextTick` | `$nextTick(() => { … })` |
| `$root` | `$root` |
| `$data` | `$data` |
| `$id` | `$id('‹name›')` |

### Snippets

32 snippets available in HTML, EJS, PHP, Twig, Nunjucks, and JavaScript:

**Directive attributes** — `x-data`, `x-init`, `x-show`, `x-bind`, `x-on`, `x-text`, `x-html`, `x-model`, `x-for`, `x-transition`, `x-effect`, `x-ref`, `x-if`, `x-teleport`, `x-id`

**Block snippets** — `template-for`, `template-if` (full `<template>` wrappers)

**JavaScript** — `alpine-data` (full `Alpine.data()` scaffold), `alpine-store`

**Magic properties** — `$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`

**Modifiers** — `.prevent`, `.stop`, `.debounce`, `.throttle`, `.once`, `.window`, `.outside`

## Supported languages

`html` · `ejs` · `php` · `twig` · `nunjucks` · `blade`

## Requirements

No dependencies. Works with any Alpine.js v3 project.

## Known issues

- `x-data` property completions use a heuristic (regex) to extract properties from the nearest `x-data` object literal. Complex expressions, computed keys, or spread operators won't be detected.
- `$store` name completions require `Alpine.store('name', ...)` to appear in a workspace JS/TS/HTML file. Stores registered dynamically at runtime won't be listed.
- The `:` shorthand hover may occasionally trigger inside CSS `pseudo:selector` values — hover away to dismiss.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).
