import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'connorontheweb.alpinejs-tools';

// Kept in sync with src/constants.ts. The two families are exercised by
// separate suites below: the shorthand-related tests only apply to the HTML
// family, since `@click` / `:class` are syntax errors in JSX.
// `templ` is deliberately absent: its markup lives inside `templ` blocks, so
// the bare-markup fixtures below aren't valid templ documents. It has its own
// suite further down.
const HTML_LANGUAGES = [
	'html', 'ejs', 'php', 'twig', 'nunjucks', 'blade', 'liquid', 'jinja-html',
	'astro', 'gohtml', 'gotemplate', 'go-template',
] as const;

const JSX_LANGUAGES = ['javascript', 'javascriptreact', 'typescriptreact'] as const;

// Basic Alpine markup that is valid in every supported host language.
// x-dat is an intentional typo to exercise the diagnostic provider.
const CONTENT = `
<div x-data="{ open: false }">
  <button @click="open = !open" :aria-expanded="open">Toggle</button>
  <div x-show="open" x-transition></div>
  <span x-dat="count"></span>
</div>
`.trim();

// Livewire attributes that contain a colon-shorthand-shaped substring
// (`wire:model` contains `:model`, `wire:class` contains `:class`) but are not
// Alpine attributes at all. Regression coverage for the false-positive where
// these were mistaken for Alpine's `:` shorthand for `x-bind:*`.
const LIVEWIRE_CONTENT = `
<div x-data="{ open: false, count: 0 }">
  <input wire:model="name" wire:model.live="email" wire:class="open ? 'active' : ''">
</div>
`.trim();

// Tailwind pseudo-variant classes (`hover:`, `md:`) also contain a
// colon-shorthand-shaped substring (`:text-red-500`, `:flex`) inside a plain
// class="..." value. Same false-positive family as LIVEWIRE_CONTENT above,
// and the exact scenario the README's old "Known issues" caveat described.
const CSS_VARIANT_CONTENT = `
<div x-data="{ open: false }" class="hover:text-red-500 md:flex">
  <span x-show="open">Toggle</span>
</div>
`.trim();

// Blade's own `@foreach`/`@endforeach` control-flow directives use the same
// `@` prefix as Alpine's `@click` shorthand for `x-on:click`, but appear in
// body text between tags rather than as an attribute name. Regression
// coverage for the false-positive where these were mistaken for Alpine's `@`
// shorthand. Includes a real `@click` attribute too, to confirm the fix
// doesn't also break the legitimate case.
const BLADE_DIRECTIVE_CONTENT = `
<div x-data="{ open: false }">
  <button @click="open = !open">Toggle</button>
  @foreach ($items as $item)
    <li>{{ $item }}</li>
  @endforeach
</div>
`.trim();

// Hyphenated words in prose, arithmetic in a `<script>` block and a TODO in an
// HTML comment all produce `x-…` shaped matches that the directive regex
// accepts, none of which is an attribute name. Regression coverage for the
// v1.7.3 false positive: the diagnostic's tag-range guard was only ever built
// for JSX, so in HTML-family languages the regex ran over the whole document.
const NON_ATTRIBUTE_CONTENT = `
<div x-data="{ open: false }">
  <p>Values are plotted along the x-axis of the chart.</p>
  <p>The chest x-ray was clear.</p>
  <!-- TODO: fix the x-offset calculation -->
  <script>
    const diff = x-y > 0;
    let size = x-large ;
  </script>
</div>
`.trim();

// The same prose and script noise, with a genuine typo among it. The
// diagnostic has to stay quiet about the first and still report the second —
// suppressing prose by suppressing everything would pass the test above.
const TYPO_AMONG_PROSE_CONTENT = `
<div x-data="{ count: 0 }">
  <p>Plot the x-axis against time.</p>
  <span x-dat="count"></span>
  <script>const step = x-y;</script>
</div>
`.trim();

// Commented-out markup, where the two consumers of the tag ranges deliberately
// disagree: diagnostics stay out, because a typo in code you commented out is
// noise you didn't ask for, and hover goes in, because hovering it is you
// asking. Both directions are asserted below.
const COMMENTED_MARKUP_CONTENT = `
<div x-data="{ open: false }">
  <!-- <button @click="open = !open" x-dat="open">Toggle</button> -->
</div>
`.trim();

// Template constructs sitting between a tag name and its `>`, which is where
// every one of these host languages emits attributes from. A tag scanner that
// rejects on the first character it doesn't recognise discards the whole tag
// and takes the real `@click` beside it — so these pin the scan as tolerant.
// The five rows are the shapes that a strict, JSX-style scanner drops.
const TEMPLATE_ATTRS_CONTENT = `
<div x-data="{ open: false }">
  <button @if($cond) disabled @endif @click="open = !open">Blade</button>
  <button {{ attrs }} @click="open = !open">Twig</button>
  <button {% if cond %}disabled{% endif %} @click="open = !open">Liquid</button>
  <button <%= attrs %> @click="open = !open">EJS</button>
  <button <?php echo $attrs; ?> @click="open = !open">PHP</button>
</div>
`.trim();

// A `<` in body text is a less-than sign, not a tag opener. Pins the one
// strictness the HTML scan keeps from the JSX one: a second `<` inside a
// candidate region proves the first wasn't a tag, so neither of these opens a
// range and the `x-axis` between them stays unreported.
const PROSE_COMPARISON_CONTENT = `
<div x-data="{ n: 0 }">
  <p>If a <b and c <d, the x-axis label is wrong.</p>
</div>
`.trim();

