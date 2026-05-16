/**
 * Collapsible left sidebar web component.
 *
 * Purpose:
 * This file defines the <left-sidebar> custom element used by src/index.html to
 * host player stats, traits, equipment, inventory, and save/load panels. The
 * component owns tab chrome, collapse behavior, shadow DOM styling, and icon
 * loading while leaving panel content rendering to the normal light DOM.
 *
 * Responsibilities:
 * - Render sidebar frame, tab handles, and collapsed/expanded behavior.
 * - Observe slotted children and create corresponding tab handles.
 * - Keep active tab visibility in sync with component attributes.
 * - Load SVG tab icons and normalize their colors to currentColor.
 *
 * Interactions:
 * - Used directly by src/index.html as a custom element.
 * - Slotted panel contents are populated by UI renderers and inline save/load UI.
 * - Loads SVG assets by relative URL from the renderer page.
 *
 * What does not belong here:
 * - Game state mutation, player stat rendering, inventory rendering, save/load
 *   logic, event execution, or content data compilation.
 *
 * Architectural assumptions and constraints:
 * - This file is an ES module because index.html loads it with type="module".
 * - The component uses shadow DOM for frame styling but light DOM for panel
 *   content so existing renderers can target slotted element ids.
 * - Children with data-position="bottom" render tab handles after the spacer.
 *
 * Important APIs:
 * - Custom element name: left-sidebar
 * - Attributes: collapsed, active-tab
 * - Child attributes: data-icon, data-label, data-position
 *
 * Common risks:
 * - Moving panel content into shadow DOM would break UI renderers that query
 *   document-level ids.
 * - Icon paths are relative to src/index.html, not this file's folder.
 *
 * Related files:
 * - src/index.html declares the sidebar and slotted panels.
 * - src/ui/renderers/playerPanels.js fills several sidebar panels.
 */
class LeftSidebar extends HTMLElement {
	static get observedAttributes() {
		return ["collapsed", "active-tab"];
	}

	constructor() {
		super();
		this.attachShadow({ mode: "open" });

		this.collapseX = "-350px";
		this.sidebarWidth = "400px";
	}

	connectedCallback() {
		if (!this.hasAttribute("collapsed") && !this.hasAttribute("active-tab")) {
			this.setAttribute("collapsed", "");
		}

		this.render();
		this.setupTabs();

		this.observer = new MutationObserver(() => this.setupTabs());
		this.observer.observe(this, { childList: true });
	}

	disconnectedCallback() {
		if (this.observer) this.observer.disconnect();
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue === newValue) return;

