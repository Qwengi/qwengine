/**
 * Event input system for Engine.
 *
 * Purpose:
 * This file contains the runtime semantics for typed event inputs. It lets JSON
 * content declare that an event or scene proceed button requires text before it
 * can run, validates that text, and writes accepted values into game state.
 *
 * Responsibilities:
 * - Normalize event `input` and `inputs` declarations into arrays.
 * - Derive stable input ids from data fields.
 * - Validate required/min/max/pattern constraints.
 * - Apply accepted input values onto entity fields or top-level state fields.
 * - Guard against unsafe property keys when writing data-driven values.
 *
 * Interactions:
 * - Used by src/ui/renderers/worldView.js to enable/disable action buttons.
 * - Used by eventSystem before event changes and teleports are applied.
 * - Writes to Engine.state or entities returned by Engine.getEntity.
 * - Logs validation failures through UI.log when execution is attempted.
 *
 * What does not belong here:
 * - DOM creation for text boxes, visual validation states, event execution order,
 *   stat changes, location movement, or data registry compilation.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before engine.js and contributes methods through the
 *   global EngineInputSystem object.
 * - Methods are mixed into Engine and must use `this`.
 * - Input values are strings; numeric parsing should be modeled as a separate
 *   data-driven action if the engine later needs it.
 *
 * Important APIs:
 * - getEventInputs(eventData)
 * - getInputId(input, index)
 * - validateEventInputs(eventData, payload)
 * - applyEventInputs(eventData, payload, validation)
 *
 * Common risks:
 * - Invalid regex patterns in content can break progression unless caught here.
 * - Writing arbitrary input fields directly into entities must stay guarded
 *   against prototype-pollution keys.
 *
 * Related files:
 * - src/engine/systems/eventSystem.js calls validation and application.
 * - src/ui/renderers/worldView.js builds the matching form controls.
 * - src/engine/dataRegistry.js copies step inputs onto generated scene events.
 */
const EngineInputSystem = {
	getEventInputs: function (eventData) {
		if (!eventData) return [];

		const inputs = [];
		const addInputs = (value) => {
			if (Array.isArray(value)) {
				value.forEach((item) => addInputs(item));
			} else if (value && typeof value === "object") {
				inputs.push(value);
			}
		};

		addInputs(eventData.input);
		addInputs(eventData.inputs);

		return inputs;
	},

	getInputId: function (input, index = 0) {
		return input.id || input.field || input.stat || input.state || `input_${index}`;
	},

	normalizeInputValue: function (input, rawValue) {
		if (rawValue === undefined || rawValue === null) return "";

		const value = String(rawValue);
		return input.trim === false ? value : value.trim();
	},

	validateInputValue: function (input, rawValue) {
		const value = this.normalizeInputValue(input, rawValue);
		const minLength = input.minLength ?? input.min_length;
		const maxLength = input.maxLength ?? input.max_length;

		if (input.required !== false && value.length === 0) {
			return { valid: false, value, message: input.required_msg || "A value is required before proceeding." };
		}

		if (minLength !== undefined && value.length < Number(minLength)) {
			return { valid: false, value, message: input.min_msg || `Enter at least ${minLength} characters.` };
		}

		if (maxLength !== undefined && value.length > Number(maxLength)) {
			return { valid: false, value, message: input.max_msg || `Enter no more than ${maxLength} characters.` };
		}

		if (input.pattern) {
			let matchesPattern = false;

			try {
				matchesPattern = new RegExp(input.pattern).test(value);
			} catch (err) {
				console.warn(`[Engine] Invalid input pattern '${input.pattern}'.`, err);
				return { valid: false, value, message: "The input validation pattern is invalid." };
			}

			if (!matchesPattern) {
				return { valid: false, value, message: input.pattern_msg || "The entered value is not valid." };
			}
		}

		return { valid: true, value };
	},

	validateEventInputs: function (eventData, payload = {}) {
		const inputs = this.getEventInputs(eventData);
		const payloadInputs = payload?.inputs || {};
		const values = {};

		for (let index = 0; index < inputs.length; index++) {
			const input = inputs[index];
			const id = this.getInputId(input, index);
			const rawValue = payloadInputs[id] ?? payload?.[id] ?? "";
			const result = this.validateInputValue(input, rawValue);

			values[id] = result.value;

			if (!result.valid) {
				return { valid: false, message: result.message, values };
			}
		}

		return { valid: true, values };
	},

	isSafeDataKey: function (key) {
		return key && !["__proto__", "constructor", "prototype"].includes(key);
	},

	applyEventInputs: function (eventData, payload = {}, validation = null) {
		const inputs = this.getEventInputs(eventData);
		if (inputs.length === 0) return true;

		const inputValidation = validation || this.validateEventInputs(eventData, payload);
		if (!inputValidation.valid) {
			UI.log(inputValidation.message || "Invalid input.", false, "#f87171");
			return false;
		}

		inputs.forEach((input, index) => {
			const id = this.getInputId(input, index);
			const value = inputValidation.values[id];

			if (input.field) {
				const entityId = input.entity || input.target || "player";
				const entity = this.getEntity(entityId);

				if (!entity) return;
				if (!this.isSafeDataKey(input.field)) {
					console.warn(`[Engine] Unsafe input field '${input.field}' ignored.`);
					return;
				}

				entity[input.field] = value;
				return;
			}

			if (input.state) {
				if (!this.isSafeDataKey(input.state)) {
					console.warn(`[Engine] Unsafe state field '${input.state}' ignored.`);
					return;
				}

				this.state[input.state] = value;
			}
		});

		return true;
	},
};