// A `---` fenced block at the top of a file is front matter, never markup:
// TypeScript in Astro, YAML in Jekyll/Hugo/Eleventy. It is the only
// non-markup region in these languages that no tag delimits, so the scan has
// to skip it explicitly. `cols<breakpoint` would otherwise open a region that
// runs to the `>` on the next line and swallows the `x-y` between them.
// The typo below the fence must still be reported, so this pins both halves.
const FRONTMATTER_CONTENT = `
---
const wide = cols<breakpoint;
const diff = x-y > 0;
---
<div x-data="{ count: 0 }">
  <span x-dat="count"></span>
</div>
`.trim();

// Astro's own namespaced attributes have the same shape as Alpine's `:`
// shorthand for x-bind. Same false-positive family as wire:model (v1.6.1),
// and safe for the same reason — the colon has a word character before it.
const ASTRO_DIRECTIVE_CONTENT = `
---
const content = '<p>hi</p>';
---
<Card client:load transition:animate="slide" set:html={content} />
<div x-data="{ open: false }">
  <button @click="open = !open">Toggle</button>
</div>
`.trim();

function waitFor<T>(
	check: () => T | undefined,
	timeoutMs = 3000,
	intervalMs = 100,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;
		const tick = () => {
			const result = check();
			if (result !== undefined) {
				resolve(result);
			} else if (Date.now() > deadline) {
				reject(new Error('waitFor timed out'));
			} else {
				setTimeout(tick, intervalMs);
			}
		};
		tick();
	});
}

/**
 * Fails loudly when a language ID isn't registered in the test host.
 *
 * Without this, a missing companion extension is nearly invisible: the
 * document opens as `plaintext`, no provider is registered for it, the
 * positive tests fail with confusing "expected a hover" messages, and every
 * negative test ("no Alpine shorthand hover here") passes for the wrong
 * reason. That combination made it look like six of the eight HTML-family
 * languages were covered when in fact none of their assertions meant
 * anything. The companion extensions are installed by .vscode-test.mjs; this
 * asserts the install actually took.
 */
async function assertLanguageRegistered(language: string): Promise<void> {
	const known = await vscode.languages.getLanguages();
	assert.ok(
		known.includes(language),
		`Language '${language}' is not registered in the test host, so every ` +
		`assertion for it would be meaningless. Check that its companion ` +
		`extension is listed in .vscode-test.mjs and installed successfully.`,
	);
	const doc = await vscode.workspace.openTextDocument({ language, content: '' });
	assert.strictEqual(
		doc.languageId,
		language,
		`Documents opened as '${language}' resolve to '${doc.languageId}'.`,
	);
}