		if (name === "active-tab") {
			this.updateContentVisibility();
			this.updateTabStyles();
		}
	}

	render() {
		this.shadowRoot.innerHTML = /* html */ `
            <style>
                :host {
                    position: fixed;
                    top: 0;
                    left: 0;
                    height: 100%;
                    width: ${this.sidebarWidth};
                    z-index: 1000;
                    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                    transform: translateX(0);
                    display: block;
                    font-family: sans-serif;
                    pointer-events: none; 
                }

                :host([collapsed]) {
                    transform: translateX(${this.collapseX});
                }

                ::slotted(:not([active])) {
					display: none !important;
				}
                ::slotted([active]) {
                    display: flex !important;
                    flex: 1;
                    height: 100%;
                    box-sizing: border-box;
                }

                .container {
                    display: grid;
                    grid-template-columns: 1fr 50px;
                    height: 100%;
                    width: 100%;
                }

                .content-area {
                    background-color: var(--sidebar-bg, white);
                    height: 100%;
                    overflow: hidden; 
                    display: flex;
                    flex-direction: column;
                    box-sizing: border-box;
                    padding: var(--sidebar-padding, 24px); 
                    border-right: 1px solid var(--sidebar-border, rgba(0,0,0,0.1));
                    box-shadow: 2px 0 10px var(--sidebar-shadow, rgba(0,0,0,0.05));
                    pointer-events: auto;
                    position: relative;
                }

                .toggle-column {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding-top: 20px;
                    padding-bottom: 20px;
                    gap: 12px;
                    box-sizing: border-box;
                }

                .tab-handle {
                    width: 65px;
                    height: 65px;
                    background-color: var(--tab-inactive-bg, white);
                    color: var(--tab-icon-color, #555);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    pointer-events: auto;
					border: 1px solid var(--sidebar-border, transparent);
					border-left: none;
					outline: none;
					padding: 0;
                    
                    border-top-right-radius: 12px;
                    border-bottom-right-radius: 12px;
                    box-shadow: 4px 2px 5px var(--sidebar-shadow, rgba(0,0,0,0.1));
                    transition: background-color 0.2s, color 0.2s;
                    position: relative;
                    transform: translateX(0);
                }
                
                :host([collapsed]) .tab-handle {
                    background-color: var(--tab-collapsed-bg, white);
                    color: var(--tab-icon-color, #555);
                }

                .tab-handle:hover, .tab-handle:focus-visible {
                    filter: brightness(1.2);
                    transform: translateX(0);
                }

                .tab-handle.active {
                    background-color: var(--tab-active-bg, white);
                    color: var(--tab-active-icon-color, #000);
					filter: brightness(1);
                    z-index: 20;
                    box-shadow: 6px 2px 8px var(--sidebar-shadow, rgba(0,0,0,0.15)); 
                    transform: translateX(0);
                }

                .tab-handle.active::before {
                    content: '';
                    position: absolute;
                    left: -5px; 
                    top: -1px;
                    width: 10px;
                    height: calc(100% + 2px);
                    background-color: var(--tab-active-bg, white);
                }

                .icon {
                    width: 32px;
                    height: 32px;
                }

                .transparent-space {
                    flex-grow: 1;
                    background-color: transparent;
                }
            </style>

            <div class="container">
                <div class="content-area">
                    <slot></slot>
                </div>
                
                <div class="toggle-column" id="tabs-container" role="tablist" aria-orientation="vertical">
                </div>
            </div>
        `;
	}

	setupTabs() {
		const container = this.shadowRoot.getElementById("tabs-container");
		if (!container) return;

		container.innerHTML = "";
		const children = Array.from(this.children);

		const topFragment = document.createDocumentFragment();
		const bottomFragment = document.createDocumentFragment();
		let tabIndex = 0;

		children.forEach((child) => {
			const position = child.getAttribute("data-position");
			const isButton = child.tagName === "BUTTON";

			let label = child.getAttribute("data-label") || child.getAttribute("title") || child.id;

			if (isButton) {
				if (!label) label = "Action";
			} else {
				if (!label) label = `Tab ${tabIndex + 1}`;
				if (!child.hasAttribute("data-tab-id")) {
					child.setAttribute("data-tab-id", tabIndex.toString());
				}
				tabIndex++;
			}

			const btn = this.createHandle(child, label, isButton);

			if (position === "bottom" || (!position && isButton)) {
				bottomFragment.appendChild(btn);
			} else {
				topFragment.appendChild(btn);
			}
		});

		container.appendChild(topFragment);

		const spacer = document.createElement("div");
		spacer.className = "transparent-space";
		container.appendChild(spacer);

		container.appendChild(bottomFragment);

		this.updateContentVisibility();
		this.updateTabStyles();
	}

	createHandle(child, label, isButton) {
		const btn = document.createElement("button");
		btn.className = "tab-handle";
		btn.title = label;
		btn.setAttribute("aria-label", label);

		const tabId = child.getAttribute("data-tab-id");
		if (!isButton) {
			btn.setAttribute("role", "tab");
			btn.dataset.tabId = tabId;
		}

		const iconColor = child.getAttribute("icon-color");
		const collapsedBgColor = child.getAttribute("collapsed-bg-color");
		const expandedBgColor = child.getAttribute("expanded-bg-color");

		if (iconColor) {
			btn.style.setProperty("--tab-icon-color", iconColor);
			btn.style.setProperty("--tab-active-icon-color", iconColor);
		}
		if (collapsedBgColor) {
			btn.style.setProperty("--tab-collapsed-bg", collapsedBgColor);
		}
		if (expandedBgColor) {
			btn.style.setProperty("--tab-inactive-bg", expandedBgColor);
		}

		btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" stroke-width="2"/></svg>`;

		const iconName = child.getAttribute("data-icon");
		const iconPath = this.getIconPath(iconName);

		if (iconPath) {
			this.loadSvgIcon(iconPath, btn);
		}

		if (isButton) {
			btn.onclick = (e) => {
				e.stopPropagation();
				child.click();
			};
		} else {
			btn.onclick = () => this.handleTabClick(tabId);
			btn.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					this.handleTabClick(tabId);
				}
			};
		}

		return btn;
	}

	getIconPath(iconName) {
		switch (iconName) {
			case "stats":
				return "./static/svg/notes.svg";
			case "traits":
				return "./static/svg/traits.svg";
			case "inventory":
				return "./static/svg/inventory.svg";
			case "home":
				return "./static/svg/home.svg";
			case "settings":
			case "heart-broken":
				return "./static/svg/heart-broken.svg";
			case "heart":
				return "./static/svg/heart.svg";
			case "save":
				return "./static/svg/align-bottom-svgrepo-com.svg";
			case "user":
				return "./static/svg/user.svg";
			case "logout":
				return "./static/svg/logout.svg";
			default:
				return null;
		}
	}

	async loadSvgIcon(url, btnElement) {
		if (!LeftSidebar.iconCache) {
			LeftSidebar.iconCache = new Map();
		}

		try {
			let svgText;
			if (LeftSidebar.iconCache.has(url)) {
				svgText = LeftSidebar.iconCache.get(url);
			} else {
				const response = await fetch(url);
				if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
				svgText = await response.text();
				LeftSidebar.iconCache.set(url, svgText);
			}

			const parser = new DOMParser();
			const doc = parser.parseFromString(svgText, "image/svg+xml");
			const svgElement = doc.querySelector("svg");

			if (svgElement) {
				svgElement.classList.add("icon");
				svgElement.removeAttribute("width");
				svgElement.removeAttribute("height");

				const allElements = [svgElement, ...svgElement.querySelectorAll("*")];
				allElements.forEach((el) => {
					if (el.hasAttribute("stroke") && el.getAttribute("stroke") !== "none") {
						el.setAttribute("stroke", "currentColor");
					}
					if (el.hasAttribute("fill") && el.getAttribute("fill") !== "none") {
						el.setAttribute("fill", "currentColor");
					}
					if (el.style && el.style.fill && el.style.fill !== "none") {
						el.style.fill = "currentColor";
					}
					if (el.style && el.style.stroke && el.style.stroke !== "none") {
						el.style.stroke = "currentColor";
					}
				});

				btnElement.innerHTML = "";
				btnElement.appendChild(svgElement);
			}
		} catch (error) {
			console.warn(`LeftSidebar: Failed to load icon from ${url}`, error);
		}
	}

	handleTabClick(id) {
		const isCollapsed = this.hasAttribute("collapsed");
		const currentActive = this.getAttribute("active-tab");

		if (isCollapsed) {
			this.removeAttribute("collapsed");
			this.setAttribute("active-tab", id);
		} else {
			if (currentActive === id) {
				this.setAttribute("collapsed", "");
			} else {
				this.setAttribute("active-tab", id);
			}
		}
	}

	updateTabStyles() {
		const activeId = this.getAttribute("active-tab");
		const handles = this.shadowRoot.querySelectorAll('.tab-handle[role="tab"]');

		handles.forEach((handle) => {
			if (handle.dataset.tabId === activeId) {
				handle.classList.add("active");
				handle.setAttribute("aria-selected", "true");
			} else {
				handle.classList.remove("active");
				handle.setAttribute("aria-selected", "false");
			}
		});
	}

	updateContentVisibility() {
		const activeId = this.getAttribute("active-tab");

		Array.from(this.children).forEach((child) => {
			if (child.tagName !== "BUTTON" && child.getAttribute("data-tab-id") === activeId) {
				child.setAttribute("active", "");
			} else {
				child.removeAttribute("active");
			}
		});
	}
}

customElements.define("left-sidebar", LeftSidebar);
