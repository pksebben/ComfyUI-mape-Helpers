"""
@author: mape
@title: mape's helpers
@nickname: 🟡 mape's helpers
@version: 0.5.2
@description: Various QoL improvements like prompt tweaking, variable assignment, image preview, fuzzy search, error reporting, organizing and node navigation.
"""

from typing import Any


class MapeVariable:
    """
    Variable node that acts as both a setter (when receiving input) and
    getter (when outputting). Used for "wireless" connections between nodes.
    """

    OUTPUT_NODE = True
    FUNCTION = "func"
    CATEGORY = "mape"
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("value",)
    DESCRIPTION = "Create wireless connections between nodes using named variables"

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "name": (
                    "STRING",
                    {
                        "default": "",
                        "placeholder": "Variable name",
                        "tooltip": "Name of the variable for connecting nodes wirelessly",
                    },
                ),
            },
            "optional": {
                "*": ("*", {}),
            },
            "hidden": {"id": "UNIQUE_ID"},
        }

    @classmethod
    def VALIDATE_INPUTS(s, **kwargs):
        # Accept any input type for the wildcard
        return True

    def func(self, name: str, id: str | None = None, **kwargs: Any) -> tuple[Any, ...]:
        """
        Pass through the input value. The actual routing logic is handled
        by the frontend extension which rewrites the graph before execution.
        """
        # Get the first optional input value (the wildcard input)
        if kwargs:
            # Return the first value passed in
            value = next(iter(kwargs.values()))
            return (value,)
        # If no input, return None (getter node without connection)
        return (None,)


NODE_CLASS_MAPPINGS = {"mape Variable": MapeVariable}
NODE_DISPLAY_NAME_MAPPINGS = {"mape Variable": "🟡 Variable"}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
