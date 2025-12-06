/**
 * mape's helpers - ComfyUI Extension
 *
 * Provides quality-of-life improvements including:
 * - Variable (wireless) nodes for cleaner workflows
 * - Prompt tweaking
 * - Image preview
 * - Fuzzy search
 * - Error reporting
 *
 * @version 0.5.2
 * @author mape
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ============================================================================
// Constants
// ============================================================================

const EXTENSION_NAME = "mape.helpers";
const NODE_TYPE = "mape Variable";
const STORAGE_PREFIX = "mape_";

// Colors for setter/getter nodes
const SETTER_COLOR = "#2a4a2a";  // Dark green
const GETTER_COLOR = "#4a2a4a";  // Dark purple
const SETTER_TITLE_COLOR = "#4a8a4a";  // Lighter green
const GETTER_TITLE_COLOR = "#8a4a8a";  // Lighter purple

// ============================================================================
// Settings
// ============================================================================

const defaultSettings = {
    showConnectionLines: { value: true, label: "Show connection lines for variables" },
    showConnectionOnNodeHover: { value: true, label: "Show connection on node hover" },
    showAllConnectionsOnNodeHover: { value: false, label: "Show all connections on hover" },
    dblClickToRename: { value: true, label: "Double-click node title to rename" },
    promptForVariableName: { value: true, label: "Prompt for variable name on creation" },
    ignorePromptForExplodeHeal: { value: false, label: "Skip prompt when converting links" },
    organizeSpacingX: { value: 30, label: "Organize spacing X" },
    organizeSpacingY: { value: 20, label: "Organize spacing Y" },
    collapseOnOrganize: { value: false, label: "Collapse nodes when organizing" },
    replaceSearch: { value: false, label: "Replace search with fuzzy search" },
};

let settings = {};

function loadSettings() {
    try {
        const stored = localStorage.getItem(`${STORAGE_PREFIX}settings`);
        if (stored) {
            const parsed = JSON.parse(stored);
            for (const [key, def] of Object.entries(defaultSettings)) {
                settings[key] = parsed[key] !== undefined ? parsed[key] : def.value;
            }
        } else {
            for (const [key, def] of Object.entries(defaultSettings)) {
                settings[key] = def.value;
            }
        }
    } catch (e) {
        console.warn("[mape] Failed to load settings:", e);
        for (const [key, def] of Object.entries(defaultSettings)) {
            settings[key] = def.value;
        }
    }
}

function saveSettings() {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(settings));
    } catch (e) {
        console.warn("[mape] Failed to save settings:", e);
    }
}

function getSetting(name) {
    return settings[name];
}

// ============================================================================
// Utility Functions
// ============================================================================

function getNodes() {
    return app.graph?._nodes || [];
}

function getNodeById(id) {
    return app.graph?.getNodeById(id);
}

function getLinkById(id) {
    return app.graph?.links?.[id];
}

function isMapeVariableNode(node) {
    return node && (node.type === NODE_TYPE || node.comfyClass === NODE_TYPE);
}

function getVariableName(node) {
    if (!isMapeVariableNode(node)) return null;
    const widget = node.widgets?.find(w => w.name === "name");
    return widget?.value || "";
}

function setVariableName(node, name) {
    if (!isMapeVariableNode(node)) return;
    const widget = node.widgets?.find(w => w.name === "name");
    if (widget) {
        widget.value = name;
    }
}

function isNodeSetter(node) {
    if (!isMapeVariableNode(node)) return false;
    // A setter has an input connection
    return node.inputs?.some(input => input.link != null);
}

function isNodeGetter(node) {
    if (!isMapeVariableNode(node)) return false;
    // A getter has output connections but no input
    const hasOutput = node.outputs?.some(output => output.links?.length > 0);
    const hasInput = node.inputs?.some(input => input.link != null);
    return hasOutput && !hasInput;
}

function getMapeNodes() {
    return getNodes().filter(isMapeVariableNode);
}

function getSetterByName(name) {
    return getMapeNodes().find(node => isNodeSetter(node) && getVariableName(node) === name);
}

function getGettersByName(name) {
    return getMapeNodes().filter(node => isNodeGetter(node) && getVariableName(node) === name);
}

// Get all unique variable names in use
function getVariableNames() {
    const names = new Set();
    for (const node of getMapeNodes()) {
        const name = getVariableName(node);
        if (name) names.add(name);
    }
    return Array.from(names).sort();
}

// ============================================================================
// Node Appearance
// ============================================================================

function updateNodeAppearance(node) {
    if (!isMapeVariableNode(node)) return;

    const isSetter = isNodeSetter(node);
    const isGetter = isNodeGetter(node);

    if (isSetter) {
        node.color = SETTER_COLOR;
        node.bgcolor = SETTER_COLOR;
    } else if (isGetter) {
        node.color = GETTER_COLOR;
        node.bgcolor = GETTER_COLOR;
    } else {
        // Unconnected - neutral color
        node.color = "#353535";
        node.bgcolor = "#353535";
    }
}

// ============================================================================
// Link Resolution for Execution
// ============================================================================

/**
 * Resolves mape Variable links in the workflow.
 * This rewrites getter node connections to point to the actual setter source.
 */
