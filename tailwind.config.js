/**
 * Tailwind CSS build configuration.
 *
 * Purpose:
 * This file tells Tailwind which project files contain utility class names and
 * defines the design-system extension point for generated src/output.css.
 *
 * Responsibilities:
 * - Configure content scanning for renderer HTML and JavaScript files.
 * - Provide the theme extension object used by Tailwind.
 * - Register Tailwind plugins when the UI eventually needs them.
 *
 * Interactions:
 * - Used by `npm run build:css` and `npm run watch:css`.
 * - Scans renderer HTML and JavaScript globs, including subsystem files.
 * - Generates styles consumed by src/index.html via src/output.css.
 *
 * What does not belong here:
 * - Runtime game logic, DOM rendering, Electron config, data schemas, or custom
 *   CSS that belongs in src/input.css.
 *
 * Architectural assumptions and constraints:
 * - The project uses generated CSS committed at src/output.css.
 * - New UI folders under src should remain covered by the content glob.
 *
 * Important APIs:
 * - module.exports.content
 * - module.exports.theme.extend
 * - module.exports.plugins
 *
 * Common risks:
 * - Missing a source glob can purge classes used by newly split renderer files.
 * - Adding one-off design tokens here without UI need can make styling harder
 *   to reason about.
 *
 * Related files:
 * - src/input.css is the Tailwind source.
 * - src/output.css is the generated stylesheet.
 * - package.json defines the Tailwind build scripts.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./src/**/*.{html,js}", // Scans all HTML and JS files in the src folder
		"./index.html",
	],
	theme: {
		extend: {},
	},
	plugins: [],
};
