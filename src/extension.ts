import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
	initWorkspaceScanner,
	getAlpineDataNames,
	getAlpineDataLocations,
	getAlpineStoreNames,
	getXRefNames,
	getXDataProps,
} from './workspaceScanner';
import { createAlpineDiagnosticProvider } from './diagnosticProvider';
import { createAlpineCodeActionProvider } from './codeActionProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Alpine magic properties ──────────────────────────────────────────────────

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

const MAGIC_MAP = new Map(ALPINE_MAGICS.map(m => [m.label, m]));

// ─── Modifier definitions ─────────────────────────────────────────────────────

interface ModifierDef {
	name: string;
	detail: string;
}

const EVENT_MODIFIERS: ModifierDef[] = [
	{ name: 'prevent', detail: 'Call event.preventDefault()' },
	{ name: 'stop', detail: 'Call event.stopPropagation()' },
	{ name: 'self', detail: 'Only fire if event.target is the element itself' },
	{ name: 'window', detail: 'Add listener to the window object' },
	{ name: 'document', detail: 'Add listener to the document object' },
	{ name: 'once', detail: 'Fire the handler at most once' },
	{ name: 'passive', detail: 'Mark listener as passive (no preventDefault)' },
	{ name: 'debounce', detail: 'Debounce the handler (default 250ms)' },
	{ name: 'throttle', detail: 'Throttle the handler (default 250ms)' },
	{ name: 'camel', detail: 'Convert event name from kebab-case to camelCase' },
	{ name: 'dot', detail: 'Convert dashes in event name to literal dots' },
	// Key modifiers
	{ name: 'enter', detail: 'Fire only on Enter key' },
	{ name: 'escape', detail: 'Fire only on Escape key' },
	{ name: 'space', detail: 'Fire only on Space key' },
	{ name: 'tab', detail: 'Fire only on Tab key' },
	{ name: 'arrow-up', detail: 'Fire only on ArrowUp key' },
	{ name: 'arrow-down', detail: 'Fire only on ArrowDown key' },
	{ name: 'arrow-left', detail: 'Fire only on ArrowLeft key' },
	{ name: 'arrow-right', detail: 'Fire only on ArrowRight key' },
	{ name: 'ctrl', detail: 'Require Ctrl to be held' },
	{ name: 'alt', detail: 'Require Alt to be held' },
	{ name: 'shift', detail: 'Require Shift to be held' },
	{ name: 'meta', detail: 'Require Meta (Cmd/Win) to be held' },
];

const MODEL_MODIFIERS: ModifierDef[] = [
	{ name: 'lazy', detail: 'Sync on change event instead of input' },
	{ name: 'number', detail: 'Cast value to a number' },
	{ name: 'boolean', detail: 'Cast value to a boolean' },
	{ name: 'trim', detail: 'Trim whitespace from value' },
];

const TRANSITION_MODIFIERS: ModifierDef[] = [
	{ name: 'enter', detail: 'Scoped to the enter phase only' },
	{ name: 'leave', detail: 'Scoped to the leave phase only' },
	{ name: 'opacity', detail: 'Transition opacity only' },
	{ name: 'scale', detail: 'Transition scale only (default 95%)' },
	{ name: 'origin-top', detail: 'Set transform-origin to top' },
	{ name: 'origin-top-right', detail: 'Set transform-origin to top right' },
	{ name: 'origin-right', detail: 'Set transform-origin to right' },
	{ name: 'origin-bottom-right', detail: 'Set transform-origin to bottom right' },
	{ name: 'origin-bottom', detail: 'Set transform-origin to bottom' },
	{ name: 'origin-bottom-left', detail: 'Set transform-origin to bottom left' },
	{ name: 'origin-left', detail: 'Set transform-origin to left' },
	{ name: 'origin-top-left', detail: 'Set transform-origin to top left' },
];

const BIND_MODIFIERS: ModifierDef[] = [
	{ name: 'camel', detail: 'Convert attribute name to camelCase' },
	{ name: 'dot', detail: 'Convert dashes in attribute name to dots' },
	{ name: 'attr', detail: 'Force binding as a DOM attribute (not property)' },
];