function resolveVariableLinks(nodes, links) {
    const nodeById = {};
    const nodeSet = {};  // name -> setter node info
    const nodeGet = {};  // getter id -> variable name
    const internalLinks = {};  // setter id -> [getter ids]

    for (const node of nodes) {
        nodeById[node.id] = node;

        if (node.type !== NODE_TYPE) continue;

        const name = node.widgets_values?.[0] || "";
        if (!name) continue;

        // Check if this is a setter (has input link)
        const hasInput = node.inputs?.some(input => {
            if (input.link == null) return false;
            const link = links[input.link];
            return link != null;
        });

        if (hasInput) {
            // This is a setter
            for (const input of node.inputs || []) {
                if (input.link != null) {
                    const link = links[input.link];
                    if (link) {
                        nodeSet[name] = {
                            originId: link.origin_id,
                            originIndex: link.origin_slot
                        };
                    }
                }
            }
            internalLinks[node.id] = [];
        } else {
            // This is a getter
            nodeGet[node.id] = name;
            const setter = Object.entries(nodeSet).find(([n]) => n === name);
            if (setter) {
                // Track internal links for visualization
                const setterNode = nodes.find(n =>
                    n.type === NODE_TYPE &&
                    n.widgets_values?.[0] === name &&
                    n.inputs?.some(i => i.link != null)
                );
                if (setterNode && internalLinks[setterNode.id]) {
                    internalLinks[setterNode.id].push(node.id);
                }
            }
        }
    }

    return { nodeSet, nodeGet, internalLinks };
}

// ============================================================================
// Link Conversion
// ============================================================================

/**
 * Convert a regular link to a setter/getter pair
 */
function convertLinkToVariables(link, variableName) {
    if (!link) return;

    const originNode = getNodeById(link.origin_id);
    const targetNode = getNodeById(link.target_id);

    if (!originNode || !targetNode) return;

    // Remove the original link
    app.graph.removeLink(link.id);

    // Create setter node
    const setterNode = LiteGraph.createNode(NODE_TYPE);
    const originPos = originNode.getConnectionPos(false, link.origin_slot);
    setterNode.pos = [originPos[0] + 50, originPos[1] - 10];
    app.graph.add(setterNode);
    setVariableName(setterNode, variableName);

    // Connect origin to setter
    originNode.connect(link.origin_slot, setterNode, 1);  // Input 1 is the wildcard

    // Create getter node
    const getterNode = LiteGraph.createNode(NODE_TYPE);
    const targetPos = targetNode.getConnectionPos(true, link.target_slot);
    getterNode.pos = [targetPos[0] - 150, targetPos[1] - 10];
    app.graph.add(getterNode);
    setVariableName(getterNode, variableName);

    // Connect getter to target
    getterNode.connect(0, targetNode, link.target_slot);

    // Update appearance
    setTimeout(() => {
        updateNodeAppearance(setterNode);
        updateNodeAppearance(getterNode);
        app.graph.setDirtyCanvas(true, true);
    }, 50);
}

/**
 * Convert a variable pair back to a direct link
 */
function convertVariablesToLink(setterNode) {
    if (!isMapeVariableNode(setterNode) || !isNodeSetter(setterNode)) return;

    const name = getVariableName(setterNode);
    const getters = getGettersByName(name);

    // Get the source of the setter
    const setterInput = setterNode.inputs?.find(i => i.link != null);
    if (!setterInput) return;

    const setterLink = getLinkById(setterInput.link);
    if (!setterLink) return;

    const sourceNode = getNodeById(setterLink.origin_id);
    const sourceSlot = setterLink.origin_slot;

    // Reconnect each getter's targets to the original source
    for (const getter of getters) {
        const getterOutput = getter.outputs?.[0];
        if (!getterOutput?.links?.length) continue;

        for (const linkId of [...getterOutput.links]) {
            const link = getLinkById(linkId);
            if (!link) continue;

            const targetNode = getNodeById(link.target_id);
            const targetSlot = link.target_slot;

            // Remove getter connection
            app.graph.removeLink(linkId);

            // Create direct connection
            if (sourceNode && targetNode) {
                sourceNode.connect(sourceSlot, targetNode, targetSlot);
            }
        }

        // Remove the getter node
        app.graph.remove(getter);
    }

    // Remove the setter node
    app.graph.remove(setterNode);

    app.graph.setDirtyCanvas(true, true);
}

// ============================================================================
// Toolbar UI
// ============================================================================

let toolbarElement = null;
let toolbarVisible = true;

