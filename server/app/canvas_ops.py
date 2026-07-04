from copy import deepcopy
from typing import Any
from uuid import uuid4


def normalize_state(value: Any) -> dict[str, Any]:
    """Return a canvas state dict with the expected top-level shape list."""
    if isinstance(value, dict) and isinstance(value.get("shapes"), list):
        return value
    return {"shapes": []}


def apply_operation(state: dict[str, Any], op: dict[str, Any]) -> dict[str, Any]:
    """Apply the small last-write-wins operation set used by the whiteboard."""
    next_state = normalize_state(deepcopy(state))
    shapes = next_state["shapes"]
    kind = op.get("kind")

    if kind == "create_shape":
        shape = op.get("shape")
        if isinstance(shape, dict) and not any(s.get("id") == shape.get("id") for s in shapes):
            shapes.append(shape)
        return next_state

    shape_id = op.get("shapeId")
    if not isinstance(shape_id, str):
        return next_state

    if kind == "update_shape":
        patch = op.get("patch")
        if isinstance(patch, dict):
            for index, shape in enumerate(shapes):
                if shape.get("id") == shape_id:
                    shapes[index] = {**shape, **patch}
                    break
        return next_state

    if kind == "delete_shape":
        next_state["shapes"] = [shape for shape in shapes if shape.get("id") != shape_id]
        return next_state

    if kind == "reorder_shape":
        to_index = op.get("toIndex")
        if not isinstance(to_index, int):
            return next_state
        for index, shape in enumerate(shapes):
            if shape.get("id") == shape_id:
                [moved_shape] = shapes[index : index + 1]
                del shapes[index]
                clamped_index = max(0, min(to_index, len(shapes)))
                shapes.insert(clamped_index, moved_shape)
                break
        return next_state

    return next_state


def invert_operation(state: dict[str, Any], op: dict[str, Any]) -> dict[str, Any] | None:
    """Build an undo operation from the authoritative state before an op is applied."""
    current_state = normalize_state(state)
    shapes = current_state["shapes"]
    kind = op.get("kind")

    if kind == "create_shape":
        shape = op.get("shape")
        if not isinstance(shape, dict) or not isinstance(shape.get("id"), str):
            return None
        if any(existing_shape.get("id") == shape["id"] for existing_shape in shapes):
            return None
        return {"id": str(uuid4()), "kind": "delete_shape", "shapeId": shape["id"]}

    shape_id = op.get("shapeId")
    if not isinstance(shape_id, str):
        return None

    current_shape = next((shape for shape in shapes if shape.get("id") == shape_id), None)
    if current_shape is None:
        return None

    if kind == "update_shape":
        patch = op.get("patch")
        if not isinstance(patch, dict):
            return None
        inverse_patch = {
            key: current_shape[key]
            for key in patch
            if key in current_shape
        }
        return {
            "id": str(uuid4()),
            "kind": "update_shape",
            "shapeId": shape_id,
            "patch": inverse_patch,
        }

    if kind == "delete_shape":
        return {"id": str(uuid4()), "kind": "create_shape", "shape": deepcopy(current_shape)}

    if kind == "reorder_shape":
        current_index = next(
            index for index, shape in enumerate(shapes) if shape.get("id") == shape_id
        )
        return {
            "id": str(uuid4()),
            "kind": "reorder_shape",
            "shapeId": shape_id,
            "toIndex": current_index,
        }

    return None
