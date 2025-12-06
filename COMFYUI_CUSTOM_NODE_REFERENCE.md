# ComfyUI Custom Nodes Developer Reference

> Comprehensive guide compiled from official ComfyUI source code and documentation (December 2025)
>
> **Note:** ComfyUI now has both a **V1 (Legacy)** API and a new **V3 API**. Most existing nodes use V1, but new features will only be added to V3. This guide covers both.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start (V1 Legacy)](#quick-start-v1-legacy)
- [Project Structure](#project-structure)
- [V1 Node Class Reference](#v1-node-class-reference)
- [Input Types](#input-types)
- [Output Types](#output-types)
- [Data Types Reference](#data-types-reference)
- [Advanced Features](#advanced-features)
- [V3 API (Modern)](#v3-api-modern)
- [Frontend Extensions (JavaScript)](#frontend-extensions-javascript)
- [Server Communication](#server-communication)
- [Publishing to Registry](#publishing-to-registry)
- [Best Practices](#best-practices)

---

## Overview

ComfyUI custom nodes are Python classes that extend ComfyUI's functionality. On startup, ComfyUI scans the `custom_nodes` directory for Python modules.

### How ComfyUI Discovers Nodes

**V1 (Legacy):** Modules exporting `NODE_CLASS_MAPPINGS` dictionary
**V3 (Modern):** Modules with `comfy_entrypoint()` function returning a `ComfyExtension`

Both methods are supported; V1 remains fully functional but new features will only be added to V3.

---

## Quick Start (V1 Legacy)

### Using comfy-cli (Recommended)

```bash
cd ComfyUI/custom_nodes
comfy node scaffold
```

### Manual Setup

Create this structure:

```
ComfyUI/custom_nodes/my_nodes/
├── __init__.py
├── nodes.py
└── requirements.txt  # optional
```

**`nodes.py`** (from official `example_node.py.example`):
```python
class Example:
    """
    A example node

    Class methods
    -------------
    INPUT_TYPES (dict):
        Tell the main program input parameters of nodes.
    IS_CHANGED:
        optional method to control when the node is re executed.

    Attributes
    ----------
    RETURN_TYPES (`tuple`):
        The type of each element in the output tuple.
    RETURN_NAMES (`tuple`):
        Optional: The name of each output in the output tuple.
    FUNCTION (`str`):
        The name of the entry-point method. For example, if `FUNCTION = "execute"` then it will run Example().execute()
    OUTPUT_NODE ([`bool`]):
        If this node is an output node that outputs a result/image from the graph. The SaveImage node is an example.
        The backend iterates on these output nodes and tries to execute all their parents if their parent graph is properly connected.
        Assumed to be False if not present.
    CATEGORY (`str`):
        The category the node should appear in the UI.
    DEPRECATED (`bool`):
        Indicates whether the node is deprecated. Deprecated nodes are hidden by default in the UI, but remain
        functional in existing workflows that use them.
    EXPERIMENTAL (`bool`):
        Indicates whether the node is experimental. Experimental nodes are marked as such in the UI and may be subject to
        significant changes or removal in future versions. Use with caution in production workflows.
    execute(s) -> tuple || None:
        The entry point method. The name of this method must be the same as the value of property `FUNCTION`.
        For example, if `FUNCTION = "execute"` then this method's name must be `execute`, if `FUNCTION = "foo"` then it must be `foo`.
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        """
        Return a dictionary which contains config for all input fields.
        Some types (string): "MODEL", "VAE", "CLIP", "CONDITIONING", "LATENT", "IMAGE", "INT", "STRING", "FLOAT".
        Input types "INT", "STRING" or "FLOAT" are special values for fields on the node.
        The type can be a list for selection.

        Returns: `dict`:
            - Key input_fields_group (`string`): Can be either required, hidden or optional. A node class must have property `required`
            - Value input_fields (`dict`): Contains input fields config:
                * Key field_name (`string`): Name of a entry-point method's argument
                * Value field_config (`tuple`):
                    + First value is a string indicate the type of field or a list for selection.
                    + Second value is a config for type "INT", "STRING" or "FLOAT".
        """
        return {
            "required": {
                "image": ("IMAGE",),
                "int_field": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 4096,
                    "step": 64,
                    "display": "number",  # Cosmetic only: display as "number" or "slider"
                    "lazy": True  # Will only be evaluated if check_lazy_status requires it
                }),
                "float_field": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 10.0,
                    "step": 0.01,
                    "round": 0.001,  # The value representing the precision to round to, will be set to the step value by default. Can be set to False to disable rounding.
                    "display": "number",
                    "lazy": True
                }),
                "print_to_screen": (["enable", "disable"],),
                "string_field": ("STRING", {
                    "multiline": False,  # True if you want the field to look like the one on the ClipTextEncode node
                    "default": "Hello World!",
                    "lazy": True
                }),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    #RETURN_NAMES = ("image_output_name",)

    FUNCTION = "test"

    #OUTPUT_NODE = False

    CATEGORY = "Example"

    def check_lazy_status(self, image, string_field, int_field, float_field, print_to_screen):
        """
        Return a list of input names that need to be evaluated.

        This function will be called if there are any lazy inputs which have not yet been
        evaluated. As long as you return at least one field which has not yet been evaluated
        (and more exist), this function will be called again once the value of the requested
        field is available.

        Any evaluated inputs will be passed as arguments to this function. Any unevaluated
        inputs will have the value None.
        """
        if print_to_screen == "enable":
            return ["int_field", "float_field", "string_field"]
        else:
            return []

    def test(self, image, string_field, int_field, float_field, print_to_screen):
        if print_to_screen == "enable":
            print(f"""Your input contains:
                string_field aka input text: {string_field}
                int_field: {int_field}
                float_field: {float_field}
            """)
        # do some processing on the image, in this example I just invert it
        image = 1.0 - image
        return (image,)

    """
    The node will always be re executed if any of the inputs change but
    this method can be used to force the node to execute again even when the inputs don't change.
    You can make this node return a number or a string. This value will be compared to the one returned the last time the node was
    executed, if it is different the node will be executed again.
    This method is used in the core repo for the LoadImage node where they return the image hash as a string, if the image hash
    changes between executions the LoadImage node is executed again.
    """
    #@classmethod
    #def IS_CHANGED(s, image, string_field, int_field, float_field, print_to_screen):
    #    return ""


# A dictionary that contains all nodes you want to export with their names
# NOTE: names should be globally unique
NODE_CLASS_MAPPINGS = {
    "Example": Example
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "Example": "Example Node"
}
```

**`__init__.py`:**
```python
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Set the web directory, any .js file in that directory will be loaded by the frontend as a frontend extension
# WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
```

---

## Project Structure

```
ComfyUI/custom_nodes/my_node_pack/
├── __init__.py           # Entry point, exports mappings
├── nodes.py              # Node class definitions
├── requirements.txt      # Python dependencies
├── pyproject.toml        # Registry metadata (for publishing)
├── js/                   # Frontend extensions (optional)
│   └── extension.js
└── README.md
```

---

## V1 Node Class Reference

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `INPUT_TYPES` | `@classmethod` | **Required.** Returns dict with `required`, optional `optional` and `hidden` keys |
| `RETURN_TYPES` | `tuple[str]` | **Required.** Tuple of output data type strings |
| `FUNCTION` | `str` | **Required.** Name of the method to execute |
| `CATEGORY` | `str` | **Required.** Menu location (e.g., `"image/transform"`) |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `RETURN_NAMES` | `tuple[str]` | lowercase of RETURN_TYPES | Labels for outputs |
| `OUTPUT_NODE` | `bool` | `False` | If True, node is an output (always executes) |
| `DEPRECATED` | `bool` | `False` | Hidden by default in UI but functional |
| `EXPERIMENTAL` | `bool` | `False` | Marked as experimental in UI |
| `DESCRIPTION` | `str` | `""` | Tooltip description |
| `INPUT_IS_LIST` | `bool` | `False` | Receive all inputs as lists |
| `OUTPUT_IS_LIST` | `tuple[bool]` | `(False,...)` | Which outputs are lists |

### Special Methods

| Method | Description |
|--------|-------------|
| `IS_CHANGED(cls, ...)` | Return value compared to previous run; if different, node re-executes |
| `VALIDATE_INPUTS(cls, ...)` | Return `True` or error string; called before execution |
| `check_lazy_status(self, ...)` | Return list of input names that need evaluation |

---

## Input Types

### INPUT_TYPES Structure

```python
@classmethod
def INPUT_TYPES(s):  # Note: uses 's' not 'cls' in official examples
    return {
        "required": { ... },   # Must be connected/have value
        "optional": { ... },   # Can be left unconnected
        "hidden": { ... },     # Server-provided values
    }
```

### Input Definition Format

```python
"input_name": (DATA_TYPE, {options})
# or for COMBO:
"input_name": (["option1", "option2", "option3"],)
```

### Input Options (from source: `node_typing.py` and official docs)

| Option | Applies To | Description |
|--------|-----------|-------------|
| `default` | INT, FLOAT, STRING, BOOLEAN | **Required for widgets.** Default value |
| `min` | INT, FLOAT | Minimum value |
| `max` | INT, FLOAT | Maximum value |
| `step` | INT, FLOAT | Increment step for slider/spinner |
| `round` | FLOAT | Precision to round to (default: step). Set `False` to disable |
| `display` | INT, FLOAT | `"number"` or `"slider"` (cosmetic only) |
| `multiline` | STRING | `True` for multiline text box |
| `placeholder` | STRING | Placeholder text |
| `dynamicPrompts` | STRING | Enable dynamic prompt evaluation |
| `label_on` | BOOLEAN | Label when True |
| `label_off` | BOOLEAN | Label when False |
| `forceInput` | Any | Force as input socket (no widget) |
| `defaultInput` | Any | Default to input socket but allow widget conversion |
| `lazy` | Any | Enable lazy evaluation (see `check_lazy_status`) |
| `rawLink` | Any | Receive link tuple `["nodeId", outputIndex]` instead of value |
| `tooltip` | Any | Tooltip text for this input |
| `image_upload` | STRING | Attach image upload button (requires input name `image`) |
| `image_folder` | STRING | Folder for image preview: `"input"`, `"output"`, or `"temp"` |
| `control_after_generate` | INT, COMBO | Add control widget to auto-change value after queue |

### Hidden Inputs

```python
"hidden": {
    "unique_id": "UNIQUE_ID",      # Node's unique ID (str)
    "prompt": "PROMPT",            # Complete workflow prompt (dict)
    "extra_pnginfo": "EXTRA_PNGINFO",  # PNG metadata dict
    "dynprompt": "DYNPROMPT",      # DynamicPrompt instance (for node expansion)
}
```

---

## Output Types

### RETURN_TYPES

**Always a tuple of strings:**
```python
RETURN_TYPES = ("IMAGE", "MASK", "INT")
```

**Single output needs trailing comma:**
```python
RETURN_TYPES = ("IMAGE",)  # Correct - this is a tuple
RETURN_TYPES = ("IMAGE")   # WRONG - this is just a string!
```

**Empty output:**
```python
RETURN_TYPES = ()  # Valid for side-effect only nodes
```

### Function Return Value

**Always return a tuple matching RETURN_TYPES:**
```python
def process(self, image):
    return (result,)  # Trailing comma required for single output!

def multi_output(self, image):
    return (processed_image, mask, count)  # Must match RETURN_TYPES order
```

---

## Data Types Reference

### Tensor Types (from `comfy/comfy_types/node_typing.py`)

| Type | Python Type | Shape | Notes |
|------|-------------|-------|-------|
| `IMAGE` | `torch.Tensor` | `[B, H, W, C]` | Batch, Height, Width, Channels (C=3 for RGB) |
| `LATENT` | `dict` | `{"samples": tensor[B,C,H,W]}` | C typically 4, H/W = image_size/8 |
| `MASK` | `torch.Tensor` | `[H, W]` or `[B, H, W]` | Grayscale mask |
| `AUDIO` | `dict` | `{"waveform": [B,C,T], "sample_rate": int}` | C=1 mono, C=2 stereo |

### Primitive Types

| Type | Python Type | Widget |
|------|-------------|--------|
| `INT` | `int` | Number input |
| `FLOAT` | `float` | Number input with decimals |
| `STRING` | `str` | Text input |
| `BOOLEAN` | `bool` | Toggle |
| `COMBO` | `list[str]` → `str` | Dropdown (defined as list in INPUT_TYPES) |

### Model Types

| Type | Description |
|------|-------------|
| `MODEL` | Diffusion model |
| `CLIP` | CLIP text encoder |
| `VAE` | Variational autoencoder |
| `CONDITIONING` | Encoded prompts |
| `CONTROL_NET` | ControlNet model |
| `SIGMAS` | Scheduler sigma values (1D tensor, length = steps+1, representing noise before each step and after final step) |
| `SAMPLER` | Sampler object with `sample()` method |
| `NOISE` | Noise generator with `seed` property and `generate_noise(input_latent)` method |
| `GUIDER` | Guidance callable with `__call__(noisy_latents)` returning noise prediction |

### Custom Types

Use any unique uppercase string:
```python
RETURN_TYPES = ("MY_CUSTOM_TYPE",)

# Receiving custom type:
@classmethod
def INPUT_TYPES(s):
    return {
        "required": {
            "my_data": ("MY_CUSTOM_TYPE", {"forceInput": True}),
        }
    }
```

### Wildcard Type

Accept any type. **Note:** The `*` wildcard was never officially supported and may not work reliably. Use with `VALIDATE_INPUTS`:

```python
@classmethod
def INPUT_TYPES(s):
    return {
        "required": {
            "anything": ("*",),
        }
    }

@classmethod
def VALIDATE_INPUTS(s, input_types):
    # input_types dict maps input names to connected output types
    # Must return True to skip default type validation
    return True
```

**Alternative (from `ComfyUI-Inspire-Pack`):** Some node developers use a custom `any_typ` trick for more reliable wildcard behavior. Check the Inspire-Pack source for implementation details.

---

## Advanced Features

### IS_CHANGED (Cache Control)

**Critical:** Return value is compared to previous run. If SAME, node is cached. If DIFFERENT, node re-executes.

```python
@classmethod
def IS_CHANGED(s, image, **kwargs):
    # Return NaN to ALWAYS re-execute (NaN != NaN)
    return float("NaN")

    # Return hash to re-execute when file changes
    m = hashlib.sha256()
    with open(image_path, 'rb') as f:
        m.update(f.read())
    return m.digest().hex()
```

**⚠️ WARNING:** `True == True`, so returning `True` means "unchanged"! This is a common mistake.

### VALIDATE_INPUTS

```python
@classmethod
def VALIDATE_INPUTS(s, my_input):
    if my_input < 0:
        return "my_input must be non-negative"  # Error message
    return True  # Valid

# Skip type validation entirely:
@classmethod
def VALIDATE_INPUTS(s, input_types):
    # Receives dict of {input_name: connected_type}
    return True
```

### Lazy Evaluation

Defer input evaluation until actually needed. From official docs (`lazy_evaluation.mdx`):

```python
class LazyMixImages:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image1": ("IMAGE", {"lazy": True}),
                "image2": ("IMAGE", {"lazy": True}),
                "mask": ("MASK",),  # Not lazy - always evaluated
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "mix"
    CATEGORY = "Examples"

    def check_lazy_status(self, mask, image1, image2):
        """
        Return list of inputs that need evaluation.
        Unevaluated lazy inputs have value None.
        May be called multiple times as inputs become available.
        """
        mask_min = mask.min()
        mask_max = mask.max()
        needed = []
        if image1 is None and (mask_min != 1.0 or mask_max != 1.0):
            needed.append("image1")
        if image2 is None and (mask_min != 0.0 or mask_max != 0.0):
            needed.append("image2")
        return needed

    def mix(self, mask, image1, image2):
        mask_min = mask.min()
        mask_max = mask.max()
        if mask_min == 0.0 and mask_max == 0.0:
            return (image1,)
        elif mask_min == 1.0 and mask_max == 1.0:
            return (image2,)
        result = image1 * (1. - mask) + image2 * mask
        return (result,)
```

**Key Points:**
- `check_lazy_status` is NOT a classmethod (uses `self`)
- Lazy inputs are `None` until requested and evaluated
- Method may be called multiple times as inputs become available

### INPUT_IS_LIST / OUTPUT_IS_LIST

```python
INPUT_IS_LIST = True  # All inputs received as lists
OUTPUT_IS_LIST = (True,)  # Tuple matching RETURN_TYPES

def rebatch(self, images, batch_size):
    batch_size = batch_size[0]  # Everything is a list when INPUT_IS_LIST=True
    # ... return list of outputs
    return (output_list,)
```

### Execution Blocking

```python
from comfy_execution.graph import ExecutionBlocker

def process(self, condition, passthrough):
    if not condition:
        return (ExecutionBlocker(None),)  # Silent block
        # Or: return (ExecutionBlocker("Reason"),)  # With error message
    return (passthrough,)
```

### Dynamic Inputs

```python
class ContainsAnyDict(dict):
    def __contains__(self, key):
        return True

@classmethod
def INPUT_TYPES(s):
    return {
        "required": {},
        "optional": ContainsAnyDict(),
    }

def process(self, **kwargs):
    for key, value in kwargs.items():
        print(f"{key}: {value}")
```

---

## V3 API (Modern)

The V3 API is the future of ComfyUI node development. New features will only be added to V3.

### V3 Example (Basic)

```python
from comfy_api.latest import ComfyExtension, io, ui

class MyNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyNode",
            display_name="My Node",
            category="my_category",
            description="Node description",
            inputs=[
                io.Image.Input("image"),
                io.Int.Input("count", default=1, min=0, max=100),
                io.String.Input("text", default="Hello", multiline=False),
                io.Combo.Input("mode", options=["option1", "option2"]),
                io.Mask.Input("mask", optional=True),
            ],
            outputs=[
                io.Image.Output(),
            ],
            is_output_node=False,
            is_deprecated=False,
            is_experimental=False,
        )

    @classmethod
    def execute(cls, image, count, text, mode, mask=None) -> io.NodeOutput:
        result = 1.0 - image
        return io.NodeOutput(result, ui=ui.PreviewImage(result, cls=cls))


class MyExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [MyNode]


async def comfy_entrypoint() -> MyExtension:
    return MyExtension()
```

### V3 Production Example (from `nodes_context_windows.py`)

```python
from comfy_api.latest import ComfyExtension, io
import comfy.context_windows

class ContextWindowsManualNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ContextWindowsManual",
            display_name="Context Windows (Manual)",
            category="context",
            description="Manually set context windows.",
            inputs=[
                io.Model.Input("model", tooltip="The model to apply context windows to during sampling."),
                io.Int.Input("context_length", min=1, default=16, tooltip="The length of the context window."),
                io.Int.Input("context_overlap", min=0, default=4, tooltip="The overlap of the context window."),
                io.Combo.Input("context_schedule", options=[
                    comfy.context_windows.ContextSchedules.STATIC_STANDARD,
                    comfy.context_windows.ContextSchedules.UNIFORM_STANDARD,
                ], tooltip="The schedule type."),
                io.Boolean.Input("closed_loop", default=False, tooltip="Whether to use closed loop."),
            ],
            outputs=[
                io.Model.Output(display_name="model", tooltip="The patched model."),
            ],
        )

    @classmethod
    def execute(cls, model: io.Model.Type, context_length: int, context_overlap: int,
                context_schedule: str, closed_loop: bool) -> io.NodeOutput:
        # Process and return
        return io.NodeOutput(patched_model)
```

### V1 → V3 Key Differences

| V1 | V3 |
|----|-----|
| `INPUT_TYPES(s)` | `define_schema(cls)` returning `io.Schema` |
| `FUNCTION = "my_func"` | Always `execute` |
| `def my_func(self, ...)` | `@classmethod def execute(cls, ...)` |
| `return (result,)` | `return io.NodeOutput(result)` |
| `IS_CHANGED` | `fingerprint_inputs` |
| `VALIDATE_INPUTS` | `validate_inputs` |
| `NODE_CLASS_MAPPINGS` | `comfy_entrypoint()` returning `ComfyExtension` |

### V3 Type Reference

**Basic Types:**
| V1 Type | V3 Type |
|---------|---------|
| `"IMAGE"` | `io.Image.Input()` / `io.Image.Output()` |
| `"INT"` | `io.Int.Input()` |
| `"FLOAT"` | `io.Float.Input()` |
| `"STRING"` | `io.String.Input()` |
| `"BOOLEAN"` | `io.Boolean.Input()` |
| `["a", "b"]` | `io.Combo.Input(options=["a", "b"])` |

**Model Types:**
| V1 Type | V3 Type |
|---------|---------|
| `"MODEL"` | `io.Model.Input()` / `io.Model.Output()` |
| `"CLIP"` | `io.Clip.Input()` |
| `"VAE"` | `io.Vae.Input()` |
| `"CONDITIONING"` | `io.Conditioning.Input()` |
| `"LATENT"` | `io.Latent.Input()` |
| `"MASK"` | `io.Mask.Input()` |

**Custom Types:**
```python
# For custom types not in io module
io.Custom("MY_CUSTOM_TYPE").Input("input_name")
io.Custom("MY_CUSTOM_TYPE").Output()
```

**Type Hints for Execute:**
```python
@classmethod
def execute(cls,
            model: io.Model.Type,
            image: io.Image.Type,
            count: int) -> io.NodeOutput:
    # io.Model.Type, io.Image.Type etc. provide type hints
    pass
```

---

## Frontend Extensions (JavaScript)

### Basic Extension

**`js/myextension.js`:**
```javascript
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "my.extension.name",

    async setup() {
        // Called once when extension loads
    },

    async nodeCreated(node) {
        if (node.comfyClass !== "MyNodeClass") return;
        // Customize node
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Modify node definition
    },
});
```

### Server Message Handling

```javascript
app.registerExtension({
    name: "my.extension",
    async setup() {
        app.api.addEventListener("my.custom.message", (event) => {
            console.log(event.detail.message);
        });
    },
});
```

---

## Server Communication

### Sending Messages to Frontend

```python
from server import PromptServer

PromptServer.instance.send_sync(
    "my.custom.message",
    {"message": "Hello!", "node_id": unique_id}
)
```

### Custom API Routes

```python
from aiohttp import web
from server import PromptServer

@PromptServer.instance.routes.get("/hello")
async def get_hello(request):
    return web.json_response("hello")
```

---

## Publishing to Registry

### pyproject.toml

```toml
[project]
name = "my-custom-nodes"
version = "1.0.0"
description = "My awesome custom nodes for ComfyUI"
license = { file = "LICENSE" }
requires-python = ">=3.8"
dependencies = []

[project.urls]
Repository = "https://github.com/username/my-custom-nodes"

[tool.comfy]
PublisherId = "your-publisher-id"
DisplayName = "My Custom Nodes"
Icon = "https://url/to/icon.png"
```

### Publishing Commands

```bash
pip install comfy-cli
comfy node init      # Create pyproject.toml
comfy node validate  # Check before publishing
comfy node publish   # Publish to registry
```

### GitHub Actions Auto-Publish

**`.github/workflows/publish.yaml`:**
```yaml
name: Publish to Comfy Registry
on:
  push:
    branches: [main]
    paths: ['pyproject.toml']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Comfy-Org/publish-node-action@main
        with:
          token: ${{ secrets.REGISTRY_ACCESS_TOKEN }}
```

---

## Best Practices

### Critical Rules

1. **Always return tuples** - Even single outputs: `return (result,)`
2. **IMAGE shape is `[B,H,W,C]`** - Always handle batch dimension
3. **IS_CHANGED quirk** - `True == True` means cached! Use `float("NaN")` to always re-run
4. **INPUT_TYPES uses `s` not `cls`** - Convention from official examples
5. **Trailing comma for single-item tuples** - `("IMAGE",)` not `("IMAGE")`

### Memory Management

```python
import torch
import gc

def process(self, image):
    device = image.device  # Stay on same device
    result = heavy_operation(image)
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return (result,)
```

---

## Resources

### Primary Source (GitHub)
- **Example Node**: `ComfyUI/custom_nodes/example_node.py.example` - The canonical reference
- **Built-in Nodes**: `ComfyUI/nodes.py` - All core node implementations
- **Type Definitions**: `ComfyUI/comfy/comfy_types/node_typing.py` - Node class attribute specs
- **V3 API Types**: `ComfyUI/comfy_api/` - V3 schema definitions
- **Execution Engine**: `ComfyUI/execution.py` - How nodes are actually executed

### Official Documentation
- **Custom Nodes Overview**: https://docs.comfy.org/custom-nodes/overview
- **Backend Properties**: https://docs.comfy.org/custom-nodes/backend/server_overview
- **Data Types**: https://docs.comfy.org/custom-nodes/backend/datatypes
- **Hidden Inputs**: https://docs.comfy.org/custom-nodes/backend/more_on_inputs
- **Lazy Evaluation**: https://docs.comfy.org/custom-nodes/backend/lazy_evaluation
- **V3 Migration Guide**: https://docs.comfy.org/custom-nodes/v3_migration
- **Registry Publishing**: https://docs.comfy.org/registry/publishing

### Community
- **Registry**: https://registry.comfy.org
- **GitHub Issues**: https://github.com/comfyanonymous/ComfyUI/issues (search for your problem first!)
- **Discussions**: https://github.com/comfyanonymous/ComfyUI/discussions

---

*Compiled from ComfyUI source code (master branch) and official documentation - December 2025*
*Always check the source when in doubt - documentation can lag behind code changes*
