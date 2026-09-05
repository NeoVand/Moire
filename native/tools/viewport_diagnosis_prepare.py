"""Create one owned, texture-free postprocess copy material under NullRHI."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import unreal

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / "native/Unreal/MoireComparison"
PACKAGE = "/Game/MoireComparison/ViewportDiagnosis"
NAME = "M_FinalImageCopy"
OWNER = "viewport-diagnosis-v1"


def main():
    if Path(unreal.SystemLibrary.get_project_directory()).resolve() != PROJECT:
        raise RuntimeError("Only run in the isolated MoireComparison project")
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    path = PACKAGE + "/" + NAME
    material = unreal.load_asset(path) if assets.does_asset_exist(path) else None
    if material:
        if assets.get_metadata_tag(material, "MoireComparisonGenerator") != OWNER:
            raise RuntimeError("Refusing to overwrite an unowned diagnostic material")
    else:
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            NAME, PACKAGE, unreal.Material, unreal.MaterialFactoryNew())
    if not material:
        raise RuntimeError("Could not create diagnostic material")
    material.set_editor_property("material_domain", unreal.MaterialDomain.MD_POST_PROCESS)
    material.set_editor_property("blendable_location", unreal.BlendableLocation.BL_SCENE_COLOR_AFTER_TONEMAPPING)
    material.set_editor_property("blendable_priority", 0)
    library = unreal.MaterialEditingLibrary
    library.delete_all_material_expressions(material)
    sample = library.create_material_expression(material, unreal.MaterialExpressionSceneTexture, -300, 0)
    sample.set_editor_property("scene_texture_id", unreal.SceneTextureId.PPI_POST_PROCESS_INPUT0)
    if not library.connect_material_property(sample, "Color", unreal.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError("Could not connect PostProcessInput0 to emissive")
    errors = library.recompile_material(material)
    if errors:
        raise RuntimeError(f"Material errors: {errors}")
    assets.set_metadata_tag(material, "MoireComparisonGenerator", OWNER)
    if not assets.save_loaded_asset(material, False):
        raise RuntimeError("Could not save diagnostic material")
    asset_file = PROJECT / "Content" / (path.removeprefix("/Game/") + ".uasset")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    report = REPO / "native/evidence" / f"viewport-diagnosis-prepare-{stamp}.json"
    report.write_text(json.dumps({"status": "passed", "created_at": stamp,
        "generator": OWNER, "rendered": False, "engine": unreal.SystemLibrary.get_engine_version(),
        "asset": path + "." + NAME, "asset_file": str(asset_file),
        "asset_sha256": hashlib.sha256(asset_file.read_bytes()).hexdigest(),
        "connection": "SceneTexture(PostProcessInput0).Color -> EmissiveColor",
        "domain": "PostProcess", "location": "SceneColorAfterTonemapping",
        "texture_assets": [], "engine_assets_changed": False}, indent=2) + "\n")
    unreal.log(f"Viewport diagnosis preparation: {report}")


if __name__ == "__main__":
    main()