async function getAlpineDiagnostics(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
	return waitFor(() => {
		const diags = vscode.languages.getDiagnostics(uri).filter(
			d => d.source === 'Alpine.js Tools',
		);
		return diags.length > 0 ? diags : undefined;
	});
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

for (const language of HTML_LANGUAGES) {
	suite(`Language: ${language}`, () => {
		suiteSetup(async () => {
			const ext = vscode.extensions.getExtension(EXTENSION_ID);
			await ext?.activate();
		});

		test('Language is registered in the test host', async () => {
			await assertLanguageRegistered(language);
		});

		test('Diagnostics fire for unknown directive', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: CONTENT });
			await vscode.window.showTextDocument(doc);

			const diags = await getAlpineDiagnostics(doc.uri);
			assert.ok(
				diags.some(d => d.message.includes("'x-dat'")),
				`[${language}] Expected x-dat diagnostic, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('Hover returns x-show documentation', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = CONTENT.indexOf('x-show');
			const position = doc.positionAt(offset + 2);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);

			assert.ok(hovers && hovers.length > 0, `[${language}] Expected hover result for x-show`);
			const text = hovers.flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(text.includes('x-show'), `[${language}] Expected x-show in hover, got: ${text}`);
		});

		test('Hover returns $event documentation', async () => {
			const content = CONTENT.replace('open = !open', '$event.preventDefault(); open = !open');
			const doc = await vscode.workspace.openTextDocument({ language, content });
			await vscode.window.showTextDocument(doc);

			const offset = content.indexOf('$event') + 2;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);

			assert.ok(hovers && hovers.length > 0, `[${language}] Expected hover result for $event`);
			const text = hovers.flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(text.includes('Event'), `[${language}] Expected Event in $event hover, got: ${text}`);
		});

		test('Completion includes $event magic property', async () => {
			const content = CONTENT.replace('open = !open', '$');
			const doc = await vscode.workspace.openTextDocument({ language, content });
			await vscode.window.showTextDocument(doc);

			const offset = content.indexOf('$') + 1;
			const position = doc.positionAt(offset);

			const list = await vscode.commands.executeCommand<vscode.CompletionList>(
				'vscode.executeCompletionItemProvider',
				doc.uri,
				position,
			);

			const labels = list.items.map(i =>
				typeof i.label === 'string' ? i.label : i.label.label,
			);
			assert.ok(
				labels.includes('$event'),
				`[${language}] Expected $event in completions, got: ${labels.join(', ')}`,
			);
		});

		test('Hover on x-transition:enter shows the class-API docs', async () => {
			const content = '<div x-show="o" x-transition:enter="ease-out"></div>';
			const doc = await vscode.workspace.openTextDocument({ language, content });
			await vscode.window.showTextDocument(doc);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				doc.positionAt(content.indexOf('x-transition:enter') + 2),
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				text.includes('x-transition:enter'),
				`[${language}] Expected x-transition:enter hover, got: ${text}`,
			);
		});

		test('Hover on x-on:click still falls back to x-on docs', async () => {
			// Guards the regression risk in widening the hover regex to accept
			// `:` — `x-on:click` has no entry of its own and must fall back.
			const content = '<button x-on:click="go()">x</button>';
			const doc = await vscode.workspace.openTextDocument({ language, content });
			await vscode.window.showTextDocument(doc);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				doc.positionAt(content.indexOf('x-on:click') + 2),
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				text.includes('x-on'),
				`[${language}] Expected x-on hover fallback, got: ${text}`,
			);
		});

		test('Colon token after a `<` comparison in <script> is not a shorthand', async () => {
			// `lastIndexOf('<') > lastIndexOf('>')` used to report "inside a
			// tag" for everything following a less-than operator in a script
			// block, so this object key hovered as Alpine's `:` shorthand.
			const content = [
				'<div x-data="{ open: false }"></div>',
				'<script>',
				'  if (a < b) { }',
				"  const o = { 'color':theme };",
				'</script>',
			].join('\n');
			const doc = await vscode.workspace.openTextDocument({ language, content });
			await vscode.window.showTextDocument(doc);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				doc.positionAt(content.indexOf("'color':theme") + 9),
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover inside <script>, got: ${text}`,
			);
		});

		test('Real @click after a <script> block still resolves', async () => {
			// The raw-text check must not swallow markup that follows the block.
			const content = [
				'<script>',
				'  if (a < b) { }',
				'</script>',
				'<button @click="go()">x</button>',
			].join('\n');
			const doc = await vscode.workspace.openTextDocument({ language, content });
			await vscode.window.showTextDocument(doc);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				doc.positionAt(content.indexOf('@click') + 3),
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				text.includes('shorthand for'),
				`[${language}] Expected @click shorthand hover after a script block, got: ${text}`,
			);
		});

		test('wire:model is not treated as the Alpine `:model` shorthand', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: LIVEWIRE_CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = LIVEWIRE_CONTENT.indexOf('wire:model="') + 'wire:'.length + 2;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on wire:model, got: ${text}`,
			);
		});

		test('wire:model.live is not treated as the Alpine `:model` shorthand', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: LIVEWIRE_CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = LIVEWIRE_CONTENT.indexOf('wire:model.live="') + 'wire:'.length + 2;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on wire:model.live, got: ${text}`,
			);
		});

		test('wire:class is not treated as the Alpine `:class` shorthand', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: LIVEWIRE_CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = LIVEWIRE_CONTENT.indexOf('wire:class="') + 'wire:'.length + 2;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on wire:class, got: ${text}`,
			);
		});

		test('Tailwind pseudo-variant classes are not treated as the Alpine `:` shorthand', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: CSS_VARIANT_CONTENT });
			await vscode.window.showTextDocument(doc);

			// Hover inside "text-red-500", the part after the "hover:" variant colon.
			const offset = CSS_VARIANT_CONTENT.indexOf('hover:text-red-500') + 'hover:'.length + 2;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on hover:text-red-500, got: ${text}`,
			);
		});

		test('Blade `@foreach` is not treated as the Alpine `@` shorthand', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: BLADE_DIRECTIVE_CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = BLADE_DIRECTIVE_CONTENT.indexOf('@foreach') + 3;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on @foreach, got: ${text}`,
			);
		});

		test('Blade `@endforeach` is not treated as the Alpine `@` shorthand', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: BLADE_DIRECTIVE_CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = BLADE_DIRECTIVE_CONTENT.indexOf('@endforeach') + 3;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on @endforeach, got: ${text}`,
			);
		});

		test('@click as a real attribute still shows the Alpine `@` shorthand hover', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: BLADE_DIRECTIVE_CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = BLADE_DIRECTIVE_CONTENT.indexOf('@click') + 3;
			const position = doc.positionAt(offset);

			const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				doc.uri,
				position,
			);
			const text = (hovers ?? []).flatMap(h =>
				h.contents.map(c => (typeof c === 'string' ? c : c.value)),
			).join('\n');
			assert.ok(
				text.includes('shorthand for'),
				`[${language}] Expected Alpine shorthand hover on real @click attribute, got: ${text}`,
			);
		});

		test('wire:model. does not offer Alpine :bind modifier completions', async () => {
			const content = '<div wire:model.></div>';
			const doc = await vscode.workspace.openTextDocument({ language, content });
			await vscode.window.showTextDocument(doc);

			const offset = content.indexOf('wire:model.') + 'wire:model.'.length;
			const position = doc.positionAt(offset);

			const list = await vscode.commands.executeCommand<vscode.CompletionList>(
				'vscode.executeCompletionItemProvider',
				doc.uri,
				position,
			);
			const labels = (list?.items ?? []).map(i =>
				typeof i.label === 'string' ? i.label : i.label.label,
			);
			assert.ok(
				!labels.includes('camel') && !labels.includes('attr'),
				`[${language}] Expected no x-bind modifier completions after wire:model., got: ${labels.join(', ')}`,
			);
		});

		test('wire:model="…" does not offer Alpine x-data property completions', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: LIVEWIRE_CONTENT });
			await vscode.window.showTextDocument(doc);

			const offset = LIVEWIRE_CONTENT.indexOf('wire:model="') + 'wire:model="'.length;
			const position = doc.positionAt(offset);

			const list = await vscode.commands.executeCommand<vscode.CompletionList>(
				'vscode.executeCompletionItemProvider',
				doc.uri,
				position,
			);
			// Filter to items tagged by our own directiveValueProvider (detail
			// 'x-data property'), not VS Code's generic word-based suggestions —
			// those offer every word literally present in the document (e.g.
			// "open", "count") regardless of cursor context and aren't a signal
			// of the bug this test guards against.
			const xDataPropItems = (list?.items ?? []).filter(
				i => i.detail === 'x-data property',
			);
			assert.strictEqual(
				xDataPropItems.length,
				0,
				`[${language}] Expected no x-data property completions inside wire:model value, got: ${
					xDataPropItems.map(i => (typeof i.label === 'string' ? i.label : i.label.label)).join(', ')
				}`,
			);
		});

		test('wire:model/.live/wire:class produce no Alpine diagnostics', async () => {
			const doc = await vscode.workspace.openTextDocument({ language, content: LIVEWIRE_CONTENT });
			await vscode.window.showTextDocument(doc);

			// Give the debounced diagnostic pass a chance to run; absence of
			// diagnostics can't be "waited for", so just let the debounce elapse.
			await new Promise(resolve => setTimeout(resolve, 700));
			const diags = vscode.languages.getDiagnostics(doc.uri).filter(
				d => d.source === 'Alpine.js Tools',
			);
			assert.strictEqual(
				diags.length,
				0,
				`[${language}] Expected no Alpine diagnostics for wire:* attributes, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('Prose, script bodies and HTML comments produce no diagnostics', async () => {
			const doc = await openDoc(language, NON_ATTRIBUTE_CONTENT);
			const diags = await alpineDiagnosticsAfterDebounce(doc.uri);

			assert.strictEqual(
				diags.length,
				0,
				`[${language}] Expected no Alpine diagnostics for x-axis/x-ray/x-y/x-large/x-offset outside any tag, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('A real typo among prose is still reported', async () => {
			const doc = await openDoc(language, TYPO_AMONG_PROSE_CONTENT);
			const diags = await getAlpineDiagnostics(doc.uri);

			assert.deepStrictEqual(
				diags.map(d => d.code),
				['unknown-directive'],
				`[${language}] Expected exactly one diagnostic, got: ${diags.map(d => d.message).join('; ')}`,
			);
			assert.ok(
				diags[0].message.includes("'x-dat'"),
				`[${language}] Expected the x-dat typo to be the one reported, got: ${diags[0].message}`,
			);
		});

		test('A typo inside commented-out markup is not reported', async () => {
			const doc = await openDoc(language, COMMENTED_MARKUP_CONTENT);
			const diags = await alpineDiagnosticsAfterDebounce(doc.uri);

			assert.strictEqual(
				diags.length,
				0,
				`[${language}] Expected no Alpine diagnostics inside an HTML comment, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('@click in commented-out markup still hovers', async () => {
			const doc = await openDoc(language, COMMENTED_MARKUP_CONTENT);
			const offset = COMMENTED_MARKUP_CONTENT.indexOf('@click') + 3;
			const text = await hoverTextAt(doc, offset);

			assert.ok(
				text.includes('shorthand for'),
				`[${language}] Expected the Alpine shorthand hover on commented-out markup, got: ${text}`,
			);
		});

		test('Template syntax inside a tag does not hide a real @click', async () => {
			const doc = await openDoc(language, TEMPLATE_ATTRS_CONTENT);

			for (const row of ['Blade', 'Twig', 'Liquid', 'EJS', 'PHP']) {
				const rowEnd = TEMPLATE_ATTRS_CONTENT.indexOf(`>${row}<`);
				const offset = TEMPLATE_ATTRS_CONTENT.lastIndexOf('@click', rowEnd) + 3;
				const text = await hoverTextAt(doc, offset);

				assert.ok(
					text.includes('shorthand for'),
					`[${language}] Expected the Alpine shorthand hover on the ${row} row's @click, got: ${text}`,
				);
			}
		});

		test('An unescaped `<` in prose does not open a tag', async () => {
			const doc = await openDoc(language, PROSE_COMPARISON_CONTENT);
			const diags = await alpineDiagnosticsAfterDebounce(doc.uri);

			assert.strictEqual(
				diags.length,
				0,
				`[${language}] Expected no Alpine diagnostics after a less-than in body text, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('Front matter is not scanned, but the markup below it is', async () => {
			const doc = await openDoc(language, FRONTMATTER_CONTENT);
			const diags = await getAlpineDiagnostics(doc.uri);

			assert.deepStrictEqual(
				diags.map(d => d.message.match(/'(x-[\w-]+)'/)?.[1]),
				['x-dat'],
				`[${language}] Expected only the x-dat typo below the fence, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('Hovering the word x-for in prose still shows its documentation', async () => {
			// Deliberate: hover only ever matches known directive names, so it
			// can't produce the noise the diagnostic did, and explaining
			// `x-for` where someone wrote about it is useful. v1.7.3 narrowed
			// the diagnostic without touching this.
			const content = '<div x-data="{}">\n  <p>Use the x-for directive to loop.</p>\n</div>';
			const doc = await openDoc(language, content);
			const text = await hoverTextAt(doc, content.indexOf('x-for') + 2);

			assert.ok(
				text.includes('x-for'),
				`[${language}] Expected x-for documentation when hovering the word in prose, got: ${text}`,
			);
		});
	});
}

// ─── Astro ────────────────────────────────────────────────────────────────────

// Astro runs the full HTML-family suite above. These cover the two things only
// it has: namespaced attributes of its own, and a TypeScript frontmatter block
// that everything below has to keep working past.
suite('Language: astro (Astro-specific)', () => {
	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension(EXTENSION_ID);
		await ext?.activate();
	});

	test('Astro namespaced attributes are not treated as the Alpine `:` shorthand', async () => {
		const doc = await openDoc('astro', ASTRO_DIRECTIVE_CONTENT);

		for (const attr of ['client:load', 'transition:animate', 'set:html']) {
			const offset = ASTRO_DIRECTIVE_CONTENT.indexOf(attr) + attr.indexOf(':') + 2;
			const text = await hoverTextAt(doc, offset);

			assert.ok(
				!text.includes('shorthand for'),
				`[astro] Expected no Alpine shorthand hover on ${attr}, got: ${text}`,
			);
		}
	});

	test('Astro namespaced attributes produce no diagnostics', async () => {
		const doc = await openDoc('astro', ASTRO_DIRECTIVE_CONTENT);
		const diags = await alpineDiagnosticsAfterDebounce(doc.uri);

		assert.strictEqual(
			diags.length,
			0,
			`[astro] Expected no Alpine diagnostics for client:load/set:html, got: ${diags.map(d => d.message).join('; ')}`,
		);
	});

	test('@click below a frontmatter block still resolves', async () => {
		const doc = await openDoc('astro', ASTRO_DIRECTIVE_CONTENT);
		const offset = ASTRO_DIRECTIVE_CONTENT.indexOf('@click') + 3;
		const text = await hoverTextAt(doc, offset);

		assert.ok(
			text.includes('shorthand for'),
			`[astro] Expected the Alpine shorthand hover below the fence, got: ${text}`,
		);
	});

	test('Directive names complete inside an Astro tag', async () => {
		// `html/customData` supplies this in the other markup languages, but it
		// is read by VS Code's own HTML language service and `.astro` is served
		// by Astro's, so this is the check that the contribution actually
		// reaches the language rather than the assumption that it does.
		const content = '---\nconst a = 1;\n---\n<div x-></div>';
		const doc = await openDoc('astro', content);
		const items = await completionsAt(doc, content.indexOf('<div x-') + 7);
		const directives = items.filter(i => i.detail === 'Alpine.js directive');

		assert.ok(
			labelsOf(directives).includes('x-data'),
			`[astro] Expected an x-data directive completion, got: ${labelsOf(directives).join(', ')}`,
		);
	});

	test('Snippets are offered in an Astro document', async () => {
		// Filtered to our own items: VS Code's word-based suggestions offer
		// every word already in the document, so asserting on the bare label
		// would pass whether or not the snippet was ever contributed.
		const content = 'alpine-dat';
		const doc = await openDoc('astro', content);
		const items = await completionsAt(doc, content.length);
		const snippets = items.filter(i => i.detail === 'Alpine.js snippet');

		assert.ok(
			labelsOf(snippets).includes('alpine-data'),
			`[astro] Expected the alpine-data snippet, got: ${labelsOf(snippets).join(', ')}`,
		);
	});

	test('Directive names are not offered inside the frontmatter block', async () => {
		// The frontmatter is TypeScript. This is the gating that an ungated
		// `contributes.snippets` registration for `astro` could not have done.
		const content = '---\nconst x-\n---\n<div></div>';
		const doc = await openDoc('astro', content);
		const items = await completionsAt(doc, content.indexOf('x-') + 2);
		const directives = items.filter(i => i.detail === 'Alpine.js directive');

		assert.strictEqual(
			directives.length,
			0,
			`[astro] Expected no directive completions in frontmatter, got: ${labelsOf(directives).join(', ')}`,
		);
	});

	test('Markup inside a frontmatter string is not scanned', async () => {
		// `const content = '<p>hi</p>'` is TypeScript, not markup. Pins that
		// the fence skip covers strings that happen to contain tags.
		const content = "---\nconst tpl = '<div x-dat=\"a\"></div>';\n---\n<div x-data=\"{}\"></div>";
		const doc = await openDoc('astro', content);
		const diags = await alpineDiagnosticsAfterDebounce(doc.uri);

		assert.strictEqual(
			diags.length,
			0,
			`[astro] Expected no Alpine diagnostics for markup inside a frontmatter string, got: ${diags.map(d => d.message).join('; ')}`,
		);
	});
});

