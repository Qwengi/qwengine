/**
 * Renderer runtime configuration.
 *
 * Purpose:
 * This file defines small, global knobs that affect boot behavior, debugging
 * panels, and image rendering limits. It is data-adjacent configuration for the
 * local engine runtime, not a place for content or game rules.
 *
 * Responsibilities:
 * - Select the starting authored scene or fallback location.
 * - Enable/disable location images.
 * - Toggle activity log and compiled registry debug panels.
 * - Configure event recursion depth and image size constraints.
 *
 * Interactions:
 * - Read by src/engine/engine.js during boot.
 * - Read by src/engine/systems/worldSystem.js for starting location decisions.
 * - Read by src/ui/renderers/worldView.js for image rendering.
 *
 * What does not belong here:
 * - Save state, content definitions, event rules, stat formulas, UI components,
 *   or values that should be moddable through JSON data.
 *
 * Architectural assumptions and constraints:
 * - Config is loaded before engine and UI runtime scripts.
 * - starting_scene takes precedence when it names a compiled scene.
 *
 * Important APIs:
 * - Config.starting_scene
 * - Config.starting_location
 * - Config.max_event_depth
 * - Config.global_max_image_width/global_max_image_height
 *
 * Common risks:
 * - Setting both starting_scene and starting_location can be confusing; the
 *   engine treats starting_location as fallback.
 * - This is global runtime config, so mods should not depend on editing it.
 *
 * Related files:
 * - src/engine/engine.js reads debug/runtime settings.
 * - src/engine/systems/worldSystem.js resolves boot locations.
 * - data/scenes.json and data/locations.json provide target ids.
 */
const Config = {
	starting_scene: "intro",
	starting_location: "player_bedroom",

	enable_images: true,

	show_activity_log: true,
	show_compiled_registry: false,

	max_event_depth: 10,

	global_max_image_width: 800,
	global_max_image_height: 400,
};
