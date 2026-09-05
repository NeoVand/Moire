using UnrealBuildTool;

public class MoireCompare : ModuleRules
{
    public MoireCompare(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine" });
        PrivateDependencyModuleNames.AddRange(new[] { "EngineSettings", "RenderCore", "RHI", "Json" });
    }
}