// ─── Go: templ ────────────────────────────────────────────────────────────────

// A .templ file is Go source with markup inside its `templ` blocks, so this
// fixture puts a directive typo in the markup and two Alpine-shaped false
// positives outside it.
//
// `width<max && x-offset>0` is ordinary Go: a comparison chain whose `<` and
// `>` bracket something the tag scan would otherwise read as an attribute
// region, with `x-offset` — a valid Go subtraction — sitting inside it looking
// exactly like an unknown directive. The same trick appears in the `script`
// block, which holds JavaScript rather than markup. Neither is inside a
// `templ` block, so neither is scanned.
const TEMPL_CONTENT = `
package views

func visible(width, max, x, offset int) bool {
	return width<max && x-offset>0
}

templ Card(open bool) {
	<div x-data="{ open: false }">
		<button @click="open = !open" :aria-expanded="open">Toggle</button>
		<div x-show="open" x-transition></div>
		<span x-dat="count"></span>
		if open {
			<p>Shown</p>
		}
	</div>
}

script hydrate() {
	if (width<max && x-margin>0) {
		console.log("narrow");
	}
}
`.trim();

suite('Language: templ (Go)', () => {
	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension(EXTENSION_ID);
		await ext?.activate();
	});

	test('Directives inside a templ block resolve', async () => {
		const doc = await openDoc('templ', TEMPL_CONTENT);
		const text = await hoverTextAt(doc, TEMPL_CONTENT.indexOf('x-show') + 2);

		assert.ok(
			text.includes('x-show'),
			`[templ] Expected x-show documentation inside a templ block, got: ${text}`,
		);
	});

	test('The @click shorthand resolves inside a templ block', async () => {
		const doc = await openDoc('templ', TEMPL_CONTENT);
		const text = await hoverTextAt(doc, TEMPL_CONTENT.indexOf('@click') + 3);

		assert.ok(
			text.includes('shorthand for'),
			`[templ] Expected the Alpine shorthand hover, got: ${text}`,
		);
	});

	test('Go code and script blocks outside the markup are not scanned', async () => {
		const doc = await openDoc('templ', TEMPL_CONTENT);
		const diags = await alpineDiagnosticsAfterDebounce(doc.uri);
		const messages = diags.map(d => d.message);

		assert.ok(
			!messages.some(m => m.includes('x-offset')),
			`[templ] Expected no diagnostic for the Go comparison chain, got: ${messages.join('; ')}`,
		);
		assert.ok(
			!messages.some(m => m.includes('x-margin')),
			`[templ] Expected no diagnostic inside the script block, got: ${messages.join('; ')}`,
		);
		assert.strictEqual(
			diags.length,
			1,
			`[templ] Expected only the x-dat typo to be reported, got: ${messages.join('; ')}`,
		);
		assert.ok(
			messages[0].includes('x-dat'),
			`[templ] Expected the x-dat typo to be reported, got: ${messages[0]}`,
		);
	});

	test('A Go raw string in an attribute expression does not end the tag', async () => {
		// A templ attribute value can be a Go expression, and a raw string is
		// how one containing quotes gets written. The `<` and `>` inside it are
		// not markup: without the backtick skip they reject the whole tag, and
		// the x-data beside them loses hover and completions. Taken from the
		// shape in templ's own test data (cmd/templ/.../templates.templ).
		const content = [
			'package views',
			'',
			'templ Card() {',
			'\t<div data-json={ `{"a": 1 < 2, "b": 3 > 2}` } x-data="{ open: false }">',
			'\t</div>',
			'}',
		].join('\n');
		const doc = await openDoc('templ', content);
		const text = await hoverTextAt(doc, content.indexOf('x-data') + 2);

		assert.ok(
			text.includes('x-data'),
			`[templ] Expected x-data to survive a raw string in the same tag, got: ${text}`,
		);
	});

	test('Directive names complete inside a templ tag', async () => {
		const content = 'package views\n\ntempl Card() {\n\t<div x-></div>\n}';
		const doc = await openDoc('templ', content);
		const items = await completionsAt(doc, content.indexOf('<div x-') + 7);
		const directives = items.filter(i => i.detail === 'Alpine.js directive');

		assert.ok(
			labelsOf(directives).includes('x-data'),
			`[templ] Expected an x-data directive completion, got: ${labelsOf(directives).join(', ')}`,
		);
	});

	test('Directive names are not offered in the Go region', async () => {
		// The gating an ungated `contributes.snippets` registration could not
		// do: most of a .templ file is Go, not markup.
		const content = 'package views\n\nvar x-\n\ntempl Card() {\n\t<div></div>\n}';
		const doc = await openDoc('templ', content);
		const items = await completionsAt(doc, content.indexOf('var x-') + 6);
		const directives = items.filter(i => i.detail === 'Alpine.js directive');

		assert.strictEqual(
			directives.length,
			0,
			`[templ] Expected no directive completions in Go code, got: ${labelsOf(directives).join(', ')}`,
		);
	});

	test('A templ block that is still being typed still completes', async () => {
		// No closing brace yet, so the block has no end to scan up to. The
		// region runs to the end of the document rather than being dropped.
		const content = 'package views\n\ntempl Card() {\n\t<div x-';
		const doc = await openDoc('templ', content);
		const items = await completionsAt(doc, content.length);
		const directives = items.filter(i => i.detail === 'Alpine.js directive');

		assert.ok(
			labelsOf(directives).includes('x-data'),
			`[templ] Expected completions in an unclosed templ block, got: ${labelsOf(directives).join(', ')}`,
		);
	});
});

