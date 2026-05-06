import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const ALPINE_LANGUAGES = ['html', 'ejs', 'php', 'twig', 'nunjucks', 'blade'];

interface AlpineAttr {
	name: string;
	description: string;
	references: Array<{ name: string; url: string }>;
}

interface MagicDef {
	label: string;
	detail: string;
	doc: string;
	insert: string;
}

const ALPINE_MAGICS: MagicDef[] = [
	{
		label: '$el',
		detail: 'HTMLElement',
		doc: 'The root DOM element of the current Alpine component.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/el)',
		insert: '\\$el',
	},
	{
		label: '$refs',
		detail: 'Record<string, HTMLElement>',
		doc: 'Access DOM elements marked with `x-ref` by name.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/refs)',
		insert: '\\$refs.${1:name}',
	},
	{
		label: '$store',
		detail: 'any',
		doc: 'Access a global store registered with `Alpine.store()`.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/store)',
		insert: '\\$store.${1:storeName}',
	},
	{
		label: '$watch',
		detail: '(property: string, callback: (value: any) => void) => void',
		doc: 'Watch a data property and run a callback when it changes.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/watch)',
		insert: "\\$watch('${1:property}', (value) => {\n\t$0\n})",
	},
	{
		label: '$dispatch',
		detail: '(event: string, detail?: any) => void',
		doc: 'Dispatch a custom DOM event from the current element.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/dispatch)',
		insert: "\\$dispatch('${1:event}'${2:, { $3 }})",
	},
	{
		label: '$nextTick',
		detail: '(callback?: () => void) => Promise<void>',
		doc: 'Execute a callback after Alpine has finished updating the DOM.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/nexttick)',
		insert: "\\$nextTick(() => {\n\t$0\n})",
	},
	{
		label: '$root',
		detail: 'HTMLElement',
		doc: 'The nearest ancestor element with `x-data`.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/root)',
		insert: '\\$root',
	},
	{
		label: '$data',
		detail: 'Record<string, any>',
		doc: 'The full reactive data object of the current component.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/data)',
		insert: '\\$data',
	},
	{
		label: '$id',
		detail: '(name: string, key?: number | string) => string',
		doc: 'Generate a unique, scoped ID string. Used with `x-id`.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/id)',
		insert: "\\$id('${1:name}')",
	},
];

function buildHover(attr: AlpineAttr, range: vscode.Range, preamble?: string): vscode.Hover {
	const md = new vscode.MarkdownString('', true);
	md.isTrusted = true;
	if (preamble) {
		md.appendMarkdown(`${preamble}\n\n---\n\n`);
	}
	md.appendMarkdown(`**\`${attr.name}\`** — Alpine.js directive\n\n${attr.description}`);
	for (const ref of attr.references) {
		md.appendMarkdown(`\n\n[${ref.name}](${ref.url})`);
	}
	return new vscode.Hover(md, range);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Alpine.js Tools is now active!');

	// Load Alpine directive metadata from the bundled custom data file
	const dataPath = context.asAbsolutePath(path.join('customData', 'alpine.html-data.json'));
	const alpineData: { globalAttributes: AlpineAttr[] } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
	const attrMap = new Map(alpineData.globalAttributes.map(a => [a.name, a]));

	// ── Hover Provider ────────────────────────────────────────────────────────
	// Covers x-* directives and @ / : shorthands across all supported languages.
	const hoverProvider = vscode.languages.registerHoverProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideHover(document: vscode.TextDocument, position: vscode.Position) {
				// x-* directive (x-show, x-model, x-transition.enter, etc.)
				const xRange = document.getWordRangeAtPosition(position, /x-[\w.-]+/);
				if (xRange) {
					const baseName = document.getText(xRange).split('.')[0];
					const attr = attrMap.get(baseName);
					if (attr) { return buildHover(attr, xRange); }
				}

				// @ shorthand — show x-on docs with context note
				const atRange = document.getWordRangeAtPosition(position, /@[\w.-]+/);
				if (atRange) {
					const attr = attrMap.get('x-on');
					if (attr) {
						const eventName = document.getText(atRange).slice(1).split('.')[0];
						return buildHover(attr, atRange, `\`@${eventName}\` is shorthand for \`x-on:${eventName}\``);
					}
				}

				// : shorthand — show x-bind docs with context note
				const colonRange = document.getWordRangeAtPosition(position, /:[\w.-]+/);
				if (colonRange) {
					const attr = attrMap.get('x-bind');
					if (attr) {
						const propName = document.getText(colonRange).slice(1).split('.')[0];
						return buildHover(attr, colonRange, `\`:${propName}\` is shorthand for \`x-bind:${propName}\``);
					}
				}
			}
		}
	);
	context.subscriptions.push(hoverProvider);

	// ── Magic Property Completion Provider ───────────────────────────────────
	// Triggers on '$' in HTML, EJS, and JS files. Returns all Alpine magic
	// properties as completion items with SnippetString insert text so tab
	// stops work for $watch, $dispatch, $nextTick, $refs, and $store.
	const completionProvider = vscode.languages.registerCompletionItemProvider(
		['html', 'ejs', 'javascript'].map(lang => ({ language: lang })),
		{
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
				const linePrefix = document.lineAt(position).text.slice(0, position.character);

				// Match a $ followed by optional word characters (e.g. '$', '$re', '$refs')
				const match = /\$\w*$/.exec(linePrefix);
				if (!match) { return undefined; }

				// Replace from the '$' back to the cursor so typing '$re' → '$refs' works
				const replaceRange = new vscode.Range(
					new vscode.Position(position.line, match.index),
					position
				);

				// TODO: Future — scan workspace HTML/template files to resolve concrete
				// $store key names and $refs element names, enabling context-aware
				// completions that list your actual store properties and ref names.

				return ALPINE_MAGICS.map(magic => {
					const item = new vscode.CompletionItem(magic.label, vscode.CompletionItemKind.Property);
					item.range = replaceRange;
					item.detail = magic.detail;
					item.insertText = new vscode.SnippetString(magic.insert);
					const docMd = new vscode.MarkdownString(magic.doc, true);
					docMd.isTrusted = true;
					item.documentation = docMd;
					return item;
				});
			}
		},
		'$'
	);
	context.subscriptions.push(completionProvider);
}

export function deactivate() {}

