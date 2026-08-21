# Alpine.js Tools

The best Alpine.js developer experience for VS Code. Syntax highlighting, hover documentation, IntelliSense completions, and snippets - across HTML, EJS, PHP, Twig, Nunjucks, Blade, Liquid, Jinja2, Astro, Go (templ, Hugo, html/template), and JSX/TSX.

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

After `$store.` — completions list every `Alpine.store('name', ...)` registration found in workspace JS/JSX/TS/TSX/HTML/Astro/Liquid/Jinja/templ/gohtml/tmpl files (backed by a file-system watcher).

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
- Using a third-party plugin? Add its directives to `alpinejsTools.extraDirectives` rather than turning the check off — see [Extension Settings](#extension-settings).

### Go to Definition for Alpine components

Press **F12** (or Ctrl+Click) anywhere inside `x-data="componentName"` to jump directly to the `Alpine.data('componentName', ...)` registration in your workspace JS/JSX/TS/TSX/HTML/Astro/Liquid/Jinja/templ/gohtml/tmpl files. Multiple registration sites are all shown. Inline object literals (`x-data="{ open: false }"`) are intentionally skipped.

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

42 snippets available in HTML, EJS, PHP, Twig, Nunjucks, Blade, Liquid, Jinja-HTML, Astro, the Go template languages, JavaScript, and JSX/TSX:

**Directive attributes** — `x-data`, `x-init`, `x-show`, `x-bind`, `x-on`, `x-text`, `x-html`, `x-model`, `x-for`, `x-transition`, `x-transition-classes` (all six `enter`/`leave` phases), `x-effect`, `x-ref`, `x-if`, `x-teleport`, `x-id`

**Block snippets** — `template-for`, `template-if` (full `<template>` wrappers)

**JavaScript** — `alpine-data` (full `Alpine.data()` scaffold), `alpine-store`

**Magic properties** — `$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`

**Modifiers** — `.prevent`, `.stop`, `.debounce`, `.throttle`, `.once`, `.window`, `.outside`

**Plugin directives** — `x-intersect`, `x-intersect.enter`, `x-intersect.leave`, `x-collapse`, `x-mask`, `x-mask:dynamic`, `x-sort`, `x-sort:handle`, `x-anchor`

## Supported languages

`html` · `ejs` · `php` · `twig` · `nunjucks` · `blade` · `liquid` · `jinja-html` · `astro` · `templ` · `gohtml` · `gotemplate` · `go-template` · `javascript` · `javascriptreact` · `typescriptreact`

Jinja2 templates that use the plain `.html` extension (the common Flask/Django case) are already covered by the `html` language support — no Jinja extension required for those files.

### Astro

`.astro` files get the full feature set, the same as the other markup languages — `@click` and `:class` shorthands included, since Astro passes attributes straight through to HTML rather than claiming those names for itself. Requires the official [Astro extension](https://marketplace.visualstudio.com/items?itemName=astro-build.astro-vscode) for the `.astro` language itself.

The `---` frontmatter block is skipped. It's TypeScript, not markup, and it's the only JavaScript region in a template language that no tag delimits — so without that, `const diff = x-y > 0` in your frontmatter would be reported as an unknown directive. YAML frontmatter in Jekyll, Hugo and Eleventy templates is skipped by the same rule.

Astro's own namespaced attributes are left alone: `client:load`, `transition:animate` and `set:html` are not read as Alpine's `:` shorthand, for the same reason `wire:model` isn't.

One limitation. An expression container (`x-data={cart}`) holds TypeScript that Astro evaluates, so completions stay out of it, exactly as they do in JSX. Use `x-data="{ open: false }"` for anything you want IntelliSense inside. Alpine directives written inside an Astro expression (`{items.map((i) => <li x-text="i" />)}`) are recognised normally, since that really is markup.

### Go

Four Go template languages are supported, covering both halves of how Go renders HTML.

**templ** (`.templ`) gets the full feature set. A `.templ` file is Go source, not markup with a template layer, so the tag scan is restricted to the bodies of your `templ` blocks — Go code, `script` blocks and `css` blocks are not markup and are left alone. Without that, a comparison chain like `if width<max && x-offset>0` reads as an opening tag with `x-offset` as an unknown directive inside it, which is exactly the kind of false positive that would have made the feature worse than nothing. Requires the official [templ extension](https://marketplace.visualstudio.com/items?itemName=a-h.templ) for the `.templ` language itself.

```templ
templ Card(product Product) {
	<div x-data="{ open: false }">
		<button @click="open = !open" :aria-expanded="open">{ product.Name }</button>
		<div x-show="open" x-transition>{ product.Description }</div>
	</div>
}
```

Attribute values that are Go expressions are handled, including raw strings — a backtick string keeps its `<` and `>` to itself rather than cutting the tag short, so the directives beside one still work:

```templ
<div data-json={ `{"a": 1 < 2}` } x-data="{ open: false }">
```

As in Astro and JSX, an expression container (`x-data={ cart }`) holds Go that templ evaluates, so completions stay out of it — write `x-data="{ open: false }"` for anything you want IntelliSense inside.

**Hugo** needs nothing installed beyond Hugo's own extension. [Hugo Language and Syntax Support](https://marketplace.visualstudio.com/items?itemName=budparr.language-hugo-vscode) keeps the `html` language ID and only replaces the grammar, so layouts have always had the full feature set — but the syntax highlighting inside `x-data="…"` used to go missing, because the injection didn't name Hugo's `text.html.hugo` scope. It does now. Hugo's `{{< shortcode >}}` syntax is skipped along with `{{ … }}` actions, so the `<` inside one can't open a bogus tag.

**`html/template` and `text/template`** are covered through `gohtml`, `gotemplate` and `go-template` — the language IDs contributed by [casualjim.gotemplate](https://marketplace.visualstudio.com/items?itemName=casualjim.gotemplate), [karyan40024](https://marketplace.visualstudio.com/items?itemName=karyan40024.gotmpl-syntax-highlighter) and [jinliming2](https://marketplace.visualstudio.com/items?itemName=jinliming2.vscode-go-template) for `.gohtml`, `.tmpl`, `.tpl`, `.gtpl` and friends. Go's `{{ … }}` delimiters were already handled, since Twig, Liquid, Jinja and Blade share them.

Worth knowing if your `.html` files ever stopped getting Alpine support: `casualjim.gotemplate` claims the `.html` extension for its own `gohtml` language, which changes the language ID out from under every extension registered for `html`. Supporting `gohtml` fixes that from this end. Setting `"files.associations": {"*.html": "html"}` fixes it from the other.

`.tmpl` and `.tpl` also hold YAML, Helm charts and shell in plenty of Go projects. Nothing is offered in those: every feature is gated on being inside a markup tag, and a Helm values template has none.

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

## Commands

| Command | What it does |
|---|---|
| **Alpine.js Tools: Rescan Workspace** | Re-sweeps the workspace for `Alpine.data()` and `Alpine.store()` registrations |

A file-system watcher keeps the index current as you edit, so you rarely need this. It's for what the watcher can't see: a branch switched or dependencies installed outside the editor, a workspace still indexing when the window opened, or a scan that hit its file limit and has since had `alpinejsTools.workspaceScan.exclude` configured.

The command reports how many files it swept and how many components and stores it found, and tells you if the limit was hit again.

## Extension Settings

Everything works with no setup. All four settings default to the behaviour you get without touching them — they're escape hatches, not configuration you're expected to do.

| Setting | Default | What it does |
|---|---|---|
| `alpinejsTools.diagnostics.unknownDirective.severity` | `warning` | Severity for unrecognised `x-*` attributes |
| `alpinejsTools.diagnostics.jsxShorthand.severity` | `warning` | Severity for `@event` / `:attr` used as JSX attribute names |
| `alpinejsTools.extraDirectives` | `[]` | Directive names from third-party plugins |
| `alpinejsTools.workspaceScan.exclude` | `[]` | Globs to keep out of the workspace scan |

Both severity settings accept `error`, `warning`, `information`, `hint`, or `off`.

**`hint` is usually what you want instead of `off`.** It keeps the check running and the Quick Fix reachable from the lightbulb, but adds nothing to the Problems panel — so a check that's occasionally wrong stops filling up your panel without you losing it entirely.

The two diagnostics are configured separately because they're different kinds of check. The unknown-directive one is a heuristic: it has to decide whether an `x-…` token is an attribute name at all. The JSX shorthand one isn't guessing — `@click=` in a `.tsx` opening tag is a hard TypeScript syntax error either way, and all the setting controls is whether you get a message explaining that, plus the fix that rewrites it.

Settings are read per folder, so a monorepo can turn a check off for one package in that folder's `.vscode/settings.json` and keep it everywhere else.

### Third-party plugin directives

If a plugin registers a directive this extension doesn't know about, name it instead of turning the check off:

```jsonc
{
  "alpinejsTools.extraDirectives": ["clipboard", "x-tooltip"]
}
```

Write names with or without the `x-` prefix — both forms work, as do names with arguments or modifiers attached (`x-clipboard:copy` registers `clipboard`). Listed names stop being flagged and start appearing as "did you mean" suggestions. Alpine's core directives and the six official plugin directives are always recognised and don't need listing.

### Excluding files from the workspace scan

The scan reads up to 2000 files per extension looking for `Alpine.data()` and `Alpine.store()` registrations. If it hits that limit, the **Alpine.js Tools** output channel says so — some `$store` completions and Go to Definition targets will be missing.

The fix is to stop scanning what has no registrations in it, which brings the count under the limit rather than raising it:

```jsonc
{
  "alpinejsTools.workspaceScan.exclude": ["**/dist/**", "**/vendor/**"]
}
```

`node_modules` is always excluded. Changing this re-runs the scan straight away. Supports `**`, `*` and `?`.

## Requirements

No dependencies. Works with any Alpine.js v3 project.

## Known issues

- `x-data` property completions use a heuristic (regex) to extract properties from the nearest `x-data` object literal. Complex expressions, computed keys, or spread operators won't be detected.
- `$store` name completions require `Alpine.store('name', ...)` to appear in a workspace JS/JSX/TS/TSX/HTML file. Stores registered dynamically at runtime won't be listed.
- In Blade files, the standard Blade extension (`onecentlin.laravel-blade` / "Laravel Blade Snippets") colors Alpine's `@click`/`:class`-style attribute names as if they were Blade directives — its own grammar has a generic `@word` fallback rule with no check for HTML attribute-name position. This can't be corrected from Alpine.js Tools: VS Code's TextMate injection resolution always tries a grammar's own self-declared rules before any externally-injected one at the same priority, so Blade's rule always wins that tie. A fix would need to happen in that extension's grammar.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).