// ─── Go: html/template ────────────────────────────────────────────────────────

// Go's `{{ … }}` actions and Hugo's `{{< … >}}` shortcodes both put characters
// the tag scan cares about — including a bare `<` — where markup would
// otherwise be. Both are skipped by the template-construct rule that Twig,
// Liquid, Jinja and Blade already use, which is why the Go family needed no
// scanner work of its own. This pins that.
const GO_TEMPLATE_CONTENT = `
<div x-data="{ open: false }" {{ if .Disabled }}disabled{{ end }}>
  {{< figure src="a.png" >}}
  <button @click="open = !open">Toggle</button>
  <span x-dat="count"></span>
</div>
`.trim();

suite('Language: gohtml (Go template actions)', () => {
	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension(EXTENSION_ID);
		await ext?.activate();
	});

	test('A directive beside a {{ if }} action still resolves', async () => {
		const doc = await openDoc('gohtml', GO_TEMPLATE_CONTENT);
		const text = await hoverTextAt(doc, GO_TEMPLATE_CONTENT.indexOf('x-data') + 2);

		assert.ok(
			text.includes('x-data'),
			`[gohtml] Expected x-data documentation beside a Go action, got: ${text}`,
		);
	});

	test('A Hugo shortcode does not open a bogus tag region', async () => {
		const doc = await openDoc('gohtml', GO_TEMPLATE_CONTENT);
		const diags = await alpineDiagnosticsAfterDebounce(doc.uri);
		const messages = diags.map(d => d.message);

		assert.strictEqual(
			diags.length,
			1,
			`[gohtml] Expected only the x-dat typo to be reported, got: ${messages.join('; ')}`,
		);
		assert.ok(
			messages[0].includes('x-dat'),
			`[gohtml] Expected the x-dat typo to be reported, got: ${messages[0]}`,
		);
	});
});

