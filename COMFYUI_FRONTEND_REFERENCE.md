# ComfyUI Frontend Development Reference

> **Reference Version:** ComfyUI Frontend v1.34.6 (December 2024)
> **Last Updated:** December 2024
> **Update this doc when:** Frontend version changes significantly or APIs are deprecated

## Overview

ComfyUI uses a hybrid rendering system combining LiteGraph (canvas-based node rendering) with DOM widgets for rich UI elements. As of August 2024, the frontend was modernized and moved to a separate repository.

**Key Resources:**
- [ComfyUI Frontend Repository](https://github.com/Comfy-Org/ComfyUI_frontend)
- [Official Documentation](https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking)
- [LiteGraph Source](https://github.com/Comfy-Org/ComfyUI_frontend/tree/main/src/lib/litegraph) (integrated into frontend repo)

---

## DOM Widget API

### `addDOMWidget(name, type, element, options)`

Creates a widget containing a custom DOM element.

```javascript
const widget = node.addDOMWidget("widget_name", "customtext", domElement, {
    serialize: false,        // Whether to save widget state
    hideOnZoom: false,       // Hide when zoomed out

    // HEIGHT CONSTRAINTS - Use all three together for fixed-size widgets
    getMinHeight: () => 30,  // Minimum allowed height (pixels)
    getMaxHeight: () => 30,  // Maximum allowed height (pixels)
    getHeight: () => 30,     // Preferred height (pixels or string)

    // CALLBACKS
    getValue: () => value,           // Return widget value
    setValue: (value) => {},         // Set widget value
    onDraw: (widget) => {},          // Called on draw
    onHide: (widget) => {},          // Called when hidden
    afterResize: (node) => {},       // Called after widget resizes
});
```

### Height Calculation (computeLayoutSize)

ComfyUI's `computeLayoutSize()` determines widget size using this priority:

1. **Custom callbacks** (if provided): `getMinHeight()`, `getMaxHeight()`, `getHeight()`
2. **CSS custom properties**: `--comfy-widget-min-height`, `--comfy-widget-max-height`, `--comfy-widget-height`
3. **Fallback defaults**: minHeight defaults to 50

**Important:** To create a fixed-height widget that won't expand, you MUST set all three:
```javascript
getMinHeight: () => 30,
getMaxHeight: () => 30,
getHeight: () => 30
```

Setting only `getHeight` allows ComfyUI to expand/shrink within default bounds.

---

## Widget Types

Built-in types (accessed via `app.widgets` in uppercase):

| Type | Description |
|------|-------------|
| `BOOLEAN` | Checkbox/toggle |
| `INT` | Integer input |
| `FLOAT` | Decimal input |
| `STRING` | Text input (single or multiline) |
| `COMBO` | Dropdown selection |
| `IMAGEUPLOAD` | Image file picker |

Custom types can be registered via `getCustomWidgets` in extensions.

---

## Node Lifecycle Methods

```javascript
nodeType.prototype.onNodeCreated = function() {
    // Called when node is first created
    // Initialize state, create widgets here
};

nodeType.prototype.onConfigure = function(data) {
    // Called when loading from saved workflow
    // Restore state from data.yourCustomState
};

nodeType.prototype.onSerialize = function(data) {
    // Called when saving workflow
    // Save state: data.yourCustomState = {...}
    return data;
};

nodeType.prototype.onRemoved = function() {
    // Called when node is deleted
    // Clean up resources, localStorage, etc.
};

nodeType.prototype.onResize = function(size) {
    // Called when node is resized
    // size = [width, height]
    // Use this for dynamic layout adjustments
};
```

---

## LiteGraph Constants

```javascript
LiteGraph.NODE_TITLE_HEIGHT    // Height of node title bar (~30px)
LiteGraph.NODE_SLOT_HEIGHT     // Height per input/output slot
LiteGraph.NODE_WIDGET_HEIGHT   // Default widget height
LiteGraph.NODE_TEXT_SIZE       // Font size for text
```

---

## Common Patterns

### Fixed-Height Widget (Won't Expand)

```javascript
// Outer wrapper prevents ComfyUI allocation from expanding
const outerWrapper = document.createElement("div");
outerWrapper.style.position = "relative";
outerWrapper.style.width = "100%";
outerWrapper.style.height = "26px";
outerWrapper.style.minHeight = "26px";
outerWrapper.style.maxHeight = "26px";
outerWrapper.style.overflow = "hidden";
outerWrapper.style.flexShrink = "0";

// Inner container with absolute positioning locks visual size
const container = document.createElement("div");
container.style.position = "absolute";
container.style.top = "0";
container.style.left = "0";
container.style.right = "0";
container.style.height = "26px";
// ... add content to container

outerWrapper.appendChild(container);

const widget = node.addDOMWidget("name", "customtext", outerWrapper, {
    getMinHeight: () => 30,
    getMaxHeight: () => 30,
    getHeight: () => 30
});
```

### Dynamic-Height Scrollable Widget

```javascript
const MINIMUM_HEIGHT = 200;

const scrollContainer = document.createElement("div");
scrollContainer.style.width = "100%";
scrollContainer.style.height = MINIMUM_HEIGHT + "px";
scrollContainer.style.overflowY = "auto";
scrollContainer.style.boxSizing = "border-box";

// Update height on node resize
const updateHeight = () => {
    if (!node.size) return;
    const nodeHeight = node.size[1];

    // Subtract fixed elements
    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
    const otherWidgetsHeight = 60;  // Your other widgets
    const margins = 90;              // Padding and buffer

    const fixedHeights = titleHeight + otherWidgetsHeight + margins;
    const available = Math.max(MINIMUM_HEIGHT, nodeHeight - fixedHeights);

    scrollContainer.style.height = available + "px";
};

// Hook into resize - this avoids infinite loops
const originalOnResize = node.onResize;
node.onResize = function(size) {
    originalOnResize?.apply(this, arguments);
    updateHeight();
};

// Widget returns fixed minimum to prevent circular sizing
const widget = node.addDOMWidget("name", "customtext", scrollContainer, {
    getHeight: () => MINIMUM_HEIGHT  // Fixed return prevents infinite loops
});

setTimeout(updateHeight, 50);  // Initial calculation
```

---

## Avoiding Infinite Resize Loops

**The Problem:** If `getHeight()` returns a dynamic value based on `node.size`, and changing height triggers canvas redraw, which recalculates node size... infinite loop.

**The Solution:**
1. Return a **fixed value** from `getHeight()`
2. Use `onResize` callback to **manually adjust** DOM element heights
3. Never call `setDirtyCanvas()` or trigger redraws from height calculations

---

## Widget Properties

```javascript
widget.name      // Widget identifier
widget.type      // Widget type string
widget.value     // Current value (get/set)
widget.options   // Configuration object
widget.last_y    // Vertical position in node
widget.callback  // Function called on value change
widget.element   // DOM element (for DOM widgets)
```

---

## Extension Registration

```javascript
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "YourExtensionName",

    async setup() {
        // One-time setup, register API routes
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "YourNodeType") {
            // Customize node prototype here
        }
    }
});
```

---

## Debugging Tips

1. **Check widget heights:** Log `widget.computeLayoutSize?.(node)` results
2. **Inspect DOM:** Widget wrappers are in the DOM, check computed styles
3. **Watch for loops:** If node keeps resizing, check `getHeight()` return values
4. **Console logging:** ComfyUI logs to browser console, add `console.log` in lifecycle methods

---

## Version History

| Frontend Version | Date | Notable Changes |
|-----------------|------|-----------------|
| v1.34.6 | Dec 2024 | Current reference version |
| v1.0.0 | Aug 2024 | New frontend became default |

**Check for updates:** https://github.com/Comfy-Org/ComfyUI_frontend/releases