function createToolbar() {
    if (toolbarElement) return;

    toolbarElement = document.createElement("div");
    toolbarElement.className = "mape-toolbar";
    toolbarElement.innerHTML = `
        <style>
            .mape-toolbar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 30px;
                background: linear-gradient(to bottom, #353535, #313131 30%, #333);
                border-bottom: 1px solid #444;
                display: flex;
                align-items: center;
                font-size: 13px;
                z-index: 1000;
                font-family: arial, sans-serif;
                color: #fff;
                padding: 0 10px;
                gap: 10px;
                box-sizing: border-box;
            }
            .mape-toolbar.hidden {
                display: none;
            }
            .mape-toolbar::after {
                content: '';
                display: block;
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                height: 10px;
                background: linear-gradient(to bottom, rgba(0,0,0,0.2), transparent);
                pointer-events: none;
            }
            .mape-toolbar .logo {
                width: 20px;
                height: 20px;
                background: url(https://comfyui.ma.pe/logo.svg) center/contain no-repeat;
                cursor: pointer;
                flex-shrink: 0;
            }
            .mape-toolbar .logo:hover {
                transform: scale(1.1);
            }
            .mape-toolbar .variables {
                display: flex;
                gap: 8px;
                flex-wrap: nowrap;
                overflow-x: auto;
                flex: 1;
            }
            .mape-toolbar .variable {
                display: flex;
                align-items: center;
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                padding: 2px 8px;
                font-size: 11px;
                cursor: pointer;
                white-space: nowrap;
            }
            .mape-toolbar .variable:hover {
                background: rgba(255,255,255,0.1);
            }
            .mape-toolbar .variable.setter {
                border-left: 3px solid ${SETTER_TITLE_COLOR};
            }
            .mape-toolbar .variable.getter {
                border-left: 3px solid ${GETTER_TITLE_COLOR};
            }
            .mape-toolbar .actions {
                display: flex;
                gap: 5px;
                flex-shrink: 0;
            }
            .mape-toolbar .action-btn {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                color: #fff;
                padding: 3px 8px;
                font-size: 11px;
                cursor: pointer;
            }
            .mape-toolbar .action-btn:hover {
                background: rgba(255,255,255,0.1);
            }
            .mape-toggle {
                position: fixed;
                top: 0;
                right: 0;
                width: 8px;
                height: 30px;
                background: #4b4b4b;
                z-index: 1001;
                cursor: pointer;
                border-radius: 4px 0 0 4px;
            }
            .mape-toggle:hover {
                background: #5b5b5b;
            }
        </style>
        <div class="logo" title="mape's helpers"></div>
        <div class="variables"></div>
        <div class="actions">
            <button class="action-btn" id="mape-preview" title="Open image preview (Cmd+Shift+P)">🖼️</button>
            <button class="action-btn" id="mape-tweak" title="Add selected text node to prompt tweaker">📝 Tweak</button>
            <button class="action-btn" id="mape-explode" title="Convert links to variables (Shift+click link)">Split</button>
            <button class="action-btn" id="mape-heal" title="Convert variables back to links">Join</button>
            <button class="action-btn" id="mape-settings" title="Settings">⚙️</button>
        </div>
    `;

    document.body.appendChild(toolbarElement);

    // Create toggle button
    const toggle = document.createElement("div");
    toggle.className = "mape-toggle";
    toggle.title = "Toggle mape toolbar";
    toggle.onclick = () => {
        toolbarVisible = !toolbarVisible;
        toolbarElement.classList.toggle("hidden", !toolbarVisible);
        localStorage.setItem(`${STORAGE_PREFIX}toolbar_visible`, toolbarVisible);
    };
    document.body.appendChild(toggle);

    // Restore visibility
    const stored = localStorage.getItem(`${STORAGE_PREFIX}toolbar_visible`);
    if (stored === "false") {
        toolbarVisible = false;
        toolbarElement.classList.add("hidden");
    }

    // Setup action buttons
    document.getElementById("mape-preview").onclick = () => {
        const images = collectExecutedImages();
        if (images.length > 0) {
            showImagePreview(images);
        } else {
            alert("No images found. Run a workflow first.");
        }
    };

    document.getElementById("mape-tweak").onclick = () => {
        // Add selected node's text widget to prompt tweaker
        const selected = app.canvas.selected_nodes;
        if (!selected || Object.keys(selected).length === 0) {
            alert("Select a node with a text widget (like CLIP Text Encode) to add to prompt tweaker.");
            return;
        }

        let added = 0;
        for (const node of Object.values(selected)) {
            // Find text widgets
            for (const widget of node.widgets || []) {
                if (widget.type === "customtext" || widget.type === "text" ||
                    (typeof widget.value === "string" && widget.value.length > 10)) {
                    createPromptTweaker(node, widget);
                    added++;
                    break;  // Only add first text widget per node
                }
            }
        }

        if (added === 0) {
            alert("No text widgets found in selected nodes.");
        } else {
            updatePromptTweakers();
        }
    };

    document.getElementById("mape-explode").onclick = () => {
        // Convert all links from selected nodes
        const selected = app.canvas.selected_nodes;
        if (!selected || Object.keys(selected).length === 0) {
            alert("Select nodes first, then click Split to convert their output links to variables.");
            return;
        }

        for (const node of Object.values(selected)) {
            for (const output of node.outputs || []) {
                if (!output.links?.length) continue;
                for (const linkId of [...output.links]) {
                    const link = getLinkById(linkId);
                    if (!link) continue;

                    let name = node.title || node.type;
                    if (getSetting("promptForVariableName")) {
                        name = prompt("Variable name:", name);
                        if (!name) continue;
                    }

                    convertLinkToVariables(link, name);
                }
            }
        }
    };

    document.getElementById("mape-heal").onclick = () => {
        const setters = getMapeNodes().filter(isNodeSetter);
        if (setters.length === 0) {
            alert("No variable setters found to convert.");
            return;
        }

        if (!confirm(`Convert ${setters.length} variable(s) back to direct links?`)) {
            return;
        }

        for (const setter of [...setters]) {
            convertVariablesToLink(setter);
        }
    };

    document.getElementById("mape-settings").onclick = () => {
        showSettingsDialog();
    };

    // Initial update
    updateToolbar();
}

