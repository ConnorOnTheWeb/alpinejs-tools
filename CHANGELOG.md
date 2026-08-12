# Changelog

## [1.8.0] — 2026-08-12

### Added

- **Settings, for the first time.** The extension contributed no `configuration` block at all and called `getConfiguration` nowhere, so every feature was unconditionally on. That was fine while everything worked; it stopped being fine for the unknown-directive diagnostic, which lands in the Problems panel and stays there. v1.4.1, v1.6.1, v1.6.2 and v1.7.3 each fixed a false positive in that one feature, and until now a user hitting an unanticipated one had no recourse short of uninstalling.

  Four settings, all of them escape hatches rather than setup. Every default reproduces 1.7.5 exactly, so an install that never opens settings.json behaves identically:

  | Setting | Default | For |
  |---|---|---|
  | `alpinejsTools.diagnostics.unknownDirective.severity` | `warning` | Turning the heuristic diagnostic down or off |
  | `alpinejsTools.diagnostics.jsxShorthand.severity` | `warning` | The JSX shorthand diagnostic, separately |
  | `alpinejsTools.extraDirectives` | `[]` | Third-party plugin directives |
  | `alpinejsTools.workspaceScan.exclude` | `[]` | Keeping build output out of the scan |

  Deliberately not settings: the supported language list, which is derived from what actually works and is not a user's problem, and toggles for hover and completions, which have no failure mode a toggle fixes — both are triggered by the cursor and neither accumulates anywhere you have to dismiss it.

- **Severity enums rather than on/off booleans.** The useful value is `hint`, which keeps the check running and its Quick Fix reachable from the lightbulb while keeping the entry out of the Problems panel. A boolean would force the choice between living with a false positive and losing every true positive with it; `hint` is the setting most people hitting one actually want. `error`, `warning`, `information` and `off` are the rest.

- **The two diagnostics are configured separately, because they fail differently.** The unknown-directive check is the heuristic one — it decides whether an `x-…` token is an attribute name at all, which is the judgement all four of those false-positive fixes were about. The JSX shorthand check makes no such judgement: `@click=` in a `.tsx` opening tag is a hard TypeScript syntax error (`TS1003`), so the extension is replacing a message that doesn't mention Alpine with one that does. Someone silencing the heuristic almost certainly still wants that. One setting covering both would have made the noisy check's problem into the useful check's problem.

- **`alpinejsTools.extraDirectives`, for third-party plugins.** The known set is Alpine's core directives plus the six official plugin ones, which is a closed list this extension can maintain. Third-party plugins are not closed: they register whatever directive name they like, and a project using one got a permanent warning on correct code. There is no right answer to hardcode, which is the case a setting is actually for — as opposed to the ones above, which exist because a heuristic can be wrong.

  Names are accepted with or without the `x-` prefix and with arguments or modifiers attached, all normalised to the base name the check compares (`x-clipboard`, `clipboard` and `x-clipboard:copy` all register `clipboard`). Listed names are exempt from the warning and join the "did you mean" candidates, so `x-clipboar` suggests `x-clipboard`.

- **`Alpine.js Tools: Rescan Workspace`, the extension's first command.** `alpinejs.nvim` has had `:AlpineRescan` throughout; there was no VS Code equivalent, so when the v1.7.1 output-channel message reported that the scan had truncated, there was nothing to do about it. Now there is: configure `workspaceScan.exclude`, run the command, and the message tells you how many files were swept and how many components and stores came back. A truncated rescan says so and offers to open the output channel.

  The command also covers what the file-system watcher can't see — a branch switched or dependencies installed outside the editor, or a workspace still indexing when the first sweep ran.

### Changed

- **The workspace scan can be repeated without leaking a watcher per run.** `initWorkspaceScanner` created the file-system watcher and the output channel inline, so wiring a command straight to it would have registered a duplicate of both on every invocation — a second watcher scanning every file twice, and a second output channel in the dropdown. The sweep is now separated from the one-time setup: `initWorkspaceScanner` still creates the watcher and channel exactly once, `rescanWorkspace` re-runs only the sweep. Overlapping rescans share one pass rather than racing.