// ─── JSX / TSX ────────────────────────────────────────────────────────────────

// A KitaJS-style server-rendered component, matching the shape reported in
// issue #5. Uses only long-form directives: `@click` and `:class` are parse
// errors in JSX (TS1003 / TS1382), so they can't appear in a JSX fixture.
// x-dat is an intentional typo to exercise the diagnostic provider.
const JSX_CONTENT = `
export function Cart() {
	return (
		<div x-data="cart">
			<span x-text="$store.cart.count" />
			<button x-on:click="$event.preventDefault(); open = !open">+</button>
			<div x-show="open" x-cloak></div>
			<span x-dat="count"></span>
		</div>
	);
}
`.trim();

// Ordinary TypeScript, containing no JSX at all, that trips every pattern the
// Alpine providers match on:
//
//   x-y > 0            matches the unknown-directive regex exactly
//   'color':theme      matches the bare `:` x-bind shorthand pattern
//   @Injectable()      matches the bare `@` x-on shorthand pattern
//   Map<string,…>      defeats the HTML "nearest unmatched `<`" tag heuristic
//   $                  triggers the magic-property completion provider
//
// Every assertion against this fixture is that the extension stays silent.
// This is the regression suite for activating on typescriptreact at all: it
// has to be inert in a React project that never uses Alpine.
const JSX_PLAIN_TS_CONTENT = `
const x = 10;
const y = 2;
export const diff = x-y > 0 ? 1 : 0;
export const style = { 'color':theme.primary };
export const registry = new Map<string, number>();

@Injectable()
export class CartService {
	constructor(private readonly config: Config) {}
}

export const total = $
`.trim();

