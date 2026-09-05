"""Prepare the owned synchronized map; no rendering or configuration changes.

Run in the isolated project's Unreal Python commandlet after MoireCompare is
compiled/enabled and the existing fixed/motion materials have been generated.
Only /Game/MoireComparison/Maps/Glide_Comparison is saved. The plugin starts
its runtime behavior in BeginPlay with -MoireSynchronized, not during this script.
"""

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import unreal

SCRIPTS = Path(__file__).resolve().parent
PROJECT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))
import analytic_material
import bootstrap
import scene_contract as contract

OWNER = "native-comparison-v1"
OWNER_TAG = bootstrap.OWNER_TAG
ACTOR_OWNER_TAG = "MoireComparisonGeneratedV1"
MAP_PATH = contract.PACKAGE_ROOT + "/Maps/Glide_Comparison"
MAP_FILE = PROJECT / "Content/MoireComparison/Maps/Glide_Comparison.umap"
ROLES = ("MoirePointGround", "MoireAnalyticGround", "MoireComparisonSky",
         "MoireComparisonCamera", "MoireComparisonDirector")
# These names are created by bootstrap.py and bootstrap_motion.py, respectively.
MATERIALS = {
    "point": ("M_Checker_Detail1", bootstrap.OWNER),
    "analytic": ("M_MotionAnalytic_Detail1", "native-motion-v1"),
    "sky": ("M_Sky", bootstrap.OWNER),
}
require = bootstrap.require


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def hashes(files):
    return {str(file.relative_to(PROJECT)): sha(file) for file in sorted(files)}


def director_class():
    value = getattr(unreal, "MoireComparisonDirector", None)
    require(value is not None,
            "MoireComparisonDirector is unavailable. Build and enable the project-local "
            "MoireCompare plugin, then restart this isolated Unreal commandlet; no map was changed.")
    return value


def load_material(assets, name, owner):
    path = contract.PACKAGE_ROOT + "/Materials/" + name
    value = require(unreal.load_asset(path), "Prepare the existing material first: " + path)
    require(isinstance(value, unreal.Material), "Expected a Material: " + path)
    require(assets.get_metadata_tag(value, OWNER_TAG) == owner,
            "Material is not owned by its existing generator: " + path)
    require(value.get_editor_property("shading_model") == unreal.MaterialShadingModel.MSM_UNLIT,
            "Comparison requires the existing unlit material: " + path)
    return value


def mark_actor(actor, role):
    actor.set_editor_property("tags", [unreal.Name(ACTOR_OWNER_TAG), unreal.Name(role)])
    actor.set_actor_label(bootstrap.ACTOR_PREFIX + role)
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    if component:
        # Editor property changes may reapply the saved collision profile.
        # Persist NoCollision as the profile as well as the current enabled flag.
        component.set_collision_profile_name("NoCollision")
        component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    return actor


def owned_actors(actors, director_type):
    """Validate all potentially conflicting actors before deleting any actor."""
    owned = []
    for actor in actors.get_all_level_actors():
        tagged = actor.actor_has_tag(ACTOR_OWNER_TAG)
        if tagged:
            owned.append(actor)
        elif any(actor.actor_has_tag(role) for role in ROLES) or isinstance(
                actor, (unreal.StaticMeshActor, unreal.CameraActor, director_type)):
            raise RuntimeError("Refusing to replace an unowned comparison actor: " + actor.get_path_name())
    return owned


