"""Run in this project's Unreal Python commandlet; see native/README.md.

Creates only /Game/MoireComparison assets. Re-running replaces generated nodes
and actors in those assets, without deleting any other package or actor.
This creates assets; it does not render, benchmark, or validate native pixels.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import unreal

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
if SCRIPT_DIR.as_posix() not in sys.path:
    sys.path.insert(0, SCRIPT_DIR.as_posix())
import scene_contract as contract

OWNER_TAG = "MoireComparisonGenerator"
OWNER = "native-scene-v1"
ACTOR_PREFIX = "MoireGenerated_"


def require(value, message):
    if not value:
        raise RuntimeError(message)
    return value


def checked_asset(assets, path):
    require(path.startswith(contract.PACKAGE_ROOT + "/"), f"Unscoped asset: {path}")
    asset = unreal.load_asset(path) if assets.does_asset_exist(path) else None
    if asset:
        require(assets.get_metadata_tag(asset, OWNER_TAG) == OWNER,
                f"Refusing to overwrite asset without this generator's ownership tag: {path}")
    return asset


def material(assets, tools, name, code, world_position=False):
    path = contract.PACKAGE_ROOT + "/Materials/" + name
    value = checked_asset(assets, path)
    if value is None:
        value = require(tools.create_asset(name, contract.PACKAGE_ROOT + "/Materials",
                                          unreal.Material, unreal.MaterialFactoryNew()), path)
    require(isinstance(value, unreal.Material), f"Expected Material: {path}")
    value.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    value.set_editor_property("two_sided", True)
    library = unreal.MaterialEditingLibrary
    library.delete_all_material_expressions(value)
    custom = library.create_material_expression(value, unreal.MaterialExpressionCustom, -300, 0)
    custom.set_editor_property("code", code)
    custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    custom.set_editor_property("inputs", [])
    if world_position:
        world_input = unreal.CustomInput()
        world_input.set_editor_property("input_name", "WorldPosition")
        custom.set_editor_property("inputs", [world_input])
        position = library.create_material_expression(value, unreal.MaterialExpressionWorldPosition, -600, 0)
        # Its default is absolute world position, including WPO; this mesh has no WPO.
        require(library.connect_material_expressions(position, "", custom, "WorldPosition"),
                "Could not connect the absolute world position")
    require(library.connect_material_property(custom, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR),
            "Could not connect the unlit emissive material")
    errors = library.recompile_material(value)
    require(not errors, f"Material compilation errors: {errors}")
    assets.set_metadata_tag(value, OWNER_TAG, OWNER)
    require(assets.save_loaded_asset(value, False), f"Could not save {path}")
    return value


def mesh_actor(actors, label, mesh, mat, scale):
    actor = require(actors.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0)), label)
    actor.set_actor_label(ACTOR_PREFIX + label)
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    require(component.set_static_mesh(mesh), f"Could not assign {label} mesh")
    component.set_material(0, mat)
    component.set_editor_property("cast_shadow", False)
    component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    actor.set_actor_scale3d(unreal.Vector(*scale))
    return actor


def main():
    active_project = Path(unreal.SystemLibrary.get_project_directory()).resolve()
    require(active_project == PROJECT_DIR,
            f"Wrong project: {active_project}. Run only in {PROJECT_DIR}; no assets changed.")
    require((PROJECT_DIR / "MoireComparison.uproject").is_file(), "Project descriptor missing")
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    for folder in ["Materials", "Maps"]:
        assets.make_directory(contract.PACKAGE_ROOT + "/" + folder)

    checks = {}
    for detail in (1, 2):
        checks[detail] = material(assets, tools, f"M_Checker_Detail{detail}",
                                 contract.checker_code(contract.BASE_PERIOD_WORLD / detail), True)
    sky = material(assets, tools, "M_Sky", "return float3(%s);" % ", ".join(map(str, contract.SKY)))
    plane = require(unreal.load_asset("/Engine/BasicShapes/Plane"), "Engine Plane mesh missing")
    sphere = require(unreal.load_asset("/Engine/BasicShapes/Sphere"), "Engine Sphere mesh missing")
    bounds = plane.get_bounding_box()
    plane_size = tuple(getattr(bounds.max, k) - getattr(bounds.min, k) for k in ("x", "y", "z"))
    require(min(plane_size[:2]) > 0 and plane_size[2] < max(plane_size[:2]) * 1e-4,
            f"Engine Plane is not aligned with XY: {plane_size}")
    desired_width = contract.PLANE_WIDTH_WORLD * contract.CM_PER_WORLD_UNIT
    sphere_bounds = sphere.get_bounding_box()
    sphere_diameter = max(getattr(sphere_bounds.max, k) - getattr(sphere_bounds.min, k) for k in ("x", "y", "z"))
    require(sphere_diameter > 0, "Invalid Engine Sphere bounds")

    pose_records = []
    for pose in contract.POSES:
        info = contract.camera_pose(pose)
        path = contract.PACKAGE_ROOT + "/Maps/" + pose["name"]
        existing = checked_asset(assets, path)
        require(levels.load_level(path) if existing else levels.new_level(path, False), f"Could not open {path}")
        # Framework actors are left alone; only our marked generated actors are replaced.
        for actor in actors.get_all_level_actors():
            if actor.get_actor_label().startswith(ACTOR_PREFIX):
                require(actors.destroy_actor(actor), "Could not replace generated actor")
        mesh_actor(actors, "Ground", plane, checks[int(pose["detail"])],
                   (desired_width / plane_size[0], desired_width / plane_size[1], 1.0))
        # Constant unlit background, beyond the ground's outer corners. No light or atmosphere.
        sky_scale = desired_width * 4.0 / sphere_diameter
        mesh_actor(actors, "Sky", sphere, sky, (sky_scale,) * 3)
        rotation = unreal.Rotator(**info["unreal_rotation_degrees"])
        camera = require(actors.spawn_actor_from_class(unreal.CameraActor,
                         unreal.Vector(*info["unreal_location_cm"]), rotation), "Could not create camera")
        camera.set_actor_label(ACTOR_PREFIX + "Camera")
        camera.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
        component = camera.get_component_by_class(unreal.CameraComponent)
        component.set_field_of_view(contract.HORIZONTAL_FOV_DEGREES)
        component.set_aspect_ratio(contract.WIDTH / contract.HEIGHT)
        component.set_constraint_aspect_ratio(True)
        component.set_editor_property("post_process_blend_weight", 0.0)
        world = require(unreal.load_asset(path), f"Could not reload map package {path}")
        assets.set_metadata_tag(world, OWNER_TAG, OWNER)
        require(levels.save_current_level(), f"Could not save {path}")
        pose_records.append({**info, "map": path})

    require(levels.load_level(contract.PACKAGE_ROOT + "/Maps/Glide0"), "Could not reopen first pose")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    output = PROJECT_DIR / "Saved" / "MoireComparison"
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "created_at": stamp, "engine": unreal.SystemLibrary.get_engine_version(),
        "project": str(PROJECT_DIR), "generator": OWNER,
        "status": "assets-generated; native rendering and camera activation not yet verified",
        "rendered": False, "width": contract.WIDTH, "height": contract.HEIGHT,
        "vertical_fov_degrees": contract.VERTICAL_FOV_DEGREES,
        "horizontal_fov_degrees": contract.HORIZONTAL_FOV_DEGREES,
        "plane_width_cm": desired_width, "engine_plane_bounds_cm": plane_size,
        "source": "equal half-cell parity; unfiltered procedural checker",
        "poses": pose_records,
        "hashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in [Path(__file__), SCRIPT_DIR / "scene_contract.py"]},
    }
    report_path = output / f"bootstrap-{stamp}.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    unreal.log(f"Moire comparison assets generated. Metadata: {report_path}. No rendering validation performed.")


if __name__ == "__main__":
    main()