function updateToolbar() {
    if (!toolbarElement) return;

    const container = toolbarElement.querySelector(".variables");
    if (!container) return;

    container.innerHTML = "";

    const names = getVariableNames();
    for (const name of names) {
        const setter = getSetterByName(name);
        const getters = getGettersByName(name);

        const el = document.createElement("div");
        el.className = `variable ${setter ? "setter" : "getter"}`;
        el.textContent = `${name} (${setter ? 1 : 0}→${getters.length})`;
        el.title = `Click to select all nodes for "${name}"`;
        el.onclick = () => {
            // Select all nodes with this variable name
            app.canvas.deselectAllNodes();
            if (setter) app.canvas.selectNode(setter, true);
            for (const getter of getters) {
                app.canvas.selectNode(getter, true);
            }

            // Center on the setter
            if (setter) {
                app.canvas.centerOnNode(setter);
            }
        };
        container.appendChild(el);
    }

    if (names.length === 0) {
        container.innerHTML = '<span style="color: rgba(255,255,255,0.5); font-size: 11px;">No variables defined</span>';
    }

    // Also update prompt tweakers
    updatePromptTweakers();
}

// ============================================================================
// Settings Dialog
// ============================================================================

function showSettingsDialog() {
    const dialog = document.createElement("div");
    dialog.className = "mape-settings-dialog";
    dialog.innerHTML = `
        <style>
            .mape-settings-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #333;
                border: 1px solid #555;
                border-radius: 8px;
                padding: 20px;
                z-index: 10000;
                min-width: 400px;
                max-width: 600px;
                font-family: arial, sans-serif;
                color: #fff;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            .mape-settings-dialog h2 {
                margin: 0 0 15px 0;
                font-size: 18px;
                border-bottom: 1px solid #444;
                padding-bottom: 10px;
            }
            .mape-settings-dialog .setting {
                display: flex;
                align-items: center;
                margin: 10px 0;
                gap: 10px;
            }
            .mape-settings-dialog .setting label {
                flex: 1;
                font-size: 13px;
            }
            .mape-settings-dialog .setting input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            .mape-settings-dialog .setting input[type="number"] {
                width: 60px;
                background: #222;
                border: 1px solid #444;
                color: #fff;
                padding: 4px 8px;
                border-radius: 4px;
            }
            .mape-settings-dialog .buttons {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
                padding-top: 15px;
                border-top: 1px solid #444;
            }
            .mape-settings-dialog button {
                background: #444;
                border: none;
                color: #fff;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
            }
            .mape-settings-dialog button:hover {
                background: #555;
            }
            .mape-settings-dialog button.primary {
                background: #4a8a4a;
            }
            .mape-settings-dialog button.primary:hover {
                background: #5a9a5a;
            }
            .mape-settings-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            }
        </style>
        <h2>mape's helpers - Settings</h2>
        <div class="settings-content"></div>
        <div class="buttons">
            <button class="cancel">Cancel</button>
            <button class="primary save">Save</button>
        </div>
    `;

    const overlay = document.createElement("div");
    overlay.className = "mape-settings-overlay";

    const content = dialog.querySelector(".settings-content");
    const tempSettings = { ...settings };

    for (const [key, def] of Object.entries(defaultSettings)) {
        const setting = document.createElement("div");
        setting.className = "setting";

        const value = tempSettings[key];
        const isBoolean = typeof def.value === "boolean";
        const isNumber = typeof def.value === "number";

        if (isBoolean) {
            setting.innerHTML = `
                <label>${def.label}</label>
                <input type="checkbox" ${value ? "checked" : ""} data-key="${key}">
            `;
        } else if (isNumber) {
            setting.innerHTML = `
                <label>${def.label}</label>
                <input type="number" value="${value}" data-key="${key}">
            `;
        }

        content.appendChild(setting);
    }

    const close = () => {
        overlay.remove();
        dialog.remove();
    };

    overlay.onclick = close;
    dialog.querySelector(".cancel").onclick = close;
    dialog.querySelector(".save").onclick = () => {
        // Save settings
        for (const input of dialog.querySelectorAll("input[data-key]")) {
            const key = input.dataset.key;
            if (input.type === "checkbox") {
                settings[key] = input.checked;
            } else if (input.type === "number") {
                settings[key] = parseFloat(input.value);
            }
        }
        saveSettings();
        close();
    };

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
}

