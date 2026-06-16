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
	});
}