def verify_scene(actors, assets, director_type, materials, pose, plane, plane_scale):
    all_actors = actors.get_all_level_actors()
    roles = {}
    for role in ROLES:
        matches = [actor for actor in all_actors if actor.actor_has_tag(role)]
        require(len(matches) == 1, "Expected exactly one actor tagged " + role)
        actor = matches[0]
        require(actor.actor_has_tag(ACTOR_OWNER_TAG), "Actor ownership tag missing: " + role)
        require(actor.get_path_name().startswith(MAP_PATH + "."), "Actor belongs to another map: " + role)
        roles[role] = actor
    require(len([actor for actor in all_actors if actor.actor_has_tag(ACTOR_OWNER_TAG)]) == len(ROLES),
            "Unexpected extra generated actors")
    for role, material in [("MoirePointGround", materials["point"]),
                           ("MoireAnalyticGround", materials["analytic"])]:
        actor = roles[role]
        component = require(actor.get_component_by_class(unreal.StaticMeshComponent), "Ground component missing")
        require(component.get_editor_property("static_mesh") == plane, "Ground mesh changed")
        require(component.get_material(0) == material, "Ground material changed: " + role)
        location, scale = actor.get_actor_location(), actor.get_actor_scale3d()
        rotation = actor.get_actor_rotation()
        require(all(abs(getattr(location, axis)) < 1e-6 for axis in ("x", "y", "z")),
                "Ground planes must share the source origin")
        require(all(math.isclose(getattr(scale, axis), expected, rel_tol=1e-6)
                    for axis, expected in zip(("x", "y", "z"), plane_scale)), "Ground scale changed")
        require(all(abs(getattr(rotation, axis)) < 1e-6 for axis in ("pitch", "yaw", "roll")),
                "Ground rotation changed")
        require(not component.get_editor_property("cast_shadow"), "Ground shadows must stay disabled")
        collision = component.get_collision_enabled()
        require(collision == unreal.CollisionEnabled.NO_COLLISION,
                "Ground collision must stay disabled; observed " + str(collision))
    sky_component = require(roles["MoireComparisonSky"].get_component_by_class(unreal.StaticMeshComponent),
                            "Shared sky component missing")
    require(sky_component.get_material(0) == materials["sky"], "Shared sky material changed")
    camera = roles["MoireComparisonCamera"]
    require(isinstance(camera, unreal.CameraActor), "Comparison camera type changed")
    component = camera.get_component_by_class(unreal.CameraComponent)
    location, rotation = camera.get_actor_location(), camera.get_actor_rotation()
    observed = {
        "location_cm": [getattr(location, axis) for axis in ("x", "y", "z")],
        "rotation_degrees": {axis: getattr(rotation, axis) for axis in ("pitch", "yaw", "roll")},
        "horizontal_fov_degrees": component.get_editor_property("field_of_view"),
        "aspect_ratio": component.get_editor_property("aspect_ratio"),
        "constrain_aspect_ratio": component.get_editor_property("constrain_aspect_ratio"),
    }
    require(all(abs(a - b) < 0.001 for a, b in zip(observed["location_cm"], pose["unreal_location_cm"])),
            "Initial camera location differs from Glide0")
    require(all(abs(observed["rotation_degrees"][axis] - pose["unreal_rotation_degrees"][axis]) < 1e-4
                for axis in ("pitch", "yaw", "roll")), "Initial camera rotation differs from Glide0")
    require(abs(observed["horizontal_fov_degrees"] - contract.HORIZONTAL_FOV_DEGREES) < 1e-4,
            "Camera FOV changed")
    require(abs(observed["aspect_ratio"] - contract.WIDTH / contract.HEIGHT) < 1e-6
            and observed["constrain_aspect_ratio"], "Camera aspect changed")
    director = roles["MoireComparisonDirector"]
    require(isinstance(director, director_type), "Director class changed")
    require(director.get_editor_property("motion_name") == "glide", "Director motion is not glide")
    world = require(unreal.load_asset(MAP_PATH), "Comparison world missing")
    require(assets.get_metadata_tag(world, OWNER_TAG) == OWNER, "Comparison map owner changed")
    return {"roles": {role: actor.get_path_name() for role, actor in roles.items()},
            "camera": observed, "director_class": director.get_class().get_path_name(),
            "motion_name": director.get_editor_property("motion_name")}