// ============================================================================
// Prompt Tweaker
// ============================================================================

// Track tweakable prompts
const tweakablePrompts = new Map();  // nodeId -> { widget, tokens }

/**
 * Parse a prompt string into tokens with weights
 */
function parsePromptTokens(text) {
    const tokens = [];
    const regex = /\(([^()]+):(\d+\.?\d*)\)|(\[[^\]]+\])|([^,()[\]]+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match[1] !== undefined) {
            // Weighted token: (text:weight)
            tokens.push({
                text: match[1].trim(),
                weight: parseFloat(match[2]),
                enabled: true,
                type: "weighted"
            });
        } else if (match[3]) {
            // Bracketed token: [text] - usually means weight 0.9
            const innerText = match[3].slice(1, -1).trim();
            tokens.push({
                text: innerText,
                weight: 0.9,
                enabled: true,
                type: "bracketed"
            });
        } else if (match[4]) {
            // Plain token
            const text = match[4].trim();
            if (text && text !== ",") {
                tokens.push({
                    text: text.replace(/^,\s*/, "").replace(/\s*,$/, ""),
                    weight: 1.0,
                    enabled: true,
                    type: "plain"
                });
            }
        }
    }

    return tokens.filter(t => t.text.length > 0);
}

/**
 * Convert tokens back to a prompt string
 */
function tokensToPrompt(tokens) {
    return tokens
        .filter(t => t.enabled)
        .map(t => {
            if (t.weight === 1.0) {
                return t.text;
            } else {
                return `(${t.text}:${t.weight.toFixed(2)})`;
            }
        })
        .join(", ");
}

/**
 * Create a prompt tweaker UI for a text widget
 */
function createPromptTweaker(node, widget) {
    const nodeId = node.id;

    // Parse the current prompt
    const tokens = parsePromptTokens(widget.value || "");

    tweakablePrompts.set(nodeId, { widget, tokens, node });

    updateToolbar();
}

/**
 * Update the toolbar with prompt tweaker controls
 */
function updatePromptTweakers() {
    const container = toolbarElement?.querySelector(".variables");
    if (!container) return;

    // Add prompt tweaker section after variables
    let tweakerSection = container.querySelector(".prompt-tweakers");
    if (!tweakerSection) {
        tweakerSection = document.createElement("div");
        tweakerSection.className = "prompt-tweakers";
        tweakerSection.style.cssText = "display: flex; gap: 5px; margin-left: 10px; padding-left: 10px; border-left: 1px solid rgba(255,255,255,0.2);";
        container.appendChild(tweakerSection);
    }

    tweakerSection.innerHTML = "";

    for (const [nodeId, data] of tweakablePrompts) {
        const node = getNodeById(nodeId);
        if (!node) {
            tweakablePrompts.delete(nodeId);
            continue;
        }

        const btn = document.createElement("button");
        btn.className = "action-btn";
        btn.textContent = `📝 ${node.title || "Prompt"}`;
        btn.title = "Edit prompt weights";
        btn.onclick = () => showPromptTweakerDialog(nodeId);
        tweakerSection.appendChild(btn);
    }
}

/**
 * Show dialog to tweak prompt weights
 */
