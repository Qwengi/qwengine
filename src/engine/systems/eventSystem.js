/**
 * Event execution system for Engine.
 *
 * Purpose:
 * This file owns the sequence of operations that happens when content triggers
 * an event. Events are the bridge between authored JSON actions and runtime
 * state mutation, so this module coordinates validation, chance branches,
 * changes, input application, death/reset checks, teleports, and rerenders.
 *
 * Responsibilities:
 * - Look up event definitions from Engine.data.events.
 * - Enforce recursion depth limits.
 * - Check event conditions before execution.
 * - Validate and apply event inputs.
 * - Resolve chance failures into alternate events/messages/teleports.
 * - Convert shorthand single-action fields into standard change entries.
 * - Apply changes, log event messages, and move/render afterward.
 *
 * Interactions:
 * - Uses inputSystem, entitySystem, worldSystem, and UI.
 * - Reads Engine.settings.max_event_depth and Engine.data.events.
 * - Writes state indirectly through applyEventInputs, applyChanges, and moveTo.
 *
 * What does not belong here:
 * - The internals of stat math, inventory manipulation, typed input rendering,
 *   raw JSON compilation, or save/load state reconciliation.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before engine.js and contributes methods through the
 *   global EngineEventSystem object.
 * - Methods are mixed into Engine and must use `this`.
 * - Event execution order is gameplay-visible; change it only deliberately.
 *
 * Important APIs:
 * - triggerEvent(eventId, payload, depth)
 *
 * Common risks:
 * - Recursive events can loop forever without the max depth guard.
 * - Moving input application after changes can alter content semantics.
 * - Teleporting must avoid an extra rerender before moveTo handles rendering.
 *
 * Related files:
 * - src/engine/systems/inputSystem.js validates typed event input.
 * - src/engine/systems/entitySystem.js applies event changes.
 * - src/engine/systems/worldSystem.js handles event teleports.
 * - src/ui/renderers/worldView.js calls triggerEvent from action buttons.
 */
const EngineEventSystem = {
	triggerEvent: function (eventId, payload = {}, depth = 0) {
		if (typeof payload === "number") {
			depth = payload;
			payload = {};
		}

		if (depth > this.settings.max_event_depth) {
			console.warn(`[Engine] Max recursion reached at '${eventId}'.`);
			return;
		}

		const ev = this.data.events[eventId];
		if (!ev) {
			console.warn(`[Engine] Unknown event '${eventId}'.`);
			return;
		}

		if (!this.checkConditions(ev.conditions)) return;

		const inputValidation = this.validateEventInputs(ev, payload);
		if (!inputValidation.valid) {
			UI.log(inputValidation.message || "Invalid input.", false, "#f87171");
			return;
		}

		if (ev.chance && !this.calculateChance(ev.chance)) {
			if (ev.chance.trigger_msg) UI.log(ev.chance.trigger_msg);
			if (ev.chance.trigger_event) this.triggerEvent(ev.chance.trigger_event, {}, depth + 1);
			if (ev.chance.trigger_teleport) this.moveTo(ev.chance.trigger_teleport);
			return;
		}

		const changes = Array.isArray(ev.changes) ? [...ev.changes] : [];

		if (ev.action) {
			changes.push({
				entity: ev.entity || "player",
				stat: ev.stat,
				trait: ev.trait,
				action: ev.action,
				amount: ev.amount,
			});
		}

		this.applyEventInputs(ev, payload, inputValidation);
		this.applyChanges(changes);

		if (ev.msg) UI.log(ev.msg, true);

		if ((this.getStatValue("hp", "player", true) ?? Number.MAX_SAFE_INTEGER) <= 0) {
			UI.log("You have died! Resetting...", true, "#ef4444");
			this.resetState();
		}

		if (ev.teleport) this.moveTo(ev.teleport);
		else UI.renderView(this.data, this.state);
	},
};