async function openDoc(language: string, content: string): Promise<vscode.TextDocument> {
	const doc = await vscode.workspace.openTextDocument({ language, content });
	await vscode.window.showTextDocument(doc);
	return doc;
}

async function hoverTextAt(doc: vscode.TextDocument, offset: number): Promise<string> {
	const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
		'vscode.executeHoverProvider',
		doc.uri,
		doc.positionAt(offset),
	);
	return (hovers ?? []).flatMap(h =>
		h.contents.map(c => (typeof c === 'string' ? c : c.value)),
	).join('\n');
}

async function completionsAt(
	doc: vscode.TextDocument,
	offset: number,
): Promise<vscode.CompletionItem[]> {
	const list = await vscode.commands.executeCommand<vscode.CompletionList>(
		'vscode.executeCompletionItemProvider',
		doc.uri,
		doc.positionAt(offset),
	);
	return list?.items ?? [];
}

function labelsOf(items: vscode.CompletionItem[]): string[] {
	return items.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
}

/** Absence of diagnostics can't be waited for; let the 500ms debounce elapse. */
async function alpineDiagnosticsAfterDebounce(
	uri: vscode.Uri,
): Promise<vscode.Diagnostic[]> {
	await new Promise(resolve => setTimeout(resolve, 700));
	return vscode.languages.getDiagnostics(uri).filter(d => d.source === 'Alpine.js Tools');
}