function showPromptTweakerDialog(nodeId) {
    const data = tweakablePrompts.get(nodeId);
    if (!data) return;

    const dialog = document.createElement("div");
    dialog.className = "mape-prompt-dialog";
    dialog.innerHTML = `
        <style>
            .mape-prompt-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #333;
                border: 1px solid #555;
                border-radius: 8px;
                padding: 20px;
                z-index: 10000;
                min-width: 500px;
                max-width: 800px;
                max-height: 80vh;
                font-family: arial, sans-serif;
                color: #fff;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            .mape-prompt-dialog h2 {
                margin: 0 0 15px 0;
                font-size: 16px;
                border-bottom: 1px solid #444;
                padding-bottom: 10px;
            }
            .mape-prompt-dialog .tokens {
                max-height: 400px;
                overflow-y: auto;
            }
            .mape-prompt-dialog .token {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px;
                margin: 4px 0;
                background: rgba(0,0,0,0.2);
                border-radius: 4px;
            }
            .mape-prompt-dialog .token.disabled {
                opacity: 0.4;
            }
            .mape-prompt-dialog .token input[type="checkbox"] {
                width: 16px;
                height: 16px;
            }
            .mape-prompt-dialog .token .text {
                flex: 1;
                font-size: 13px;
            }
            .mape-prompt-dialog .token input[type="range"] {
                width: 100px;
            }
            .mape-prompt-dialog .token .weight {
                width: 50px;
                text-align: center;
                font-size: 12px;
                background: #222;
                border: 1px solid #444;
                color: #fff;
                padding: 2px 4px;
                border-radius: 3px;
            }
            .mape-prompt-dialog .buttons {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #444;
            }
            .mape-prompt-dialog button {
                background: #444;
                border: none;
                color: #fff;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            }
            .mape-prompt-dialog button:hover {
                background: #555;
            }
            .mape-prompt-dialog button.primary {
                background: #4a8a4a;
            }
        </style>
        <h2>Prompt Tweaker - ${data.node.title || "Prompt"}</h2>
        <div class="tokens"></div>
        <div class="buttons">
            <button class="cancel">Cancel</button>
            <button class="primary apply">Apply</button>
        </div>
    `;

    const overlay = document.createElement("div");
    overlay.className = "mape-settings-overlay";

    const tokensContainer = dialog.querySelector(".tokens");
    const workingTokens = JSON.parse(JSON.stringify(data.tokens));

    function renderTokens() {
        tokensContainer.innerHTML = "";

        for (let i = 0; i < workingTokens.length; i++) {
            const token = workingTokens[i];
            const tokenEl = document.createElement("div");
            tokenEl.className = `token ${token.enabled ? "" : "disabled"}`;
            tokenEl.innerHTML = `
                <input type="checkbox" ${token.enabled ? "checked" : ""} data-idx="${i}">
                <span class="text">${token.text}</span>
                <input type="range" min="0" max="2" step="0.05" value="${token.weight}" data-idx="${i}">
                <input type="text" class="weight" value="${token.weight.toFixed(2)}" data-idx="${i}">
            `;

            // Checkbox handler
            tokenEl.querySelector('input[type="checkbox"]').onchange = (e) => {
                workingTokens[i].enabled = e.target.checked;
                tokenEl.classList.toggle("disabled", !e.target.checked);
            };

            // Slider handler
            tokenEl.querySelector('input[type="range"]').oninput = (e) => {
                const val = parseFloat(e.target.value);
                workingTokens[i].weight = val;
                tokenEl.querySelector(".weight").value = val.toFixed(2);
            };

            // Weight input handler
            tokenEl.querySelector(".weight").onchange = (e) => {
                const val = parseFloat(e.target.value) || 1.0;
                workingTokens[i].weight = val;
                tokenEl.querySelector('input[type="range"]').value = val;
            };

            tokensContainer.appendChild(tokenEl);
        }
    }

    renderTokens();

    const close = () => {
        overlay.remove();
        dialog.remove();
    };

    overlay.onclick = close;
    dialog.querySelector(".cancel").onclick = close;
    dialog.querySelector(".apply").onclick = () => {
        // Apply changes
        data.tokens = workingTokens;
        data.widget.value = tokensToPrompt(workingTokens);
        if (data.widget.callback) {
            data.widget.callback(data.widget.value);
        }
        app.graph.setDirtyCanvas(true, true);
        close();
    };

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
}

// ============================================================================
// Connection Line Drawing
// ============================================================================

let showConnectionLines = false;
let hoveredNode = null;

function drawConnectionLines(ctx) {
    if (!getSetting("showConnectionLines")) return;
    if (!showConnectionLines && !hoveredNode) return;

    const { internalLinks } = resolveVariableLinks(
        getNodes().map(n => ({
            id: n.id,
            type: n.type,
            inputs: n.inputs,
            outputs: n.outputs,
            widgets_values: n.widgets?.map(w => w.value)
        })),
        app.graph.links || {}
    );

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    for (const [setterId, getterIds] of Object.entries(internalLinks)) {
        const setterNode = getNodeById(parseInt(setterId));
        if (!setterNode) continue;

        // Only draw for hovered or selected node
        if (hoveredNode && hoveredNode.id !== setterNode.id) {
            // Check if hoveredNode is a getter of this setter
            if (!getterIds.includes(hoveredNode.id)) continue;
        }

        const setterOutput = setterNode.outputs?.[0];
        if (!setterOutput) continue;

        const setterPos = setterNode.getConnectionPos(false, 0);

        for (const getterId of getterIds) {
            const getterNode = getNodeById(getterId);
            if (!getterNode) continue;

            const getterInput = getterNode.inputs?.[0];
            if (!getterInput) continue;

            const getterPos = getterNode.getConnectionPos(true, 0);

            // Draw curved line
            ctx.strokeStyle = `rgba(138, 74, 138, 0.6)`;
            ctx.beginPath();
            ctx.moveTo(setterPos[0], setterPos[1]);

            const midX = (setterPos[0] + getterPos[0]) / 2;
            ctx.bezierCurveTo(
                midX, setterPos[1],
                midX, getterPos[1],
                getterPos[0], getterPos[1]
            );
            ctx.stroke();
        }
    }

    ctx.restore();
}

// ============================================================================
// Graph Prompt Interception
// ============================================================================

let originalGraphToPrompt = null;

