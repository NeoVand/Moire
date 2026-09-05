"""Generate separate perspective camera-following materials and maps.

The existing fixed-pose capture assets remain controls and are not modified.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import unreal

SCRIPTS = Path(__file__).resolve().parent
PROJECT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))
import analytic_material
import bootstrap
import dynamic_material
import scene_contract as contract

OWNER = "native-motion-v1"
require = bootstrap.require


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked(assets, path):
    require(path.startswith(contract.PACKAGE_ROOT + "/"), "Asset outside owned namespace")
    obj = unreal.load_asset(path) if assets.does_asset_exist(path) else None
    if obj:
        require(assets.get_metadata_tag(obj, bootstrap.OWNER_TAG) == OWNER,
                "Refusing to replace unowned motion asset: " + path)
    return obj


def material(assets, tools, name, period, diagnostic):
    path = contract.PACKAGE_ROOT + "/Materials/" + name
    value = checked(assets, path)
    if value is None:
        value = require(tools.create_asset(name, contract.PACKAGE_ROOT + "/Materials",
                                          unreal.Material, unreal.MaterialFactoryNew()), path)
    value.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    value.set_editor_property("two_sided", True)
    library = unreal.MaterialEditingLibrary
    library.delete_all_material_expressions(value)
    custom = library.create_material_expression(value, unreal.MaterialExpressionCustom, -300, 0)
    custom.set_editor_property("code", dynamic_material.checker_code(period, diagnostic))
    custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    custom.set_editor_property("include_file_paths", [analytic_material.INCLUDE])
    connections = [("WorldPosition", unreal.MaterialExpressionWorldPosition),
                   ("LinearDepth", unreal.MaterialExpressionPixelDepth)]
    inputs = []
    for name, _ in connections:
        item = unreal.CustomInput()
        item.set_editor_property("input_name", name)
        inputs.append(item)
    custom.set_editor_property("inputs", inputs)
    for index, (name, expression) in enumerate(connections):
        source = library.create_material_expression(value, expression, -600, index * 200)
        require(library.connect_material_expressions(source, "", custom, name), "Input connection failed")
    require(library.connect_material_property(custom, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR),
            "Emissive connection failed")
    require(not library.recompile_material(value), "Material recompile failed")
    assets.set_metadata_tag(value, bootstrap.OWNER_TAG, OWNER)
    require(assets.save_loaded_asset(value, False), "Material save failed")
    return value


def main():
    require(Path(unreal.SystemLibrary.get_project_directory()).resolve() == PROJECT, "Wrong project")
    kernel = analytic_material.staged_kernel(PROJECT)
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    controls = sorted((PROJECT / "Content/MoireComparison").glob("Materials/*.uasset"))
    controls += sorted((PROJECT / "Content/MoireComparison").glob("Maps/*.umap"))
    controls = [p for p in controls if "Motion" not in p.name and "Regimes" not in p.name]
    before = {str(p.relative_to(PROJECT)): sha(p) for p in controls}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    report_path = PROJECT / "Saved/MoireComparison" / f"bootstrap-motion-{stamp}.json"
    report = {"created_at": stamp, "status": "running", "generator": OWNER,
              "rendered": False, "kernel": kernel, "controls_before": before, "maps": [],
              "projection": "perspective only", "unsupported_color": [1, 0, 1],
              "invalid_inputs_color": [1, 0, 0]}
    def save():
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    save()
    try:
        sky = require(unreal.load_asset(contract.PACKAGE_ROOT + "/Materials/M_Sky"), "Prepare fixed scenes first")
        require(assets.get_metadata_tag(sky, bootstrap.OWNER_TAG) == bootstrap.OWNER, "Sky ownership mismatch")
        plane = require(unreal.load_asset("/Engine/BasicShapes/Plane"), "Plane missing")
        sphere = require(unreal.load_asset("/Engine/BasicShapes/Sphere"), "Sphere missing")
        bounds = plane.get_bounding_box()
        sizes = [getattr(bounds.max, k) - getattr(bounds.min, k) for k in ("x", "y")]
        bounds = sphere.get_bounding_box()
        diameter = max(getattr(bounds.max, k) - getattr(bounds.min, k) for k in ("x", "y", "z"))
        width = contract.PLANE_WIDTH_WORLD * contract.CM_PER_WORLD_UNIT
        for pose in (contract.POSES[0], contract.POSES[2]):
            info = contract.camera_pose(pose)
            mat = material(assets, tools, "M_MotionAnalytic_Detail" + str(int(pose["detail"])), info["period_world"], False)
            material(assets, tools, "M_MotionRegimes_Detail" + str(int(pose["detail"])), info["period_world"], True)
            path = contract.PACKAGE_ROOT + "/Maps/" + pose["name"] + "_MotionAnalytic"
            existing = checked(assets, path)
            require(levels.load_level(path) if existing else levels.new_level(path, False), "Could not open motion map")
            for actor in actors.get_all_level_actors():
                if actor.get_actor_label().startswith(bootstrap.ACTOR_PREFIX):
                    require(actors.destroy_actor(actor), "Could not replace owned actor")
            bootstrap.mesh_actor(actors, "Ground", plane, mat, (width / sizes[0], width / sizes[1], 1))
            bootstrap.mesh_actor(actors, "Sky", sphere, sky, (width * 4 / diameter,) * 3)
            camera = require(actors.spawn_actor_from_class(unreal.CameraActor,
                unreal.Vector(*info["unreal_location_cm"]), unreal.Rotator(**info["unreal_rotation_degrees"])), "Camera creation failed")
            camera.set_actor_label(bootstrap.ACTOR_PREFIX + "Camera")
            camera.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
            component = camera.get_component_by_class(unreal.CameraComponent)
            component.set_field_of_view(contract.HORIZONTAL_FOV_DEGREES)
            component.set_aspect_ratio(contract.WIDTH / contract.HEIGHT)
            component.set_constraint_aspect_ratio(True)
            component.set_editor_property("post_process_blend_weight", 0.0)
            world = require(unreal.load_asset(path), "Could not load map package")
            assets.set_metadata_tag(world, bootstrap.OWNER_TAG, OWNER)
            require(levels.save_current_level(), "Could not save motion map")
            report["maps"].append({"map": path, "pose": info, "material": mat.get_path_name(),
                "map_sha256": sha(PROJECT / "Content" / (path.removeprefix("/Game/") + ".umap"))})
            save()
        report["controls_after"] = {str(p.relative_to(PROJECT)): sha(p) for p in controls}
        require(before == report["controls_after"], "Fixed capture controls changed")
        report["script_hashes"] = {p.name: sha(p) for p in [Path(__file__), SCRIPTS / "dynamic_material.py"]}
        report["status"] = "passed"
    except Exception as error:
        report.update({"status": "failed", "failure": str(error)})
        raise
    finally:
        save()
        unreal.log("Moire motion bootstrap: " + str(report_path))


if __name__ == "__main__":
    main()