/**
 * Detects whether the line prefix ends with an Alpine directive modifier
 * position (e.g. `x-model.`, `@click.stop.`, `x-on:keydown.enter.`).
 * Returns the directive base and already-applied modifier names.
 */
function detectModifierContext(
	linePrefix: string,
): { directive: string; applied: string[] } | null {
	const m =
		/(x-model|x-transition|x-on:[\w:-]+|x-bind:[\w:-]+|@[\w:-]+|:[\w:-]+)((?:\.[\w-]*)*)\.[\w-]*$/.exec(
			linePrefix,
		);
	if (!m) { return null; }
	return {
		directive: m[1],
		applied: m[2].split('.').filter(Boolean),
	};
}

// ─── Hover helper ─────────────────────────────────────────────────────────────

function buildHover(
	attr: AlpineAttr,
	range: vscode.Range,
	preamble?: string,
): vscode.Hover {
	const md = new vscode.MarkdownString('', true);
	md.isTrusted = true;
	if (preamble) {
		md.appendMarkdown(`${preamble}\n\n---\n\n`);
	}
	md.appendMarkdown(
		`**\`${attr.name}\`** — Alpine.js directive\n\n${attr.description}`,
	);
	for (const ref of attr.references) {
		md.appendMarkdown(`\n\n[${ref.name}](${ref.url})`);
	}
	return new vscode.Hover(md, range);
}

