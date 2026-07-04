from typing import Any

from fastapi import HTTPException, status

CANVAS_WIDTH = 1200
CANVAS_HEIGHT = 800
MAX_WS_MESSAGE_BYTES = 64_000
MAX_TEXT_LENGTH = 2_000
MAX_SHAPES_PER_CANVAS = 500
MAX_OP_PATCH_FIELDS = 16

SHAPE_TYPES = {"rect", "ellipse", "line", "text"}
OP_KINDS = {"create_shape", "update_shape", "delete_shape", "reorder_shape"}
HEX_COLOR_LENGTHS = {4, 7}
COMMON_FIELDS = {
    "id",
    "type",
    "strokeColor",
    "fillColor",
    "strokeOpacity",
    "fillOpacity",
    "strokeWidth",
    "createdBy",
    "updatedAt",
}
TEXT_FIELDS = {"text", "textColor", "textOpacity", "fontSize"}
RECT_FIELDS = {"x", "y", "width", "height"}
ELLIPSE_FIELDS = {"x", "y", "width", "height"}
LINE_FIELDS = {"x1", "y1", "x2", "y2"}
PATCH_FIELDS = (
    COMMON_FIELDS
    | TEXT_FIELDS
    | RECT_FIELDS
    | ELLIPSE_FIELDS
    | LINE_FIELDS
)


def validate_canvas_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Canvas name is required")
    return name


def validate_operation(op: dict[str, Any]) -> None:
    if not isinstance(op.get("id"), str) or len(op["id"]) > 80:
        raise ValueError("Invalid operation id")
    if op.get("kind") not in OP_KINDS:
        raise ValueError("Invalid operation kind")

    kind = op["kind"]
    if kind == "create_shape":
        validate_shape(op.get("shape"))
        return

    shape_id = op.get("shapeId")
    if not isinstance(shape_id, str) or len(shape_id) > 80:
        raise ValueError("Invalid shape id")

    if kind == "update_shape":
        validate_patch(op.get("patch"))
    elif kind == "reorder_shape":
        if not isinstance(op.get("toIndex"), int) or op["toIndex"] < 0:
            raise ValueError("Invalid reorder target")


def validate_shape_count(state: dict[str, Any], op: dict[str, Any]) -> None:
    if op.get("kind") != "create_shape":
        return
    shapes = state.get("shapes")
    if isinstance(shapes, list) and len(shapes) >= MAX_SHAPES_PER_CANVAS:
        raise ValueError("Canvas shape limit reached")


def validate_shape(shape: Any) -> None:
    if not isinstance(shape, dict):
        raise ValueError("Invalid shape")
    shape_type = shape.get("type")
    if shape_type not in SHAPE_TYPES:
        raise ValueError("Invalid shape type")
    if not isinstance(shape.get("id"), str) or len(shape["id"]) > 80:
        raise ValueError("Invalid shape id")
    validate_common_style(shape)

    if shape_type in {"rect", "ellipse"}:
        validate_rect_like(shape)
    elif shape_type == "line":
        validate_line(shape)
    elif shape_type == "text":
        validate_rect_like(shape)
        validate_text_shape(shape)


def validate_patch(patch: Any) -> None:
    if not isinstance(patch, dict):
        raise ValueError("Invalid patch")
    if len(patch) > MAX_OP_PATCH_FIELDS:
        raise ValueError("Patch is too large")
    unknown_fields = set(patch) - PATCH_FIELDS
    if unknown_fields:
        raise ValueError("Patch contains unsupported fields")

    if any(field in patch for field in COMMON_FIELDS):
        validate_common_style(patch, partial=True)
    if any(field in patch for field in RECT_FIELDS | ELLIPSE_FIELDS):
        validate_rect_like(patch, partial=True)
    if any(field in patch for field in LINE_FIELDS):
        validate_line(patch, partial=True)
    if any(field in patch for field in TEXT_FIELDS):
        validate_text_shape(patch, partial=True)


def validate_common_style(value: dict[str, Any], partial: bool = False) -> None:
    required = [] if partial else ["strokeColor", "fillColor", "strokeOpacity", "fillOpacity", "strokeWidth"]
    require_fields(value, required)
    if "strokeColor" in value:
        validate_color(value["strokeColor"])
    if "fillColor" in value:
        validate_color(value["fillColor"])
    if "strokeOpacity" in value:
        validate_range(value["strokeOpacity"], 0, 1, "stroke opacity")
    if "fillOpacity" in value:
        validate_range(value["fillOpacity"], 0, 1, "fill opacity")
    if "strokeWidth" in value:
        validate_range(value["strokeWidth"], 0, 32, "stroke width")
    if "updatedAt" in value and not isinstance(value["updatedAt"], (int, float)):
        raise ValueError("Invalid timestamp")
    if "createdBy" in value and not isinstance(value["createdBy"], str):
        raise ValueError("Invalid creator")


def validate_rect_like(value: dict[str, Any], partial: bool = False) -> None:
    require_fields(value, [] if partial else ["x", "y", "width", "height"])
    for field in ["x", "y", "width", "height"]:
        if field in value:
            validate_range(value[field], -CANVAS_WIDTH, CANVAS_WIDTH * 2, field)
    if "width" in value and value["width"] < 1:
        raise ValueError("Width must be positive")
    if "height" in value and value["height"] < 1:
        raise ValueError("Height must be positive")


def validate_line(value: dict[str, Any], partial: bool = False) -> None:
    require_fields(value, [] if partial else ["x1", "y1", "x2", "y2"])
    for field in ["x1", "y1", "x2", "y2"]:
        if field in value:
            validate_range(value[field], -CANVAS_WIDTH, CANVAS_WIDTH * 2, field)


def validate_text_shape(value: dict[str, Any], partial: bool = False) -> None:
    require_fields(value, [] if partial else ["text", "textColor", "textOpacity", "fontSize"])
    if "text" in value:
        if not isinstance(value["text"], str) or len(value["text"]) > MAX_TEXT_LENGTH:
            raise ValueError("Text is too long")
    if "textColor" in value:
        validate_color(value["textColor"])
    if "textOpacity" in value:
        validate_range(value["textOpacity"], 0, 1, "text opacity")
    if "fontSize" in value:
        validate_range(value["fontSize"], 8, 96, "font size")


def require_fields(value: dict[str, Any], fields: list[str]) -> None:
    missing = [field for field in fields if field not in value]
    if missing:
        raise ValueError("Missing required shape fields")


def validate_color(value: Any) -> None:
    if not isinstance(value, str):
        raise ValueError("Invalid color")
    if len(value) not in HEX_COLOR_LENGTHS or not value.startswith("#"):
        raise ValueError("Invalid color")
    int(value[1:], 16)


def validate_range(value: Any, minimum: float, maximum: float, label: str) -> None:
    if not isinstance(value, (int, float)) or value < minimum or value > maximum:
        raise ValueError(f"Invalid {label}")