def main():
    require(Path(unreal.SystemLibrary.get_project_directory()).resolve() == PROJECT,
            "Run only in the isolated MoireComparison project; no assets changed.")
    protected = [p for p in (PROJECT / "Content").rglob("*")
                 if p.is_file() and p.suffix in (".uasset", ".umap", ".uexp", ".ubulk") and p != MAP_FILE]
    sources = [Path(__file__), SCRIPTS / "bootstrap.py", SCRIPTS / "bootstrap_motion.py",
               SCRIPTS / "scene_contract.py", SCRIPTS / "analytic_material.py", SCRIPTS / "dynamic_material.py"]
    sources += [p for p in (PROJECT / "Plugins/MoireCompare").rglob("*")
                if p.is_file() and p.suffix in (".cpp", ".h", ".cs", ".uplugin")
                and "Intermediate" not in p.parts]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    report_path = PROJECT / "Saved/MoireComparison" / f"prepare-comparison-{stamp}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {"created_at": stamp, "status": "running", "generator": OWNER,
              "engine": unreal.SystemLibrary.get_engine_version(), "project": str(PROJECT),
              "map": MAP_PATH, "rendered": False, "runtime_verified": False,
              "configuration_written_by_script": False, "existing_materials_saved": False,
              "protected_assets_before": hashes(protected), "source_hashes_before": hashes(sources),
              "runtime_requirement": "Project-local MoireCompare plugin; ordinary -game -MoireSynchronized launch",
              "initial_pane_aspect": [16, 9], "example_window_pixels": [1920, 360],
              "example_pane_pixels": [640, 360]}

    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")

    save()
    try:
        director_type = director_class()  # Clear preflight failure before any map operation.
        report["kernel"] = analytic_material.staged_kernel(PROJECT)
        assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
        actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        materials = {role: load_material(assets, *spec) for role, spec in MATERIALS.items()}
        report["materials"] = {role: {"path": mat.get_path_name(),
            "sha256": sha(PROJECT / "Content/MoireComparison/Materials" / (MATERIALS[role][0] + ".uasset"))}
            for role, mat in materials.items()}
        plane = require(unreal.load_asset("/Engine/BasicShapes/Plane"), "Engine Plane missing")
        sphere = require(unreal.load_asset("/Engine/BasicShapes/Sphere"), "Engine Sphere missing")
        bounds = plane.get_bounding_box()
        sizes = [getattr(bounds.max, axis) - getattr(bounds.min, axis) for axis in ("x", "y", "z")]
        require(min(sizes[:2]) > 0 and sizes[2] < max(sizes[:2]) * 1e-4, "Engine plane must be in XY")
        bounds = sphere.get_bounding_box()
        diameter = max(getattr(bounds.max, axis) - getattr(bounds.min, axis) for axis in ("x", "y", "z"))
        require(diameter > 0, "Invalid sky mesh bounds")
        width = contract.PLANE_WIDTH_WORLD * contract.CM_PER_WORLD_UNIT
        scale = (width / sizes[0], width / sizes[1], 1.0)
        pose = contract.camera_pose(next(p for p in contract.POSES if p["name"] == "Glide0"))
        report["initial_pose"] = pose
        report["plane_width_cm"] = width

        existing = assets.does_asset_exist(MAP_PATH)
        if existing:
            world = require(unreal.load_asset(MAP_PATH), "Could not load existing comparison map")
            require(assets.get_metadata_tag(world, OWNER_TAG) == OWNER,
                    "Refusing to modify a map without native-comparison-v1 ownership")
        require(levels.load_level(MAP_PATH) if existing else levels.new_level(MAP_PATH, False),
                "Could not open the owned comparison map")
        world = require(unreal.load_asset(MAP_PATH), "Comparison world missing")
        if not existing:
            assets.set_metadata_tag(world, OWNER_TAG, OWNER)
            require(levels.save_current_level(), "Could not persist new map ownership")
        for actor in owned_actors(actors, director_type):
            require(actors.destroy_actor(actor), "Could not replace an owned comparison actor")
        for role, material in [("MoirePointGround", materials["point"]),
                               ("MoireAnalyticGround", materials["analytic"])]:
            mark_actor(bootstrap.mesh_actor(actors, role, plane, material, scale), role)
        mark_actor(bootstrap.mesh_actor(actors, "ComparisonSky", sphere, materials["sky"],
                                      (width * 4.0 / diameter,) * 3), "MoireComparisonSky")
        camera = mark_actor(require(actors.spawn_actor_from_class(unreal.CameraActor,
            unreal.Vector(*pose["unreal_location_cm"]), unreal.Rotator(**pose["unreal_rotation_degrees"])),
            "Could not create shared camera"), "MoireComparisonCamera")
        camera.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
        component = camera.get_component_by_class(unreal.CameraComponent)
        component.set_field_of_view(contract.HORIZONTAL_FOV_DEGREES)
        component.set_aspect_ratio(contract.WIDTH / contract.HEIGHT)
        component.set_constraint_aspect_ratio(True)
        component.set_editor_property("post_process_blend_weight", 0.0)
        director = mark_actor(require(actors.spawn_actor_from_class(director_type, unreal.Vector(), unreal.Rotator()),
                                      "Could not create comparison director"), "MoireComparisonDirector")
        director.set_editor_property("motion_name", "glide")
        report["verification"] = verify_scene(actors, assets, director_type, materials, pose, plane, scale)
        require(levels.save_current_level(), "Could not save comparison map")
        report["map_sha256"] = sha(MAP_FILE)
        require(levels.load_level(MAP_PATH), "Could not reload comparison map")
        report["reload_verification"] = verify_scene(actors, assets, director_type, materials, pose, plane, scale)
        require(report["verification"] == report["reload_verification"], "Persisted comparison scene changed")
        require(sha(MAP_FILE) == report["map_sha256"], "Read-only reload changed the map file")
        report["protected_assets_after"] = hashes(protected)
        report["source_hashes_after"] = hashes(sources)
        require(report["protected_assets_before"] == report["protected_assets_after"], "Existing assets changed")
        require(report["source_hashes_before"] == report["source_hashes_after"], "Generator/plugin source changed")
        report["status"] = "passed"
    except Exception as error:
        report.update({"status": "failed", "failure": str(error)})
        raise
    finally:
        try:
            report["protected_assets_after"] = hashes(protected)
            report["protected_assets_unchanged"] = report["protected_assets_before"] == report["protected_assets_after"]
            report["source_hashes_after"] = hashes(sources)
            report["source_unchanged"] = report["source_hashes_before"] == report["source_hashes_after"]
        except Exception as audit_error:
            report["preservation_audit_error"] = str(audit_error)
        save()
        unreal.log("Moire synchronized comparison preparation: " + str(report_path))


if __name__ == "__main__":
    main()