- **A rescan swaps the cache rather than clearing and refilling it.** Emptying the map first would have meant `$store` completions and go-to-definition returning nothing for the duration of the sweep — a rescan that makes things briefly worse before making them better. The new results are built in a separate map and assigned when complete, so lookups answer from the previous sweep's data throughout.

- **The `workspaceScan.exclude` globs are applied to the watcher as well as the sweep.** `createFileSystemWatcher` takes no exclude pattern, so this is a hand-rolled matcher covering `**`, `*` and `?` — not brace alternation or character classes, which `findFiles` handles for the sweep but this does not. That asymmetry is safe in one direction only, and it is the direction it errs in: a pattern the matcher doesn't understand means the watcher re-scans a file the sweep skipped, so the cache holds slightly more than asked. It can never drop a file the sweep included.

- **The file cap is still 2000 per extension and is still not configurable.** It was considered. The fix a project wants when it hits the cap is almost never a bigger number — it is to stop reading `dist/`, `vendor/` and bundled output that contain no registration worth finding. Excluding those brings the count under the cap instead of raising it, and makes the scan faster rather than slower. A cap setting invites 100000 and a slow window blamed on the extension; the output channel now points at `workspaceScan.exclude` instead.

- **Diagnostics re-run on a settings change**, immediately rather than debounced, against every open document. Without it, turning a check off would leave its squiggles in place until each affected file happened to be edited, which reads as the setting not working. Turning both checks off for a document clears its entries rather than leaving the last set behind.

- **Settings are read per-resource**, so a monorepo can turn a diagnostic off for one package in that folder's `.vscode/settings.json` and leave the rest of the workspace alone. `workspaceScan.exclude` is window-scoped instead, because the sweep is not per-file.

### Notes

- **Verified against the full suite: 308 tests passing.** Every existing test predates these settings and none was modified, which is the check that mattered — all of them exercise the defaults, so a green run is direct evidence that the default path is unchanged. That includes the v1.4.1, v1.5.0, v1.6.1, v1.6.2, v1.7.0 and v1.7.3 regression cases across all nine HTML-family suites and all three JSX ones.

---

## [1.7.5] — 2026-08-09

### Added

- **Full Astro support.** `astro` joins the supported languages, so `.astro` files get everything the other markup languages get rather than only the syntax highlighting added in v1.7.4: hover documentation, magic-property and modifier completions, `x-data` property completions, unknown-directive diagnostics with quick fixes, go to definition, directive-name IntelliSense and snippets. `.astro` files are also swept for `Alpine.data()` and `Alpine.store()` registrations, so a store registered in a component's frontmatter shows up in `$store.` completions.

  Astro belongs with the HTML family rather than with JSX, despite its frontmatter being TypeScript. An `.astro` template is markup, `@click` and `:class` are ordinary attribute names in it — Astro passes attributes through to HTML rather than claiming those names the way Vue does — and its own `client:load`, `transition:animate` and `set:html` are already safe from the `:` shorthand check for the same reason `wire:model` is (v1.6.1). All 26 of the HTML-family tests passed against a real Astro host before a line of Astro-specific code was written, which is what made this a small change rather than the JSX-sized one it looked like.

