"""Read installed FinalImage material properties under NullRHI; never save assets."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import unreal

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / "native/Unreal/MoireComparison"


def main():
    if Path(unreal.SystemLibrary.get_project_directory()).resolve() != PROJECT:
        raise RuntimeError("Only run in the isolated MoireComparison project")
    engine = Path(unreal.Paths.engine_dir()).resolve()
    asset_file = engine / "Content/BufferVisualization/FinalImage.uasset"
    before = hashlib.sha256(asset_file.read_bytes()).hexdigest()
    material = unreal.load_asset("/Engine/BufferVisualization/FinalImage.FinalImage")
    if material is None:
        raise RuntimeError("Installed FinalImage material is missing")
    properties = {key: str(material.get_editor_property(key)) for key in
                  ("material_domain", "blendable_location", "blendable_priority", "blend_mode")}
    capture_defaults = unreal.get_default_object(unreal.CompositionGraphCaptureProtocol)
    capture_properties = {key: str(capture_defaults.get_editor_property(key)) for key in
                          ("post_processing_material", "capture_gamut", "capture_frames_in_hdr", "disable_screen_percentage")}
    expressions = []
    for expression in unreal.ObjectIterator(unreal.MaterialExpression):
        if "/BufferVisualization/FinalImage." not in expression.get_path_name():
            continue
        entry = {"path": expression.get_path_name(), "class": expression.get_class().get_name()}
        input_names = list(unreal.MaterialEditingLibrary.get_material_expression_input_names(expression))
        input_nodes = list(unreal.MaterialEditingLibrary.get_inputs_for_material_expression(material, expression))
        entry["inputs"] = [{"name": name, "node": node.get_path_name() if node else None}
                           for name,node in zip(input_names,input_nodes)]
        if isinstance(expression, unreal.MaterialExpressionSceneTexture):
            entry["scene_texture_id"] = str(expression.get_editor_property("scene_texture_id"))
        expressions.append(entry)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    output = REPO / "native/evidence" / f"viewport-diagnosis-material-{stamp}.json"
    output.write_text(json.dumps({"created_at": stamp, "engine": unreal.SystemLibrary.get_engine_version(),
        "rendered": False, "saved_assets": False, "asset": str(asset_file), "asset_sha256": before,
        "asset_unchanged": before == hashlib.sha256(asset_file.read_bytes()).hexdigest(),
        "properties": properties, "capture_defaults": capture_properties,
        "emissive_input": unreal.MaterialEditingLibrary.get_material_property_input_node(
            material, unreal.MaterialProperty.MP_EMISSIVE_COLOR).get_path_name(),
        "expressions": expressions}, indent=2) + "\n")
    unreal.log(f"Viewport diagnosis material inspection: {output}")


if __name__ == "__main__":
    main()