async function interceptedGraphToPrompt() {
    const result = await originalGraphToPrompt.call(app);

    // Check if there are any mape variables
    const mapeNodes = getMapeNodes();
    if (mapeNodes.length === 0) {
        return result;
    }

    // Resolve variable links
    const { nodeSet, nodeGet } = resolveVariableLinks(
        result.workflow.nodes,
        Object.fromEntries(
            (result.workflow.links || []).map(link => [link[0], {
                id: link[0],
                origin_id: link[1],
                origin_slot: link[2],
                target_id: link[3],
                target_slot: link[4],
                type: link[5]
            }])
        )
    );

    // Rewrite the output to bypass mape variable nodes
    const newOutput = {};

    for (const [nodeId, nodeData] of Object.entries(result.output)) {
        if (nodeData.class_type === NODE_TYPE) {
            // Skip mape variable nodes in output
            continue;
        }

        // Rewrite any inputs that reference mape variable getters
        const newInputs = {};
        for (const [inputName, inputValue] of Object.entries(nodeData.inputs)) {
            if (Array.isArray(inputValue)) {
                const [refId, refSlot] = inputValue;
                const variableName = nodeGet[refId];

                if (variableName && nodeSet[variableName]) {
                    // This input references a getter - rewrite to point to the setter's source
                    const setter = nodeSet[variableName];
                    newInputs[inputName] = [setter.originId.toString(), setter.originIndex];
                } else {
                    newInputs[inputName] = inputValue;
                }
            } else {
                newInputs[inputName] = inputValue;
            }
        }

        newOutput[nodeId] = {
            ...nodeData,
            inputs: newInputs
        };
    }

    return {
        ...result,
        output: newOutput
    };
}

// ============================================================================
// Image Preview
// ============================================================================

let previewWindow = null;
let previewImages = [];