// ─── activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
	console.log('Alpine.js Tools is now active!');

	// Load Alpine directive metadata from the bundled custom data file
	const dataPath = context.asAbsolutePath(
		path.join('customData', 'alpine.html-data.json'),
	);
	const alpineData: { globalAttributes: AlpineAttr[] } = JSON.parse(
		fs.readFileSync(dataPath, 'utf8'),
	);
	const attrMap = new Map(alpineData.globalAttributes.map(a => [a.name, a]));

	// Kick off workspace scan (non-blocking — results fill the cache async)
	void initWorkspaceScanner(context);

	// ── 0. Diagnostics — unknown Alpine directives ─────────────────────────────
	createAlpineDiagnosticProvider(context);

	// ── 1. Hover — directives and magic properties ─────────────────────────────
	const hoverProvider = vscode.languages.registerHoverProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideHover(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.Hover | undefined {
				// $magic hover — $el, $refs, $store, $watch, etc.
				const magicRange = document.getWordRangeAtPosition(
					position,
					/\$[\w]+/,
				);
				if (magicRange) {
					const magicName = document.getText(magicRange);
					const magic = MAGIC_MAP.get(magicName);
					if (magic) {
						const md = new vscode.MarkdownString(magic.doc, true);
						md.isTrusted = true;
						return new vscode.Hover(md, magicRange);
					}
				}

				// x-* directive
				const xRange = document.getWordRangeAtPosition(
					position,
					/x-[\w.-]+/,
				);
				if (xRange) {
					const baseName = document.getText(xRange).split('.')[0];
					const attr = attrMap.get(baseName);
					if (attr) { return buildHover(attr, xRange); }
				}

				// @ shorthand — show x-on docs with context note
				const atRange = document.getWordRangeAtPosition(
					position,
					/@[\w.-]+/,
				);
				if (atRange) {
					const attr = attrMap.get('x-on');
					if (attr) {
						const eventName = document.getText(atRange).slice(1).split('.')[0];
						return buildHover(
							attr,
							atRange,
							`\`@${eventName}\` is shorthand for \`x-on:${eventName}\``,
						);
					}
				}

				// : shorthand — show x-bind docs with context note
				const colonRange = document.getWordRangeAtPosition(
					position,
					/:[\w.-]+/,
				);
				if (colonRange) {
					const attr = attrMap.get('x-bind');
					if (attr) {
						const propName = document
							.getText(colonRange)
							.slice(1)
							.split('.')[0];
						return buildHover(
							attr,
							colonRange,
							`\`:${propName}\` is shorthand for \`x-bind:${propName}\``,
						);
					}
				}

				return undefined;
			},
		},
	);
	context.subscriptions.push(hoverProvider);

	// ── 2. Magic property completions (triggered by $) ────────────────────────
	const magicCompletionProvider = vscode.languages.registerCompletionItemProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideCompletionItems(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.CompletionItem[] | undefined {
				const linePrefix = document
					.lineAt(position)
					.text.slice(0, position.character);
				const match = /\$\w*$/.exec(linePrefix);
				if (!match) { return undefined; }

				const replaceRange = new vscode.Range(
					new vscode.Position(position.line, match.index),
					position,
				);

				return ALPINE_MAGICS.map(magic => {
					const item = new vscode.CompletionItem(
						magic.label,
						vscode.CompletionItemKind.Property,
					);
					item.range = replaceRange;
					item.detail = magic.detail;
					item.insertText = new vscode.SnippetString(magic.insert);
					const docMd = new vscode.MarkdownString(magic.doc, true);
					docMd.isTrusted = true;
					item.documentation = docMd;
					return item;
				});
			},
		},
		'$',
	);
	context.subscriptions.push(magicCompletionProvider);

	// ── 3. Dot-triggered completions: modifiers + $refs.name + $store.name ────
	const dotCompletionProvider = vscode.languages.registerCompletionItemProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideCompletionItems(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.CompletionItem[] | undefined {
				const linePrefix = document
					.lineAt(position)
					.text.slice(0, position.character);

				// $refs.name — x-ref names from current document
				const refsM = /\$refs\.(\w*)$/.exec(linePrefix);
				if (refsM) {
					const startCol = position.character - refsM[1].length;
					const replaceRange = new vscode.Range(
						new vscode.Position(position.line, startCol),
						position,
					);
					const names = getXRefNames(document.getText());
					if (names.length === 0) { return undefined; }
					return names.map(name => {
						const item = new vscode.CompletionItem(
							name,
							vscode.CompletionItemKind.Field,
						);
						item.range = replaceRange;
						item.detail = 'x-ref';
						item.documentation = new vscode.MarkdownString(
							`DOM element registered with \`x-ref="${name}"\``,
						);
						return item;
					});
				}

				// $store.name — Alpine.store names from workspace
				const storeM = /\$store\.(\w*)$/.exec(linePrefix);
				if (storeM) {
					const startCol = position.character - storeM[1].length;
					const replaceRange = new vscode.Range(
						new vscode.Position(position.line, startCol),
						position,
					);
					const names = getAlpineStoreNames();
					if (names.length === 0) { return undefined; }
					return names.map(name => {
						const item = new vscode.CompletionItem(
							name,
							vscode.CompletionItemKind.Module,
						);
						item.range = replaceRange;
						item.detail = 'Alpine.store';
						item.documentation = new vscode.MarkdownString(
							`Global store registered with \`Alpine.store('${name}', ...)\``,
						);
						return item;
					});
				}

				// Modifier completions inside Alpine directive attribute names
				const modCtx = detectModifierContext(linePrefix);
				if (!modCtx) { return undefined; }

				const { directive, applied } = modCtx;
				let modifiers: ModifierDef[];
				if (directive === 'x-model') {
					modifiers = MODEL_MODIFIERS;
				} else if (directive === 'x-transition') {
					modifiers = TRANSITION_MODIFIERS;
				} else if (
					directive.startsWith('@') ||
					directive.startsWith('x-on:')
				) {
					modifiers = EVENT_MODIFIERS;
				} else if (
					directive.startsWith(':') ||
					directive.startsWith('x-bind:')
				) {
					modifiers = BIND_MODIFIERS;
				} else {
					return undefined;
				}

				// Replace the token being typed after the last dot
				const lastDot = linePrefix.lastIndexOf('.');
				const afterLastDot = linePrefix.slice(lastDot + 1);
				const startCol = position.character - afterLastDot.length;
				const replaceRange = new vscode.Range(
					new vscode.Position(position.line, startCol),
					position,
				);

				return modifiers
					.filter(mod => !applied.includes(mod.name))
					.map(mod => {
						const item = new vscode.CompletionItem(
							mod.name,
							vscode.CompletionItemKind.EnumMember,
						);
						item.range = replaceRange;
						item.detail = 'Alpine modifier';
						item.documentation = new vscode.MarkdownString(mod.detail);
						return item;
					});
			},
		},
		'.',
	);
	context.subscriptions.push(dotCompletionProvider);

	// ── 4. Directive value completions ────────────────────────────────────────
	// In x-data="…": offers Alpine.data component names from the workspace.
	// In other Alpine directives: offers reactive property names from the
	// nearest x-data object literal in the current document.
	const directiveValueProvider = vscode.languages.registerCompletionItemProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideCompletionItems(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.CompletionItem[] | undefined {
				const linePrefix = document
					.lineAt(position)
					.text.slice(0, position.character);

				// Must be inside a quoted Alpine attribute value
				const directiveM =
					/(x-[\w-]+(?::\w+)?|@[\w:-]+|:[\w:-]+)\s*=\s*(["'])([^"']*)$/.exec(
						linePrefix,
					);
				if (!directiveM) { return undefined; }

				const directiveName = directiveM[1];
				const typedValue = directiveM[3];
				const startCol = position.character - typedValue.length;
				const replaceRange = new vscode.Range(
					new vscode.Position(position.line, startCol),
					position,
				);

				// x-data="…" — offer Alpine.data component names
				if (directiveName === 'x-data') {
					const names = getAlpineDataNames();
					if (names.length === 0) { return undefined; }
					return names.map(name => {
						const item = new vscode.CompletionItem(
							name,
							vscode.CompletionItemKind.Function,
						);
						item.range = replaceRange;
						item.detail = 'Alpine.data component';
						item.documentation = new vscode.MarkdownString(
							`References \`Alpine.data('${name}', ...)\` component.`,
						);
						return item;
					});
				}

				// Other directives — offer x-data property names
				const text = document.getText();
				const offset = document.offsetAt(position);
				const props = getXDataProps(text, offset);
				if (props.length === 0) { return undefined; }

				return props.map(prop => {
					const item = new vscode.CompletionItem(
						prop,
						vscode.CompletionItemKind.Property,
					);
					item.range = replaceRange;
					item.detail = 'x-data property';
					return item;
				});
			},
		},
		// No explicit trigger — fires automatically in attribute value context
	);
	context.subscriptions.push(directiveValueProvider);

	// ── 5. Code actions — quick fix for unknown directives ────────────────────
	createAlpineCodeActionProvider(context);

	// ── 6. Definition — x-data="componentName" → Alpine.data('componentName')
	const definitionProvider = vscode.languages.registerDefinitionProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideDefinition(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.Location[] | undefined {
				const line = document.lineAt(position).text;
				const col = position.character;

				// Match x-data="value" or x-data='value' on the current line
				const xDataRe = /x-data=(["'])([^"']*)\1/g;
				let m: RegExpExecArray | null;
				while ((m = xDataRe.exec(line)) !== null) {
					// Only trigger when the cursor is inside the quoted value portion,
					// not on the attribute name itself.
					// m[0] = 'x-data="value"', m[1] = quote char, m[2] = value
					const valueStart = m.index + 'x-data='.length + 1; // after opening quote
					const valueEnd = valueStart + m[2].length;          // before closing quote
					if (col < valueStart || col > valueEnd) { continue; }

					const value = m[2].trim();
					// Only trigger for plain component name references,
					// not inline object literals or expressions.
					if (!value || value.startsWith('{') || value.includes('(')) {
						return undefined;
					}

					const locs = getAlpineDataLocations(value);
					return locs.length ? locs : undefined;
				}
				return undefined;
			},
		},
	);
	context.subscriptions.push(definitionProvider);
}

export function deactivate(): void {
	// Subscriptions disposed automatically
}
