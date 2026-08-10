# Alpine.js Tools

The best Alpine.js developer experience for VS Code. Syntax highlighting, hover documentation, IntelliSense completions, and snippets - across HTML, EJS, PHP, Twig, Nunjucks, Blade, Liquid, Jinja2, and JSX/TSX.

[![VS Marketplace](https://vsmarketplacebadges.dev/version/connorontheweb.alpinejs-tools.svg)](https://marketplace.visualstudio.com/items?itemName=connorontheweb.alpinejs-tools) [![License](https://img.shields.io/github/license/connorontheweb/alpinejs-tools)](https://github.com/connorontheweb/alpinejs-tools/blob/main/LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![Latest Release](https://img.shields.io/github/v/release/connorontheweb/alpinejs-tools?label=download&logo=github)](https://github.com/connorontheweb/alpinejs-tools/releases/latest)

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

- `x-data`, `x-show`, `x-model`, `x-for`, `x-if`, `x-transition` … all 18 core directives, 6 plugin directives, and the 6 `x-transition:enter`/`:leave` class attributes
- `@click` → shows `x-on` docs with a note that `@click` is shorthand for `x-on:click`
- `:class` → shows `x-bind` docs with a note that `:class` is shorthand for `x-bind:class`
- `$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`, `$root`, `$data`, `$id`, `$persist`, `$event` → type signature and docs link
- Dot-modifiers are handled: hovering `x-model.number` shows `x-model` docs

### Magic property completions

Type `$` inside any Alpine expression to get completions for all Alpine magic properties with type signatures, descriptions, and tab-stop-aware insert text.

After `$refs.` — completions list every `x-ref` name declared in the current file.

After `$store.` — completions list every `Alpine.store('name', ...)` registration found in workspace JS/JSX/TS/TSX/HTML/Liquid/Jinja files (backed by a file-system watcher).

### Modifier completions

Type `.` after any Alpine directive name to get the valid modifiers for that directive:

| Directive | Modifiers |
|---|---|
| `@event.` | `prevent`, `stop`, `self`, `outside`, `window`, `document`, `once`, `passive`, `debounce`, `throttle`, `camel`, `dot`, + key names (`enter`, `escape`, `ctrl`, `shift`, `meta`, …) |
| `x-model.` | `lazy`, `number`, `boolean`, `trim` |
| `x-transition.` | `enter`, `leave`, `opacity`, `scale`, `origin-*` |
| `:attr.` / `x-bind:attr.` | `camel`, `dot`, `attr` |

Already-applied modifiers in a chain are filtered out automatically.

### Unknown directive diagnostics

Any `x-*` attribute that isn't a recognised Alpine core or plugin directive is underlined with a Warning. A "did you mean" hint is shown when a close match exists.

- Core directives (`x-data`, `x-show`, `x-model`, … all 18) and official plugin directives are never flagged.
- Only attribute names are checked. Hyphenated words in body text ("plotted along the x-axis"), `<script>` and `<style>` bodies, HTML comments, and the JavaScript around a JSX tag are never flagged.
- Diagnostics are debounced 500 ms and cleared as you type.
- **Quick Fix** — a lightbulb action offers `Replace with 'x-data'` in one click when a suggestion is available.

### Go to Definition for Alpine components

Press **F12** (or Ctrl+Click) anywhere inside `x-data="componentName"` to jump directly to the `Alpine.data('componentName', ...)` registration in your workspace JS/JSX/TS/TSX/HTML/Liquid/Jinja files. Multiple registration sites are all shown. Inline object literals (`x-data="{ open: false }"`) are intentionally skipped.

### Plugin directive completions

`x-intersect`, `x-collapse`, `x-mask`, `x-sort`, `x-anchor`, and `x-trap` now appear in VS Code's HTML attribute IntelliSense alongside the core directives, with hover descriptions and links to each plugin's documentation.

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
| `$persist` | `$persist(‹value›)` |
| `$event` | `$event` |

### Snippets

42 snippets available in HTML, EJS, PHP, Twig, Nunjucks, Blade, Liquid, Jinja-HTML, JavaScript, and JSX/TSX:

**Directive attributes** — `x-data`, `x-init`, `x-show`, `x-bind`, `x-on`, `x-text`, `x-html`, `x-model`, `x-for`, `x-transition`, `x-transition-classes` (all six `enter`/`leave` phases), `x-effect`, `x-ref`, `x-if`, `x-teleport`, `x-id`

**Block snippets** — `template-for`, `template-if` (full `<template>` wrappers)

**JavaScript** — `alpine-data` (full `Alpine.data()` scaffold), `alpine-store`

**Magic properties** — `$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`

**Modifiers** — `.prevent`, `.stop`, `.debounce`, `.throttle`, `.once`, `.window`, `.outside`

**Plugin directives** — `x-intersect`, `x-intersect.enter`, `x-intersect.leave`, `x-collapse`, `x-mask`, `x-mask:dynamic`, `x-sort`, `x-sort:handle`, `x-anchor`

## Supported languages

`html` · `ejs` · `php` · `twig` · `nunjucks` · `blade` · `liquid` · `jinja-html` · `javascript` · `javascriptreact` · `typescriptreact`

Jinja2 templates that use the plain `.html` extension (the common Flask/Django case) are already covered by the `html` language support — no Jinja extension required for those files.

### Astro (syntax highlighting only)

`.astro` files get JavaScript syntax highlighting inside Alpine directive values, the same as the languages above. The rest of the feature set — hover documentation, completions, unknown-directive diagnostics, go to definition — is **not** enabled in `.astro` yet, and is tracked for a later release.

The reason is the frontmatter. Every `.astro` file opens with a `---` fenced block of TypeScript, and unlike a `<script>` block it isn't delimited by tags, so the scan that decides where an attribute can appear doesn't yet know to skip it. Enabling the providers before that would report `const gap = x-y;` in your frontmatter as an unknown directive. Highlighting has no such problem: it is anchored to Astro's own tag scopes, so it can only reach inside a real tag.

Requires the official [Astro extension](https://marketplace.visualstudio.com/items?itemName=astro-build.astro-vscode) for the `.astro` language itself. Astro's own scoped attributes (`client:load`, `transition:animate`, `set:html`) are left alone.

### JSX and TSX

Alpine directives are supported inside JSX in `.jsx`, `.tsx`, and `.js` files — JSX in a plain `.js` file gets the `javascript` language ID, not `javascriptreact`, so both are covered. Nothing is tied to a particular framework; it works for KitaJS, Hono, Preact/React SSR, Solid, or anything else rendering Alpine attributes from JSX. Example with [KitaJS](https://github.com/kitajs/html):

```tsx
export function Cart() {
  return (
    <div x-data="cart">
      <span x-text="$store.cart.count" />
      <button x-on:click="$store.cart.countIncrease()">+</button>
      <div x-show="$store.cart.hasCoupon">Coupon applied</div>
    </div>
  );
}
```

Use the long forms `x-on:click` and `x-bind:class`. Alpine's `@click` and `:class` shorthands are not valid JSX attribute names — TypeScript rejects them with `TS1003` / `TS1382` before Alpine ever sees them — so the extension deliberately doesn't offer or document them in `.jsx`/`.tsx` files. Hyphenated names (`x-data`), namespaced names (`x-on:click`), and bare boolean ones (`x-cloak`) all type-check cleanly against `JSX.IntrinsicElements`.

Directive values work as both plain strings (`x-text="count"`) and expression containers holding a string literal (`x-text={"count"}`). A bare container (`x-data={cart}`) holds ordinary TypeScript that the TS language service already handles, so Alpine completions stay out of it.

If you reach for a shorthand out of habit, you get a warning that says so — `` `@click` is not a valid JSX attribute name `` — with a Quick Fix that rewrites it to `x-on:click`. TypeScript alone reports only `Identifier expected`, which doesn't point at the real problem.

Everything is scoped to JSX tags. The extension only acts on text that is structurally inside a JSX opening tag, so ordinary code is untouched — `const diff = x-y > 0` isn't reported as an unknown directive, `{ 'color':theme.primary }` isn't read as an `x-bind` shorthand, `@Injectable()` isn't read as an `x-on` shorthand, and `$` doesn't summon the magic-property list. A React project that never uses Alpine sees nothing from this extension.

Two things are deliberately out of scope. Markup inside tagged template literals (`` html`<div x-data="cart">` ``, as used by hono/html and lit-html) isn't recognised — there's no reliable way to tell an HTML template from any other string. And `x-data={{ open: false }}` isn't supported, because Alpine reads the attribute as a string, so an expression container holding a real object renders `[object Object]`. Use `x-data="{ open: false }"`, or `x-data={"{ open: false }"}` if you need the container form.

## Requirements

No dependencies. Works with any Alpine.js v3 project.

## Known issues

- `x-data` property completions use a heuristic (regex) to extract properties from the nearest `x-data` object literal. Complex expressions, computed keys, or spread operators won't be detected.
- `$store` name completions require `Alpine.store('name', ...)` to appear in a workspace JS/JSX/TS/TSX/HTML file. Stores registered dynamically at runtime won't be listed.
- In Blade files, the standard Blade extension (`onecentlin.laravel-blade` / "Laravel Blade Snippets") colors Alpine's `@click`/`:class`-style attribute names as if they were Blade directives — its own grammar has a generic `@word` fallback rule with no check for HTML attribute-name position. This can't be corrected from Alpine.js Tools: VS Code's TextMate injection resolution always tries a grammar's own self-declared rules before any externally-injected one at the same priority, so Blade's rule always wins that tie. A fix would need to happen in that extension's grammar.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).
