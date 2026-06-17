/**
 * Engine runtime configuration.
 *
 * Purpose:
 * Engine-level knobs that affect boot behavior, debug panels, and rendering
 * limits. Story-specific config (starting scene, training rates, etc.) belongs
 * in data/config.json and is merged into this object at boot via Object.assign.
 *
 * Interactions:
 * - Read by src/game/engine.js during boot (after storyConfig merge).
 * - Read by src/game/systems/worldSystem.js for starting location decisions.
 * - Read by src/game/ui/renderers/worldView.js for image rendering.
 */
const Config = {
	// Story-level keys — null/0 defaults overridden by data/config.json at boot.
	starting_scene: null,
	starting_location: null,
	enable_images: true,
	critical_stats: [],
	on_death: null,
	stat_training_diminishing_returns: 0,
	font_scale: 1.0,

	// Engine-level knobs — edit here to change engine behavior.
	show_activity_log: true,
	show_compiled_registry: false,
	max_event_depth: 10,
	global_max_image_width: 800,
	global_max_image_height: 400,
};
