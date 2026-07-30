import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'connorontheweb.alpinejs-tools';

const ALPINE_LANGUAGES = [
	'html', 'ejs', 'php', 'twig', 'nunjucks', 'blade', 'liquid', 'jinja-html',
] as const;

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

for (const language of ALPINE_LANGUAGES) {
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
