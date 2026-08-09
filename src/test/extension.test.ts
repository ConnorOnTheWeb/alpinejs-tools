import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'connorontheweb.alpinejs-tools';

// Kept in sync with src/constants.ts. The two families are exercised by
// separate suites below: the shorthand-related tests only apply to the HTML
// family, since `@click` / `:class` are syntax errors in JSX.
const HTML_LANGUAGES = [
	'html', 'ejs', 'php', 'twig', 'nunjucks', 'blade', 'liquid', 'jinja-html',
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
	});
}

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
			// never read for .jsx/.tsx, so it comes from jsxCompletionProvider.
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
