import { defineConfig } from '@vscode/test-cli';

/**
 * Companion extensions that register the template language IDs this extension
 * provides for. Without them the test host has no `ejs`/`twig`/`nunjucks`/
 * `blade`/`liquid`/`jinja-html` language, every such document opens as
 * `plaintext`, and no provider is registered for it — so the positive tests
 * fail and, worse, the negative ones ("no Alpine hover appears here") pass
 * vacuously, because nothing appears anywhere.
 *
 * Each ID was verified against its published marketplace manifest to confirm
 * it contributes the exact language ID used in src/constants.ts.
 * `html`, `php`, `javascript`, `javascriptreact` and `typescriptreact` are
 * built into VS Code and need nothing here.
 */
const LANGUAGE_EXTENSIONS = [
	'DigitalBrainstem.javascript-ejs-support', // ejs
	'whatwedo.twig',                           // twig
	'ronnidc.nunjucks',                        // nunjucks
	'onecentlin.laravel-blade',                // blade
	'sissel.shopify-liquid',                   // liquid
	'samuelcolvin.jinjahtml',                  // jinja-html
	'astro-build.astro-vscode',                // astro
];

export default defineConfig({
	files: 'out/test/**/*.test.js',
	installExtensions: LANGUAGE_EXTENSIONS,
});