- **Directive-name IntelliSense and snippets reach Astro through a provider, not the manifest.** The other markup languages get both declaratively, from `contributes.html/customData` and `contributes.snippets`. Neither works here. Custom data is read only by VS Code's own HTML language service, and `.astro` is served by Astro's — asking for completions inside a real `.astro` tag returns Astro's attribute list (`class:list`, `set:html`, `transition:animate`) with nothing of Alpine's in it. That was found by writing the test first and watching it fail, rather than by assuming the contribution carried over; without it this release would have claimed a feature it didn't have. A snippet contribution wouldn't have been right either, since it has no context field and would offer `x-data="{ }"` inside the TypeScript frontmatter.

  JSX already needed both served by a provider for its own reasons, so `jsxCompletionProvider.ts` became `attributeCompletionProvider.ts` and takes the three things that differ per family: the languages to register for, the "inside a tag" test, and the snippet body rewrite (JSX turns `:key="…"` into `x-bind:key="…"`; Astro leaves it, because there it's a valid attribute name). One implementation, two registrations, and the gating comes along with it — directive names are offered inside an Astro tag and not in its frontmatter, which is covered by tests in both directions.

- **Front matter is no longer scanned for directives.** A `---` fenced block at the top of a file is front matter in every ecosystem that uses one, and it is never markup. This is what Astro needed: its frontmatter is the only JavaScript region in these languages that no tag delimits, so nothing else in the scan would have skipped it, and `const wide = cols<breakpoint;` followed by `const diff = x-y > 0;` opened a region that swallowed the `x-y` and reported it as an unknown directive.

  The rule is keyed on the fence rather than on the language, so YAML front matter in Jekyll, Hugo and Eleventy templates — `.html` and `.liquid` files that have always been supported — is skipped too, and markup inside a frontmatter string (`const tpl = '<div x-dat="a"></div>'`) is left alone with it. The closing fence must be a line containing exactly `---`; with no closing fence nothing is skipped, so a stray `---` at the top of a file can't blank the rest of it.

  Worth being precise about the size of the problem this solved, because the fix is five lines and the risk was smaller than it first appeared. Measured against the real scanner, one of six realistic frontmatter shapes triggered a false positive. `Map<string, number>` doesn't, because the generic closes its own `>`. `const gap = x-y;` doesn't, because the trailing `;` fails the directive regex's `(?=[=\s>]|$)` guard. It takes a `<` immediately followed by a letter *and* an `x-…` token before the next `>` — which is exactly the shape a TypeScript comparison produces.

### Changed

- **The README tagline lists Astro.** It reads "syntax highlighting, hover documentation, IntelliSense completions, and snippets — across …", which distributes all four over every language named, so Astro was deliberately left out of it in v1.7.4 when only the first was true.

---

## [1.7.4] — 2026-08-09

### Added

- **Alpine syntax highlighting in `.astro` files.** Directive values are tokenized as JavaScript and directive names get the Alpine scope, the same as in the ten existing targets — `x-data`, `x-init`, `@click.prevent` and `x-bind:class` all resolve to `entity.other.attribute-name.alpine.html`, with `$store.cart.total` inside the value coming out as `source.js variable.other.object.js`.

  The scope name is `source.astro`, from `astro-build.astro-vscode` — confirmed by downloading the extension and tokenizing a real `.astro` sample against its actual grammar, not by reading its manifest. Reading the manifest is how v1.6.2, v1.6.3 and v1.7.2 each shipped an injection that silently never matched anything.

  Astro's own scoped attributes are untouched: `client:load`, `transition:animate` and `set:html` keep `entity.other.attribute-name.astro`, because the colon-shorthand pattern still requires whitespace before the `:` (the v1.6.1 fix). The other ten targets were re-tokenized after the change and are unaffected.

- **The Astro injection is scoped to the tag, unlike the ten HTML ones.** Those use a bare selector (`L:text.html.basic`), which is safe because everything outside a tag in an HTML file is markup or a raw-text element. An `.astro` file is different: it opens with a `---` fenced block of TypeScript. Measured on a seven-line sample, a bare `L:source.astro` selector produced 22 Alpine-scoped tokens, five of them inside a TypeScript string literal in the frontmatter (`const cls = ' x-show="open"'`, re-scoped as a live Alpine attribute) and five in body text. `L:source.astro meta.tag.start.astro` produced 12, all of them inside the real tag, with nothing outside it. That mirrors what the JSX injection already does (`L:source.tsx meta.tag`).

### Notes

- **This is highlighting only, on purpose.** `astro` is deliberately not added to the supported-language list, so hover, completions, diagnostics and go to definition stay out of `.astro` for now. The frontmatter is the blocker: it is a JavaScript region that isn't delimited by tags, and the tolerant HTML tag scan added in v1.7.3 is not built for that — `const wide = cols<breakpoint;` on one line and `const gap = x-y;` on the next opens a region that runs to the `>` of a later comparison and swallows the `x-y`, reporting it as an unknown directive. Providers need frontmatter masking first; that belongs with the region work rather than bolted on here.

  Highlighting has no equivalent risk, because it is anchored to Astro's own `meta.tag.start.astro` scope and structurally cannot reach outside a tag — which the measurement above is exactly a test of. Grammar contributions are read from the manifest without the extension being activated, so this works with no language registration and no new activation event.

---

## [1.7.3] — 2026-08-09

### Fixed

- **The unknown-directive warning fired on ordinary English.** `<p>Values are plotted along the x-axis of the chart.</p>` reported `Unknown Alpine.js directive 'x-axis'`, as did `x-ray` in prose, `const diff = x-y > 0` and `let size = x-large` in a `<script>` block, and `<!-- TODO: fix the x-offset calculation -->` in a comment. Any hyphenated word beginning with `x-` and standing alone was flagged, in all eight HTML-family languages.

  The two regex guards added in v1.4.1 couldn't catch this. `(?<=\s)` and `(?=[=\s>]|$)` were built to reject *fragments* — the `x-1/2` inside `translate-x-1/2` fails both — and a hyphenated English word standing alone in a sentence is not a fragment. It satisfies them exactly the way `x-data` does, because at the level of a regex the two are indistinguishable. No further guard would have helped: the guards enumerate ways text can fail to be an attribute, and that set has no end.

  The invariant that does settle it is the one the `@` and `:` shorthands have enforced since v1.6.2 — Alpine syntax is only ever an attribute name. The x-* diagnostic never got it. Its tag-range check existed, but the ranges were only ever computed for JSX, where the surrounding document is JavaScript and the need was obvious; in HTML-family languages the variable stayed `undefined`, the check quietly became a no-op, and the regex ran over the whole document, prose and script bodies and comments included. Both families now compute ranges, and the diagnostic reports only inside an opening tag's attribute region.

- **`>` inside a quoted attribute value hid the shorthand hover on attributes after it.** In `<div x-text="a > b" @click="go">`, the backward scan that answered "am I inside a tag?" stopped at the `>` in the attribute value and concluded the `@click` was body text, so it got no hover. Same for `<%= … %>` and `<?php … ?>` in EJS and PHP, whose closing delimiters end in `>`.

### Changed

- **One tag scan per HTML document, replacing the backward scan per lookup.** `isInsideTagAngleBrackets` ran `getText(0..position)` on every call, so answering it once per regex match would have been quadratic in document length. HTML-family documents now get a single forward scan (`htmlContext.ts`), cached per document version alongside the JSX one (`tagRanges.ts`), which every provider shares — the same treatment JSX got in v1.7.0.

  The HTML scan is deliberately **not** a copy of the JSX one. `jsxContext.ts` discards a `<` the moment it sees a character that can't appear in a tag, because in JavaScript `<` is also the less-than operator and a wrong "yes" is the common failure. In HTML the common failure is the opposite. Blade's `@if($cond)`, Twig's `{{ attrs }}`, Liquid's `{% if %}`, EJS's `<%= attrs %>` and PHP's `<?php … ?>` all appear between a tag name and its `>`, and a scanner that rejected on the `(` or the `<` would discard the whole tag and take the real `@click` beside it with it. Checked before deciding: a strict scan drops all five of those, so the HTML scan skips what markup and the template layer say to skip and otherwise keeps looking for the `>`. Each of the five is now a test.

  The one strictness kept is that a second `<` inside a candidate region rejects it, so `<p>If a <b and c <d, the x-axis label is wrong.</p>` stays body text. Template constructs are skipped outside tags too, not just inside them: `<% if (a<b) { %>` would otherwise open a bogus region running to the next `>`.

- **Commented-out markup is now the one place the diagnostics and hover deliberately disagree.** A typo inside `<!-- … -->` is no longer reported, because a warning about code you commented out is noise you didn't ask for; hovering `@click` in that same markup still works, because hover only ever answers where the cursor already is. That's one flag on one scanner rather than two implementations that drift apart, which is how the x-* path came to be missing the guard the shorthands had.

  Hover on `x-*` is otherwise untouched: hovering the words "x-for" in a sentence like "use the x-for directive" still shows the `x-for` documentation, and there is now a test saying so. Hover only ever matches known directive names, so it cannot produce the prose noise the diagnostic did.

  Verified by running the five reported cases, a genuine typo (`x-dat`), a real directive (`x-data`), commented-out markup, template syntax inside a tag, and the v1.4.1 / v1.5.0 / v1.6.1 / v1.6.2 / v1.7.0 regressions across all eight HTML-family suites and all three JSX ones.

---

## [1.7.2] — 2026-08-09

### Fixed

- **Alpine syntax highlighting never activated in `.liquid` files for users of the most popular Liquid extension.** `sissel.shopify-liquid` binds the `liquid` language to scope `source.liquid`, not `text.html.liquid` — the latter comes from `neilding.language-liquid` and `Shopify.theme-check-vscode`, which is why the scope name checked out when it was verified for v1.6.2. `source.liquid` has now been added to both `injectTo` (package.json) and `injectionSelector` (the grammar), leaving `text.html.liquid` in place so all three extensions are covered.

  This is the same failure mode as v1.6.2 (Blade) and v1.6.3 (HTML), and it is subtler than it looks: `source.liquid` builds its markup rules by `#include`-ing `text.html.derivative`, so a `.liquid` document really is tokenized by the HTML grammar's patterns. But an `#include` reuses patterns without pushing the included grammar's scope name onto the stack, so `text.html.derivative` never appears in a `.liquid` document's scope stack and none of the nine existing targets could match. Verified by tokenizing a Liquid sample against the real installed grammar: before, `x-data` came out as `meta.attribute.unrecognized.x-data.html entity.other.attribute-name.html` with no Alpine scope and no JavaScript in the value; after, it is `meta.attribute.alpine.html entity.other.attribute-name.alpine.html` with the value tokenized as `source.js`.

  While here, all eight HTML-family languages were re-audited the same way, tokenizing the same Alpine sample against each language's real root grammar as installed. Seven were already correct; Liquid was the only break. Blade still produces no scopes for `@click` and `:class` specifically, which is the known conflict with the Blade extension's own `@word` rule documented in the README, not a targeting problem.

---

## [1.7.1] — 2026-08-09

### Added

- **`x-transition:enter` / `:leave` class attributes.** Alpine's class-based transition API (`x-transition:enter`, `:enter-start`, `:enter-end`, `:leave`, `:leave-start`, `:leave-end`) appeared nowhere in the custom data, the snippets, or the completions, despite being the standard way to drive Alpine transitions with Tailwind classes. Diagnostics never flagged them, because `getBaseDirective` splits on `:` and sees a valid `x-transition`, so this was purely a discoverability gap rather than a false positive. All six now have hover documentation and attribute-name completions, plus an `x-transition-classes` snippet that scaffolds the full set.

  Resolving them required widening the hover's directive pattern to accept `:`, which risked breaking `x-on:click` — that has no entry of its own and needs to fall back to `x-on`. Lookup now tries the full name first and falls back to the part before the colon, so `x-transition:enter` gets its own docs while `x-on:click`, `x-bind:class` and `x-mask:dynamic` keep resolving to their parents. Both directions are covered by tests.

### Fixed

- **Six of the eight HTML-family languages had no real test coverage.** `ejs`, `twig`, `nunjucks`, `blade`, `liquid` and `jinja-html` are contributed by companion extensions that were never installed in the test host, so those documents opened as `plaintext` and no provider was registered for them. The five positive tests per language failed visibly, but the nine negative ones ("no Alpine shorthand hover appears here") passed for the wrong reason — nothing appeared anywhere. The Livewire, Tailwind and Blade `@foreach` regressions fixed in v1.4.1, v1.6.1 and v1.6.2 were therefore unguarded in precisely the languages they were reported against. `.vscode-test.mjs` now installs all six (each ID verified against its published marketplace manifest to confirm the exact language ID it contributes), and every suite asserts its language is registered before running, so a failed install can never again masquerade as passing tests. The suite went from 134 passing / 30 failing to 210 passing / 0 failing.

- **`<` inside a `<script>` or `<style>` block confused the HTML tag check.** `isInsideTagAngleBrackets` scans back for the nearest unmatched `<`, so a comparison like `if (a < b)` in a script block left the scan pointing at an operator, and anything shorthand-shaped after it — an object key such as `{ 'color':theme }` — was reported as Alpine's `:` shorthand for `x-bind`. Same family as the `wire:model` and Blade `@foreach` false positives in v1.6.1 and v1.6.2, one layer deeper. Raw-text element bodies are now excluded from the scan; being inside the `<script …>` opening tag itself still counts as a tag, since an attribute could legitimately live there.

- **The workspace scan no longer truncates silently.** `findFiles` caps without reporting, and the failure mode is invisible: `$store` completions and go-to-definition just come up empty for anything past the limit. Hitting the cap now writes an explanation to an "Alpine.js Tools" output channel.

---

## [1.7.0] — 2026-08-09

### Added

- **JSX / TSX support** ([#5](https://github.com/ConnorOnTheWeb/alpinejs-tools/issues/5)) — `javascript`, `javascriptreact` and `typescriptreact` join the supported languages, for server-rendered JSX setups such as KitaJS (`@kitajs/html`) and Hono. Nothing is framework-specific: the gating is on JSX syntax, so Preact/React SSR, Solid and anything else rendering Alpine attributes from JSX are covered by the same code. `javascript` is included because it is the language ID for `.js`, `.mjs` and `.cjs` — only `.jsx` gets `javascriptreact`, and plenty of projects put JSX in `.js`. Hover documentation, magic-property and modifier completions, `x-data` property completions, unknown-directive diagnostics with quick fixes, go-to-definition, directive-name IntelliSense, snippets, and JavaScript syntax highlighting inside directive values all work in `.js`/`.jsx`/`.tsx` files.

  Only the long forms are offered. `@click="…"` and `:class="…"` are not valid JSX attribute names — TypeScript rejects them with `TS1003 Identifier expected` and `TS1382 Unexpected token` before Alpine is ever involved — so the shorthand code paths are skipped in JSX rather than heuristically guarded, and snippet bodies that emit shorthand (`x-for`'s and `template-for`'s `:key="…"`) are rewritten to `x-bind:key="…"` on the way out. Verified against `tsc` that `x-data`, `x-on:click`, `x-show` and bare `x-cloak` all type-check clean against `JSX.IntrinsicElements`.

  Directive values are recognised as plain strings (`x-text="count"`) and as expression containers holding a string literal (`x-text={"count"}`), including for `x-ref` and for `x-data`'s property extraction. A bare container (`x-data={cart}`) is ordinary TypeScript that the TS language service already completes, so Alpine stays out of it. `x-data={{ open: false }}` is deliberately not supported: Alpine reads the attribute as a string, so a container holding a real object renders `[object Object]`.

  **New diagnostic: `@click` / `:class` used in JSX.** Reaching for the shorthand out of habit is the most likely mistake for someone bringing Alpine markup to JSX, and TypeScript's own report — `TS1003 Identifier expected`, pointing at the `@` — says nothing about Alpine or about what to do. A warning now names the problem and a Quick Fix rewrites it to the long form. Only ever raised inside a JSX opening tag, so decorators and object-literal keys are untouched.

  Two pieces needed new machinery rather than a language-ID addition:

  - **Directive-name IntelliSense and snippets don't reach JSX declaratively.** In HTML-family languages they come from `contributes.html/customData` and `contributes.snippets`. The former is read only by VS Code's HTML language service; the latter is scoped by language with no context field, so registering it for `typescriptreact` would offer `x-data="{ }"` in the middle of ordinary TypeScript. Both are now served in JSX by a completion provider (`jsxCompletionProvider.ts`) that reads the same two bundled files — one definition of each directive and snippet — and gates on cursor context: attribute completions only inside a JSX opening tag, block snippets (`alpine-data`, `template-if`, …) only outside one.

  - **"Am I inside a tag?" can't be answered by scanning angle brackets in JSX.** The existing HTML check looks back for the nearest unmatched `<`. In a `.tsx` file `<` is also the less-than operator and the generic-argument delimiter, and `=>` scatters `>` everywhere, so that check reports "inside a tag" across large stretches of ordinary TypeScript. A structural scanner (`jsxContext.ts`) replaces it there: it walks the document once, skips comments and string/template literals, and accepts a `<` as a tag only if what follows is an element name and then a region containing nothing but attribute names, `=`, quoted strings, and balanced `{…}` containers. `new Map<string, number>()` and `i.n < 5 && i.n > 1` are rejected on the `,` and the `&`.

    This gating is what keeps the extension inert in React projects that don't use Alpine, and it is covered by tests rather than assumed: `const diff = x-y > 0` produces no unknown-directive diagnostic (it matches the directive regex exactly), `{ 'color':theme.primary }` produces no `x-bind` shorthand hover, `@Injectable()` produces no `x-on` shorthand hover, a bare `$` offers no magic properties, and `x-` outside a tag offers no directive completions.

  Syntax highlighting uses a separate injection grammar (`syntaxes/alpine-jsx-injection.tmLanguage.json`) rather than extending the existing one. Its selector is `L:source.tsx meta.tag, L:source.js.jsx meta.tag, L:source.js meta.tag` — scoped to JSX tags by the host grammar's own scope names, so the injection is structurally unable to reach non-JSX code, and the eight existing languages are untouched. Verified by tokenizing a mixed TSX sample with `vscode-textmate` against the real bundled TypeScriptReact, JavaScriptReact and JavaScript grammars: `x-data`, `x-text` and `x-on:click` receive `entity.other.attribute-name.alpine.jsx`, their values tokenize as `source.js` (`$store` → `variable.other.object.js`), and zero Alpine scopes appear on the plain-TypeScript lines of the same file. The `source.js` target was additionally checked against a real HTML document to confirm it doesn't reach into `<script>` blocks or re-scope the Alpine attribute values the HTML injection already owns. The grammar also omits the `[:@]` begin alternative the HTML one carries, since those aren't valid JSX attribute names.

  Two limitations are deliberate and documented in the README. Markup inside tagged template literals (`` html`<div x-data="cart">` ``, as used by hono/html and lit-html) is not recognised — there is no reliable way to distinguish an HTML template from any other string, and guessing from the tag function's name is exactly the kind of heuristic that produced the `wire:model` and Blade `@foreach` false positives. And Astro, MDX and Vue SFCs are separate language IDs with their own companion-extension grammars; adding injection scopes for them without a copy of each extension to tokenize against is how v1.6.2 and v1.6.3 shipped injections that silently never matched, so they are left for a change that can be verified.

### Changed

- **Workspace scanning covers `.jsx`, `.tsx` and `.cjs`**, and the `findFiles` sweep and the file-system watcher now derive their patterns from one shared extension list instead of two separate literals that had to be edited in lockstep.

- **Snippets for `javascript` moved from `contributes.snippets` to the completion provider.** The declarative registration offered all 41 snippets anywhere in a `.js` file, including `x-data="{ }"` in the middle of ordinary code. They are now context-gated like the rest: attribute snippets only inside a JSX tag, scaffolds (`alpine-data`, `template-if`) outside one, and the magic/modifier snippets (`$watch`, `.prevent`) outside one *in documents that reference `Alpine.`* — `$` and `.` are too common in JavaScript to offer unconditionally, but dropping them entirely would have cost Alpine authors their `$watch` snippet in an `Alpine.data()` body.

- **Tag-range scans are cached per document version.** Hover, the dot completions, the directive-name completions and the diagnostic pass all need the same answer on the same keystroke; the scan now runs once per edit instead of once per provider. Documents over 2 MB are skipped entirely, which matters now that `javascript` is a supported language and minified bundles are in scope.

### Fixed

- **The workspace watcher re-scanned `node_modules`.** `createFileSystemWatcher` takes no exclude pattern, and unlike the `findFiles` sweep beside it, nothing filtered its callbacks — so every `npm install` re-scanned thousands of dependency files that the initial sweep had deliberately skipped. Now filtered explicitly. Pre-existing, but adding `.jsx`/`.tsx` to the scan list would have made it considerably worse.

- **`.outside` was missing from the `x-on` modifier completions.** It is a real Alpine event modifier (`x-on:click.outside` / `@click.outside`, the standard way to close a dropdown on an outside click), and it was already in the snippets file and the README's snippet list — but not in the modifier table the dot-completion provider reads, so typing `@click.` never offered it. Added, along with `document` and `camel`/`dot` to the README's modifier table, which had also drifted from the implementation.

- **The initial workspace sweep truncated silently at 500 files per extension.** `findFiles` caps without reporting, and the symptom is `$store` completions and go-to-definition quietly not working in a large repo. Raised to 2000 per extension.

---

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