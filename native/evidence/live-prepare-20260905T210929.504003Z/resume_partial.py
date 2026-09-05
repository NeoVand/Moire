from pathlib import Path
import hashlib, sys, unreal
project = Path('/Users/neo/repos/Moire/native/Unreal/MoireComparison')
sys.path.insert(0, str(project/'Scripts'))
import prepare_live as live
asset_path = '/Game/MoireComparison/Maps/Glide_LiveRaw'
file = project/'Content/MoireComparison/Maps/Glide_LiveRaw.umap'
assert hashlib.sha256(file.read_bytes()).hexdigest() == '7bde30e6e2bfc99ee7caa792d4dfec510bd6ca042822238c1736a349d17c113b'
assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert levels.load_level(asset_path)
world = unreal.load_asset(asset_path)
assert assets.get_metadata_tag(world, live.OWNER_TAG) == 'native-scene-v1'
assets.set_metadata_tag(world, live.OWNER_TAG, live.OWNER)
assets.set_metadata_tag(world, 'MoireLiveSourceMap', '/Game/MoireComparison/Maps/Glide0')
source = project/'Content/MoireComparison/Maps/Glide0.umap'
assets.set_metadata_tag(world, 'MoireLiveSourceSHA256', hashlib.sha256(source.read_bytes()).hexdigest())
assert levels.save_current_level()
live.main()