for (const language of JSX_LANGUAGES) {
	suite(`Language: ${language}`, () => {
		suiteSetup(async () => {
			const ext = vscode.extensions.getExtension(EXTENSION_ID);
			await ext?.activate();
		});

		test('Language is registered in the test host', async () => {
			await assertLanguageRegistered(language);
		});

		test('Diagnostics fire for unknown directive inside a JSX tag', async () => {
			const doc = await openDoc(language, JSX_CONTENT);
			const diags = await getAlpineDiagnostics(doc.uri);
			assert.ok(
				diags.some(d => d.message.includes("'x-dat'")),
				`[${language}] Expected x-dat diagnostic, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('Hover returns x-show documentation', async () => {
			const doc = await openDoc(language, JSX_CONTENT);
			const text = await hoverTextAt(doc, JSX_CONTENT.indexOf('x-show') + 2);
			assert.ok(
				text.includes('x-show'),
				`[${language}] Expected x-show in hover, got: ${text}`,
			);
		});

		test('Hover returns $event documentation', async () => {
			const doc = await openDoc(language, JSX_CONTENT);
			const text = await hoverTextAt(doc, JSX_CONTENT.indexOf('$event') + 2);
			assert.ok(
				text.includes('Event'),
				`[${language}] Expected Event in $event hover, got: ${text}`,
			);
		});

		test('Completion includes $event magic property inside a directive value', async () => {
			const content = JSX_CONTENT.replace('$store.cart.count', '$');
			const doc = await openDoc(language, content);
			const labels = labelsOf(await completionsAt(doc, content.indexOf('$') + 1));
			assert.ok(
				labels.includes('$event'),
				`[${language}] Expected $event in completions, got: ${labels.join(', ')}`,
			);
		});

		test('Directive names complete inside a JSX tag', async () => {
			// html/customData supplies this in HTML-family languages but is
			// never read for .jsx/.tsx, so it comes from attributeCompletionProvider.
			const content = 'export const A = () => <div x-></div>;';
			const doc = await openDoc(language, content);
			const items = await completionsAt(doc, content.indexOf('x-') + 2);
			const directives = items.filter(i => i.detail === 'Alpine.js directive');
			assert.ok(
				labelsOf(directives).includes('x-data'),
				`[${language}] Expected x-data directive completion, got: ${labelsOf(directives).join(', ')}`,
			);
		});

		test('Directive value completions work in a {"…"} expression container', async () => {
			const content =
				'export const A = () => <div x-data="{ open: false }"><span x-text={"o"}></span></div>;';
			const doc = await openDoc(language, content);
			const items = await completionsAt(doc, content.indexOf('{"o"') + 3);
			const props = items.filter(i => i.detail === 'x-data property');
			assert.ok(
				labelsOf(props).includes('open'),
				`[${language}] Expected 'open' x-data property completion, got: ${labelsOf(props).join(', ')}`,
			);
		});

		test('Block snippets are offered outside a JSX tag', async () => {
			const content = 'alpine-data';
			const doc = await openDoc(language, content);
			const items = await completionsAt(doc, content.length);
			assert.ok(
				labelsOf(items.filter(i => i.detail === 'Alpine.js snippet')).includes('alpine-data'),
				`[${language}] Expected alpine-data snippet completion, got: ${labelsOf(items).join(', ')}`,
			);
		});

		// ── Inertness in plain TypeScript ────────────────────────────────────

		test('`x-y` arithmetic produces no diagnostics', async () => {
			const doc = await openDoc(language, JSX_PLAIN_TS_CONTENT);
			const diags = await alpineDiagnosticsAfterDebounce(doc.uri);
			assert.strictEqual(
				diags.length,
				0,
				`[${language}] Expected no Alpine diagnostics in plain TypeScript, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test("`'color':theme` is not treated as the Alpine `:` shorthand", async () => {
			const doc = await openDoc(language, JSX_PLAIN_TS_CONTENT);
			const text = await hoverTextAt(doc, JSX_PLAIN_TS_CONTENT.indexOf("'color':theme") + 9);
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on an object literal key, got: ${text}`,
			);
		});

		test('`@Injectable()` is not treated as the Alpine `@` shorthand', async () => {
			const doc = await openDoc(language, JSX_PLAIN_TS_CONTENT);
			const text = await hoverTextAt(doc, JSX_PLAIN_TS_CONTENT.indexOf('@Injectable') + 3);
			assert.ok(
				!text.includes('shorthand for'),
				`[${language}] Expected no Alpine shorthand hover on a decorator, got: ${text}`,
			);
		});

		test('`$` in plain TypeScript offers no magic properties', async () => {
			const doc = await openDoc(language, JSX_PLAIN_TS_CONTENT);
			const labels = labelsOf(
				await completionsAt(doc, JSX_PLAIN_TS_CONTENT.lastIndexOf('$') + 1),
			);
			assert.ok(
				!labels.includes('$el') && !labels.includes('$store'),
				`[${language}] Expected no Alpine magic completions outside a directive value, got: ${labels.join(', ')}`,
			);
		});

		test('x-transition:enter completes as a directive name', async () => {
			const content = 'export const A = () => <div x-transition:></div>;';
			const doc = await openDoc(language, content);
			const items = await completionsAt(doc, content.indexOf('x-transition:') + 'x-transition:'.length);
			const names = labelsOf(items.filter(i => i.detail === 'Alpine.js directive'));
			assert.ok(
				names.includes('x-transition:enter') && names.includes('x-transition:leave-end'),
				`[${language}] Expected x-transition class API completions, got: ${names.join(', ')}`,
			);
		});

		test('Event modifiers complete after x-on:click.', async () => {
			const content = 'export const A = () => <button x-on:click.></button>;';
			const doc = await openDoc(language, content);
			const items = await completionsAt(doc, content.indexOf('x-on:click.') + 'x-on:click.'.length);
			const mods = labelsOf(items.filter(i => i.detail === 'Alpine modifier'));
			for (const expected of ['outside', 'prevent', 'debounce']) {
				assert.ok(
					mods.includes(expected),
					`[${language}] Expected '${expected}' modifier completion, got: ${mods.join(', ')}`,
				);
			}
		});

		test('Magic snippets are offered in a document that uses Alpine', async () => {
			// The counterpart to the inertness test above: dropping the
			// `contributes.snippets` registration for `javascript` must not cost
			// Alpine authors their `$watch` snippet in an Alpine.data() body.
			const content = "Alpine.data('cart', () => ({\n\tinit() {\n\t\t$\n\t},\n}));";
			const doc = await openDoc(language, content);
			const labels = labelsOf(await completionsAt(doc, content.indexOf('$') + 1));
			assert.ok(
				labels.includes('$watch'),
				`[${language}] Expected $watch snippet in an Alpine document, got: ${labels.join(', ')}`,
			);
		});

		test('Alpine shorthand in a JSX tag is reported with a quick fix', async () => {
			// `@click` / `:class` are parse errors in JSX. TypeScript already
			// refuses them, but says only "Identifier expected" — this names the
			// real problem and offers the long form.
			const content = 'export const A = () => <button @click="go()">x</button>;';
			const doc = await openDoc(language, content);
			const diags = await getAlpineDiagnostics(doc.uri);
			const shorthand = diags.find(d => d.code === 'jsx-shorthand');
			assert.ok(
				shorthand?.message.includes('x-on:click'),
				`[${language}] Expected a jsx-shorthand diagnostic suggesting x-on:click, got: ${diags.map(d => d.message).join('; ')}`,
			);

			const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
				'vscode.executeCodeActionProvider',
				doc.uri,
				shorthand!.range,
			);
			assert.ok(
				(actions ?? []).some(a => a.title === "Replace with 'x-on:click'"),
				`[${language}] Expected a quick fix to x-on:click, got: ${(actions ?? []).map(a => a.title).join(', ')}`,
			);
		});

		test('Alpine shorthand outside a JSX tag is not reported', async () => {
			const doc = await openDoc(language, JSX_PLAIN_TS_CONTENT);
			const diags = await alpineDiagnosticsAfterDebounce(doc.uri);
			assert.strictEqual(
				diags.filter(d => d.code === 'jsx-shorthand').length,
				0,
				`[${language}] Expected no shorthand diagnostics for decorators/object keys, got: ${diags.map(d => d.message).join('; ')}`,
			);
		});

		test('x-data={"…"} container yields property completions', async () => {
			const content =
				'export const A = () => <div x-data={"{ open: false }"}><span x-text="o"></span></div>;';
			const doc = await openDoc(language, content);
			const items = await completionsAt(doc, content.indexOf('x-text="o') + 'x-text="'.length + 1);
			assert.ok(
				labelsOf(items.filter(i => i.detail === 'x-data property')).includes('open'),
				`[${language}] Expected 'open' from an x-data expression container, got: ${labelsOf(items).join(', ')}`,
			);
		});

		test('`x-` outside a JSX tag offers no directive completions', async () => {
			const doc = await openDoc(language, JSX_PLAIN_TS_CONTENT);
			const items = await completionsAt(doc, JSX_PLAIN_TS_CONTENT.indexOf('x-y') + 2);
			const directives = items.filter(i => i.detail === 'Alpine.js directive');
			assert.strictEqual(
				directives.length,
				0,
				`[${language}] Expected no directive completions in plain TypeScript, got: ${labelsOf(directives).join(', ')}`,
			);
		});
	});
}