function showImagePreview(images) {
    if (!images || images.length === 0) return;

    previewImages = images;

    if (previewWindow && !previewWindow.closed) {
        updatePreviewWindow();
        previewWindow.focus();
        return;
    }

    previewWindow = window.open("", "mape_preview", "width=800,height=600,resizable=yes");
    if (!previewWindow) {
        alert("Popup blocked. Please allow popups for image preview.");
        return;
    }

    previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Image Preview - mape's helpers</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background: #1a1a1a;
                    color: #fff;
                    font-family: arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                .toolbar {
                    background: #333;
                    padding: 10px;
                    display: flex;
                    gap: 10px;
                    border-bottom: 1px solid #444;
                }
                .toolbar button {
                    background: #444;
                    border: none;
                    color: #fff;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .toolbar button:hover { background: #555; }
                .toolbar button.active { background: #4a8a4a; }
                .main {
                    flex: 1;
                    display: flex;
                    overflow: hidden;
                }
                .thumbnails {
                    width: 120px;
                    background: #222;
                    overflow-y: auto;
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .thumbnails img {
                    width: 100%;
                    border-radius: 4px;
                    cursor: pointer;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                }
                .thumbnails img:hover { opacity: 0.8; }
                .thumbnails img.active { opacity: 1; border: 2px solid #4a8a4a; }
                .preview {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: auto;
                    padding: 20px;
                }
                .preview img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                    box-shadow: 0 0 30px rgba(0,0,0,0.5);
                }
                .info {
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    background: rgba(0,0,0,0.7);
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <button id="fit">Fit</button>
                <button id="actual">1:1</button>
                <span style="flex:1"></span>
                <span id="counter"></span>
            </div>
            <div class="main">
                <div class="thumbnails" id="thumbs"></div>
                <div class="preview">
                    <img id="mainImg" src="">
                </div>
            </div>
            <div class="info" id="info"></div>
            <script>
                let currentIdx = 0;
                let images = [];
                let zoom = 'fit';

                function update() {
                    const thumbs = document.getElementById('thumbs');
                    thumbs.innerHTML = '';
                    images.forEach((img, i) => {
                        const thumb = document.createElement('img');
                        thumb.src = img.src;
                        thumb.className = i === currentIdx ? 'active' : '';
                        thumb.onclick = () => { currentIdx = i; update(); };
                        thumbs.appendChild(thumb);
                    });

                    const main = document.getElementById('mainImg');
                    if (images[currentIdx]) {
                        main.src = images[currentIdx].src;
                        document.getElementById('info').textContent =
                            images[currentIdx].info || '';
                    }
                    document.getElementById('counter').textContent =
                        (currentIdx + 1) + ' / ' + images.length;

                    main.style.maxWidth = zoom === 'fit' ? '100%' : 'none';
                    main.style.maxHeight = zoom === 'fit' ? '100%' : 'none';
                }

                document.getElementById('fit').onclick = () => { zoom = 'fit'; update(); };
                document.getElementById('actual').onclick = () => { zoom = 'actual'; update(); };

                document.onkeydown = (e) => {
                    if (e.key === 'ArrowLeft') { currentIdx = Math.max(0, currentIdx - 1); update(); }
                    if (e.key === 'ArrowRight') { currentIdx = Math.min(images.length - 1, currentIdx + 1); update(); }
                };

                window.setImages = (imgs) => { images = imgs; currentIdx = 0; update(); };
            </script>
        </body>
        </html>
    `);

    previewWindow.document.close();
    setTimeout(updatePreviewWindow, 100);
}

function updatePreviewWindow() {
    if (previewWindow && previewWindow.setImages) {
        previewWindow.setImages(previewImages);
    }
}

function collectExecutedImages() {
    const images = [];

    for (const node of getNodes()) {
        // Check for image outputs in node
        if (node.imgs) {
            for (const img of node.imgs) {
                images.push({
                    src: img.src,
                    info: `${node.title || node.type} - ${node.id}`
                });
            }
        }

        // Check for images property (SaveImage nodes)
        if (node.images) {
            for (const imgData of node.images) {
                if (imgData.filename) {
                    const src = `/view?filename=${imgData.filename}&subfolder=${imgData.subfolder || ""}&type=${imgData.type || "output"}`;
                    images.push({
                        src: src,
                        info: `${node.title || node.type} - ${imgData.filename}`
                    });
                }
            }
        }
    }

    return images;
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        // Don't trigger when typing in inputs
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
            return;
        }

        // Cmd/Ctrl + Shift + P - Show image preview
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "p") {
            e.preventDefault();
            const images = collectExecutedImages();
            if (images.length > 0) {
                showImagePreview(images);
            } else {
                alert("No images found. Run a workflow first.");
            }
            return;
        }

        // Cmd/Ctrl + Shift + T - Toggle toolbar
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "t") {
            e.preventDefault();
            toolbarVisible = !toolbarVisible;
            toolbarElement?.classList.toggle("hidden", !toolbarVisible);
            localStorage.setItem(`${STORAGE_PREFIX}toolbar_visible`, toolbarVisible);
            return;
        }

        // Cmd/Ctrl + Shift + S - Split selected links to variables
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
            e.preventDefault();
            document.getElementById("mape-explode")?.click();
            return;
        }
    });
}

// ============================================================================
// Extension Registration
// ============================================================================

app.registerExtension({
    name: EXTENSION_NAME,

    async setup() {
        loadSettings();

        // Intercept graphToPrompt
        originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = interceptedGraphToPrompt;

        // Create toolbar
        createToolbar();

        // Setup keyboard shortcuts
        setupKeyboardShortcuts();

        // Listen for graph changes to update toolbar
        api.addEventListener("executed", updateToolbar);
        api.addEventListener("execution_start", updateToolbar);

        // Hook into canvas drawing for connection lines
        const originalDrawFrontCanvas = LGraphCanvas.prototype.drawFrontCanvas;
        LGraphCanvas.prototype.drawFrontCanvas = function() {
            originalDrawFrontCanvas.apply(this, arguments);
            drawConnectionLines(this.ctx);
        };

        // Hook into link menu for Shift+click conversion
        const originalShowLinkMenu = LGraphCanvas.prototype.showLinkMenu;
        LGraphCanvas.prototype.showLinkMenu = function(link, e) {
            if (e?.shiftKey) {
                let name = "variable";
                if (getSetting("promptForVariableName") && !getSetting("ignorePromptForExplodeHeal")) {
                    name = prompt("Variable name:", name);
                    if (!name) return false;
                }
                convertLinkToVariables(link, name);
                return false;
            }
            return originalShowLinkMenu.apply(this, arguments);
        };

        console.log("[mape] helpers extension loaded");
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE_TYPE) {
            // Add double-click rename to all nodes
            const originalOnDblClick = nodeType.prototype.onDblClick;
            nodeType.prototype.onDblClick = function(e, pos) {
                if (originalOnDblClick) {
                    originalOnDblClick.apply(this, arguments);
                }

                // Check if click is on title bar
                if (getSetting("dblClickToRename") && pos[1] < 0) {
                    const newName = prompt("Node title:", this.title);
                    if (newName) {
                        this.title = newName;
                        app.graph.setDirtyCanvas(true, true);
                    }
                }
            };
            return;
        }

        // MapeVariable node customizations
        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (originalOnNodeCreated) {
                originalOnNodeCreated.apply(this, arguments);
            }

            // Set initial appearance
            updateNodeAppearance(this);

            // Update toolbar when nodes change
            setTimeout(updateToolbar, 50);
        };

        const originalOnConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function() {
            if (originalOnConnectionsChange) {
                originalOnConnectionsChange.apply(this, arguments);
            }

            // Update appearance when connections change
            updateNodeAppearance(this);
            updateToolbar();
        };

        const originalOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            if (originalOnRemoved) {
                originalOnRemoved.apply(this, arguments);
            }
            updateToolbar();
        };

        // Mouse hover for connection lines
        nodeType.prototype.onMouseEnter = function() {
            if (getSetting("showConnectionOnNodeHover")) {
                hoveredNode = this;
                showConnectionLines = true;
                app.graph.setDirtyCanvas(true, true);
            }
        };

        nodeType.prototype.onMouseLeave = function() {
            hoveredNode = null;
            showConnectionLines = false;
            app.graph.setDirtyCanvas(true, true);
        };

        // Custom title with variable name
        const originalGetTitle = nodeType.prototype.getTitle;
        nodeType.prototype.getTitle = function() {
            const name = getVariableName(this);
            if (name) {
                const prefix = isNodeSetter(this) ? "SET" : "GET";
                return `${prefix}: ${name}`;
            }
            return originalGetTitle ? originalGetTitle.apply(this, arguments) : this.title;
        };
    }
});
