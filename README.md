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

Hover over any Alpine directive or shorthand to see a description and a direct link to the Alpine.js docs.

- `x-data`, `x-show`, `x-model`, `x-for`, `x-if`, `x-transition` … all 18 directives
- `@click` → shows `x-on` docs with a note that `@click` is shorthand for `x-on:click`
- `:class` → shows `x-bind` docs with a note that `:class` is shorthand for `x-bind:class`
- Dot-modifiers are handled: hovering `x-model.number` shows `x-model` docs

### Magic property completions

Type `$` inside any Alpine expression to get completions for all Alpine magic properties with type signatures, descriptions, and tab-stop-aware insert text:

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

- `$store` and `$refs` completions list all Alpine magics rather than the specific store keys / ref names defined in your project. File-scanning resolution is planned for a future version.
- The `:` shorthand hover may occasionally trigger inside CSS `pseudo:selector` values — hover away to dismiss.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).
