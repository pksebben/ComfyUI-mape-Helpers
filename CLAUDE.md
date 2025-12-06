# Development Guidelines

This document contains critical information about working with this codebase. Follow these guidelines precisely.

## ComfyUI Docs

Comfyui follows it's own patterns, so references for particular work are included in
this repo:
  * for custom node backend stuff: COMFYUI_CUSTOM_NODE_REFERENCE.md
  * for frontend work: COMFYUI_FRONTEND_REFERENCE.md

make sure to check these before doing work on those components.  In the event that you
find information in either file to be in error, save a fixed copy as FILENAME.md.FIXES
and make sure to include a note in the PR.

When those files are insufficient or wrong, the source of truth is the currrent main
of the comfyUI source code in git.  Find it here: https://github.com/comfyanonymous/ComfyUI

## Development Philosophy

- **Simplicity**: Write simple, straightforward code
- **Readability**: Make code easy to understand
- **Performance**: Consider performance without sacrificing readability
- **Maintainability**: Write code that's easy to update
- **Testability**: Ensure code is testable
- **Reusability**: Create reusable components and functions
- **Less Code = Less Debt**: Minimize code footprint

## Code Formatting

1. Ruff
   - Format: `uv run ruff format .`
   - Check: `uv run ruff check .`
   - Fix: `uv run ruff check . --fix`
   - Critical issues:
     - Line length (88 chars)
     - Import sorting (I001)
     - Unused imports
   - Line wrapping:
     - Strings: use parentheses
     - Function calls: multi-line with proper indent
     - Imports: split into multiple lines

2. Type Checking
  - run `pyrefly init` to start
  - run `pyrefly check` after every change and fix resultings errors
   - Requirements:
     - Explicit None checks for Optional
     - Type narrowing for strings
     - Version warnings can be ignored if checks pass
