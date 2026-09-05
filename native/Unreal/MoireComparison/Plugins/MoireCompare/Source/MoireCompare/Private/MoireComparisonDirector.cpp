#include "MoireComparisonDirector.h"

#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Camera/CameraTypes.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameMapsSettings.h"
#include "HAL/FileManager.h"
#include "HAL/IConsoleManager.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreDelegates.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Misc/ScopeLock.h"
#include "RHIResources.h"
#include "SceneManagement.h"
#include "SceneView.h"
#include "SceneViewExtension.h"
#include "Serialization/JsonSerializer.h"
#include "UnrealClient.h"

DEFINE_LOG_CATEGORY_STATIC(LogMoireCompare, Log, All);

namespace
{
struct FPoseSample
{
    uint64 GameFrame = 0;
    double SourceTime = 0;
    int32 LoopIndex = 0;
    bool ExplicitCut = false;
    FVector Location = FVector::ZeroVector;
    FRotator Rotation = FRotator::ZeroRotator;
};

struct FViewObservation
{
    FPoseSample Pose;
    int32 Arm = INDEX_NONE;
    int32 ControllerId = INDEX_NONE;
    uint32 RenderFrameNumber = 0;
    uint32 ViewKey = 0;
    UPTRINT StateIdentity = 0;
    int32 AA = 0;
    int32 Scaling = 0;
    bool AllowJitter = false;
    bool CameraCut = false;
    bool ThirdPartyUpscaler = false;
    bool Offline = false;
    float SecondaryFraction = 0;
    bool PrimaryRasterObserved = false;
    FIntRect PrimaryRasterRect = FIntRect(0, 0, 0, 0);
    FIntRect OutputRect;
    FIntRect UnconstrainedRect;
    FVector Location;
    FRotator Rotation;
    FVector2D Jitter;
    FMatrix WorldToView;
    FMatrix ProjectionNoAA;
};

struct FSharedViewState
{
    FCriticalSection Mutex;
    TMap<int32, int32> ArmByController;
    TMap<uint64, FPoseSample> Poses;
    TArray<FViewObservation> Observations;
    // A game tick may submit more than one real render family (notably startup).
    TMap<uint64, TMap<uint32, uint8>> ObservedFamilies;
    FString Error;
    uint64 FirstGameFrame = MAX_uint64;
    int32 ObserveFrames = 120;
    bool ThirdTSR = false;
    bool ObservePrimaryRaster = false;

    void SetError(const FString& Text)
    {
        FScopeLock Lock(&Mutex);
        if (Error.IsEmpty()) Error = Text;
    }
};

TArray<TSharedPtr<FJsonValue>> Numbers(std::initializer_list<double> Values)
{
    TArray<TSharedPtr<FJsonValue>> Result;
    for (double Value : Values) Result.Add(MakeShared<FJsonValueNumber>(Value));
    return Result;
}
TArray<TSharedPtr<FJsonValue>> MatrixJSON(const FMatrix& Matrix)
{
    TArray<TSharedPtr<FJsonValue>> Result;
    for (int32 Row = 0; Row < 4; ++Row)
        for (int32 Col = 0; Col < 4; ++Col)
            Result.Add(MakeShared<FJsonValueNumber>(Matrix.M[Row][Col]));
    return Result;
}
TArray<TSharedPtr<FJsonValue>> RectJSON(const FIntRect& Rect)
{
    return Numbers({double(Rect.Min.X), double(Rect.Min.Y), double(Rect.Max.X), double(Rect.Max.Y)});
}
void SetCVar(const TCHAR* Name, float Value)
{
    if (IConsoleVariable* Variable = IConsoleManager::Get().FindConsoleVariable(Name))
        Variable->Set(Value, ECVF_SetByCode);
}
}

struct FMoireDirectorState
{
    TSharedPtr<FSharedViewState, ESPMode::ThreadSafe> Shared = MakeShared<FSharedViewState, ESPMode::ThreadSafe>();
    TSharedPtr<FMoireViewExtension, ESPMode::ThreadSafe> Extension;
    TWeakObjectPtr<ACameraActor> Camera;
    TArray<TWeakObjectPtr<ULocalPlayer>> Players;
    TArray<TWeakObjectPtr<ULocalPlayer>> CreatedPlayers;
    UGameViewportClient* ViewportClient = nullptr;
    FDelegateHandle EndFrameHandle;
    FDelegateHandle ScreenshotHandle;
    FPoseSample CachedPose;
    uint64 CachedGameFrame = MAX_uint64;
    int32 PreviousLoopIndex = INDEX_NONE;
    double StartWorldTime = 0;
    double FixedTime = -1;
    double LoopSeconds = 0;
    int32 ShotFrame = 90;
    FString ReportPath;
    FString ShotPath;
    bool QuitAfter = false;
    bool ShotRequested = false;
    bool ShotProcessed = false;
    bool ShotFileExists = false;
    bool ReportFinished = false;
    uint64 ShotRequestFrame = MAX_uint64;
    uint64 ShotProcessedFrame = MAX_uint64;
    double ShotRequestTime = 0;
    double ShotProcessedTime = 0;
    bool SavedSplitSettings = false;
    bool OriginalUseSplitscreen = false;
    bool OriginalForceDisabled = false;
    EThreePlayerSplitScreenType::Type OriginalThreePlayerLayout = EThreePlayerSplitScreenType::FavorTop;
};

void FMoireDirectorStateDeleter::operator()(FMoireDirectorState* State) const
{
    delete State;
}

class FMoireViewExtension final : public FWorldSceneViewExtension
{
public:
    FMoireViewExtension(const FAutoRegister& AutoRegister, AMoireComparisonDirector* InDirector,
                       const TSharedPtr<FSharedViewState, ESPMode::ThreadSafe>& InShared,
                       UGameViewportClient* InViewport)
        : FWorldSceneViewExtension(AutoRegister, InDirector->GetWorld()), Director(InDirector),
          Shared(InShared), ViewportClient(InViewport) {}

    virtual bool IsActiveThisFrame_Internal(const FSceneViewExtensionContext& Context) const override
    {
        return FWorldSceneViewExtension::IsActiveThisFrame_Internal(Context)
            && ViewportClient && Context.Viewport == ViewportClient->Viewport;
    }

    virtual void SetupViewFamily(FSceneViewFamily& Family) override
    {
        Family.EngineShowFlags.SetPostProcessing(true);
        Family.EngineShowFlags.SetAntiAliasing(true);
        Family.EngineShowFlags.SetTemporalAA(true);
        Family.bRealtimeUpdate = true;
        if (Family.GetTemporalUpscalerInterface())
            Shared->SetError(TEXT("A third-party temporal upscaler is attached to the comparison family"));
    }

    virtual void SetupViewPoint(APlayerController* Player, FMinimalViewInfo& Info) override
    {
        AMoireComparisonDirector* Owner = Director.Get();
        if (!Owner || !Owner->Runtime) return;
        ULocalPlayer* LocalPlayer = Player ? Player->GetLocalPlayer() : nullptr;
        if (!LocalPlayer || !Shared->ArmByController.Contains(LocalPlayer->GetControllerId())) return;
        Owner->UpdateSharedPose();
        const FPoseSample& Pose = Owner->Runtime->CachedPose;
        if (ACameraActor* Camera = Owner->Runtime->Camera.Get())
            Camera->GetCameraComponent()->GetCameraView(0, Info);
        Info.Location = Pose.Location;
        Info.Rotation = Pose.Rotation;
        const FIntPoint Size = ViewportClient->Viewport->GetSizeXY();
        const double Aspect = (double(Size.X) * LocalPlayer->Size.X) / FMath::Max(1., double(Size.Y) * LocalPlayer->Size.Y);
        Info.FOV = FMath::RadiansToDegrees(2. * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(25.)) * Aspect));
        Info.DesiredFOV = Info.FOV;
        Info.AspectRatio = Aspect;
        Info.AspectRatioAxisConstraint = AspectRatio_MaintainXFOV;
        Info.bConstrainAspectRatio = false;
        Info.PerspectiveNearClipPlane = 10.f;
    }

    virtual void SetupView(FSceneViewFamily& Family, FSceneView& View) override
    {
        const int32* Arm = Shared->ArmByController.Find(View.PlayerIndex);
        if (!Arm) { Shared->SetError(TEXT("Unexpected local-player identity in comparison viewport")); return; }
        const bool Temporal = *Arm == 1 || (*Arm == 2 && Shared->ThirdTSR);
        View.AntiAliasingMethod = Temporal ? AAM_TSR : AAM_None;
        View.PrimaryScreenPercentageMethod = Temporal ? EPrimaryScreenPercentageMethod::TemporalUpscale : EPrimaryScreenPercentageMethod::SpatialUpscale;
        View.bAllowTemporalJitter = Temporal;
        if (!View.State) Shared->SetError(TEXT("A comparison view has no persistent view state"));
        if (AMoireComparisonDirector* Owner = Director.Get())
        {
            Owner->UpdateSharedPose();
            {
                FScopeLock Lock(&Shared->Mutex);
                if (Shared->FirstGameFrame == MAX_uint64)
                {
                    Shared->FirstGameFrame = GFrameCounter;
                    Owner->Runtime->CachedPose.ExplicitCut = true;
                    Shared->Poses.Add(GFrameCounter, Owner->Runtime->CachedPose);
                }
            }
            View.bCameraCut = View.bCameraCut || Owner->Runtime->CachedPose.ExplicitCut;
        }
    }

    virtual void PostRenderView_RenderThread(FRDGBuilder& GraphBuilder, FSceneView& View) override
    {
        const int32* Arm = Shared->ArmByController.Find(View.PlayerIndex);
        if (!Arm || !View.Family) return;
        FViewObservation Record;
        {
            FScopeLock Lock(&Shared->Mutex);
            const FPoseSample* Pose = Shared->Poses.Find(View.Family->FrameCounter);
            if (Shared->FirstGameFrame == MAX_uint64 || !Pose
                || View.Family->FrameCounter < Shared->FirstGameFrame
                || View.Family->FrameCounter >= Shared->FirstGameFrame + Shared->ObserveFrames) return;
            Record.Pose = *Pose;
        }
        Record.Arm = *Arm;
        Record.ControllerId = View.PlayerIndex;
        Record.RenderFrameNumber = View.Family->FrameNumber;
        Record.ViewKey = View.GetViewKey();
        Record.StateIdentity = reinterpret_cast<UPTRINT>(View.State);
        Record.AA = int32(View.AntiAliasingMethod);
        Record.Scaling = int32(View.PrimaryScreenPercentageMethod);
        Record.AllowJitter = View.bAllowTemporalJitter;
        Record.CameraCut = View.bCameraCut;
        Record.ThirdPartyUpscaler = View.Family->GetTemporalUpscalerInterface() != nullptr;
        Record.Offline = View.bIsOfflineRender;
        Record.OutputRect = View.UnscaledViewRect;
        Record.UnconstrainedRect = View.UnconstrainedViewRect;
        Record.Location = View.ViewLocation;
        Record.Rotation = View.ViewRotation;
        Record.Jitter = View.ViewMatrices.GetTemporalAAJitter();
        Record.WorldToView = View.ViewMatrices.GetWorldToView();
        Record.ProjectionNoAA = View.ViewMatrices.ComputeProjectionNoAAMatrix();
        Record.SecondaryFraction = View.Family->SecondaryViewFraction;
#if !(UE_BUILD_SHIPPING || UE_BUILD_TEST)
        if (Shared->ObservePrimaryRaster)
        {
            // Keep this single-frame buffer alive and copy scalar bytes immediately.
            // The debug content map does not grant ownership of its returned pointer.
            FUniformBufferRHIRef Buffer = View.ViewUniformBuffer;
            constexpr SIZE_T RectOffset = STRUCT_OFFSET(FViewUniformShaderParameters, ViewRectMinAndSize);
            if (Buffer.IsValid() && Buffer->GetSize() >= RectOffset + sizeof(FUintVector4))
            {
                if (const void* Contents = UE::RHI::UniformBufferContentMap::Get(Buffer.GetReference()))
                {
                    FUintVector4 RectAndSize(0, 0, 0, 0);
                    FMemory::Memcpy(&RectAndSize, static_cast<const uint8*>(Contents) + RectOffset, sizeof(RectAndSize));
                    const uint64 MaxX = uint64(RectAndSize.X) + RectAndSize.Z;
                    const uint64 MaxY = uint64(RectAndSize.Y) + RectAndSize.W;
                    if (RectAndSize.Z > 0 && RectAndSize.W > 0 && MaxX <= MAX_int32 && MaxY <= MAX_int32)
                    {
                        Record.PrimaryRasterRect = FIntRect(int32(RectAndSize.X), int32(RectAndSize.Y), int32(MaxX), int32(MaxY));
                        Record.PrimaryRasterObserved = true;
                    }
                }
            }
        }
#endif
        const bool Temporal = *Arm == 1 || (*Arm == 2 && Shared->ThirdTSR);
        if (Record.AA != int32(Temporal ? AAM_TSR : AAM_None)
            || Record.Scaling != int32(Temporal ? EPrimaryScreenPercentageMethod::TemporalUpscale : EPrimaryScreenPercentageMethod::SpatialUpscale)
            || Record.ThirdPartyUpscaler || Record.Offline || !Record.StateIdentity
            || (!Temporal && !Record.Jitter.IsNearlyZero())
            || !FMath::IsNearlyEqual(Record.SecondaryFraction, 1.f))
            Shared->SetError(TEXT("Final render-view AA, secondary scaling, history, jitter, or renderer mode violates the comparison contract"));
        FScopeLock Lock(&Shared->Mutex);
        TMap<uint32, uint8>& Families = Shared->ObservedFamilies.FindOrAdd(Record.Pose.GameFrame);
        if (!Families.Contains(Record.RenderFrameNumber) && Families.Num() >= 4 && Shared->Error.IsEmpty())
            Shared->Error = TEXT("More than four render families in one comparison game frame");
        uint8& ArmMask = Families.FindOrAdd(Record.RenderFrameNumber);
        const uint8 ArmBit = uint8(1 << Record.Arm);
        if ((ArmMask & ArmBit) != 0 && Shared->Error.IsEmpty())
            Shared->Error = TEXT("A render family reported the same comparison arm twice");
        ArmMask |= ArmBit;
        // Preserve actual records, including an offending family, within a hard cap.
        if (Shared->Observations.Num() < Shared->ObserveFrames * 4 * 3 + 3)
            Shared->Observations.Add(MoveTemp(Record));
        else if (Shared->Error.IsEmpty()) Shared->Error = TEXT("Comparison view observation capacity exceeded");
    }
private:
    TWeakObjectPtr<AMoireComparisonDirector> Director;
    TSharedPtr<FSharedViewState, ESPMode::ThreadSafe> Shared;
    UGameViewportClient* ViewportClient;
};

AMoireComparisonDirector::AMoireComparisonDirector()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = false;
}
AMoireComparisonDirector::~AMoireComparisonDirector() = default;

void AMoireComparisonDirector::BeginPlay()
{
    Super::BeginPlay();
    if (!FParse::Param(FCommandLine::Get(), TEXT("MoireSynchronized"))) return;
    FString ProjectDirectory = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir());
    FPaths::NormalizeDirectoryName(ProjectDirectory);
    if (!GetWorld()->IsGameWorld() || !ProjectDirectory.EndsWith(TEXT("/native/Unreal/MoireComparison"))
        || !GetWorld()->GetOutermost()->GetName().StartsWith(TEXT("/Game/MoireComparison/")))
    {
        UE_LOG(LogMoireCompare, Error, TEXT("MoireSynchronized refused outside the isolated project and comparison game world"));
        return;
    }
    Runtime.Reset(new FMoireDirectorState());
    FParse::Value(FCommandLine::Get(), TEXT("MoireReport="), Runtime->ReportPath);
    FParse::Value(FCommandLine::Get(), TEXT("MoireShotPath="), Runtime->ShotPath);
    FParse::Value(FCommandLine::Get(), TEXT("MoireObserveFrames="), Runtime->Shared->ObserveFrames);
    FParse::Value(FCommandLine::Get(), TEXT("MoireShotFrame="), Runtime->ShotFrame);
    FParse::Value(FCommandLine::Get(), TEXT("MoireFixedTime="), Runtime->FixedTime);
    FParse::Value(FCommandLine::Get(), TEXT("MoireLoopSeconds="), Runtime->LoopSeconds);
    Runtime->QuitAfter = FParse::Param(FCommandLine::Get(), TEXT("MoireQuitAfterObservations"));
    Runtime->Shared->ThirdTSR = FParse::Param(FCommandLine::Get(), TEXT("MoireThirdTSR"));
    if (const IConsoleVariable* ContentMap = IConsoleManager::Get().FindConsoleVariable(TEXT("r.RHI.UniformBufferContentMap.Enable")))
        Runtime->Shared->ObservePrimaryRaster = ContentMap->GetInt() != 0;
    if (!Runtime->ReportPath.IsEmpty() && (FPaths::IsRelative(Runtime->ReportPath) || IFileManager::Get().FileExists(*Runtime->ReportPath)))
    {
        Runtime->ReportPath.Empty(); // Never overwrite a rejected path while reporting this failure.
        Fail(TEXT("MoireReport must be an absolute path to a new file"));
        return;
    }
    if ((!Runtime->ShotPath.IsEmpty() && (FPaths::IsRelative(Runtime->ShotPath) || IFileManager::Get().FileExists(*Runtime->ShotPath)))
        || Runtime->Shared->ObserveFrames < 16 || Runtime->Shared->ObserveFrames > 600
        || Runtime->ShotFrame < 0 || Runtime->ShotFrame >= Runtime->Shared->ObserveFrames - 4
        || !FMath::IsFinite(Runtime->FixedTime) || Runtime->FixedTime < -1 || !FMath::IsFinite(Runtime->LoopSeconds) || Runtime->LoopSeconds < 0
        || (MotionName != TEXT("glide") && MotionName != TEXT("approach")))
    { Fail(TEXT("Invalid synchronized capture paths, frame bounds, time, or motion name")); return; }
    UGameInstance* Game = GetGameInstance();
    Runtime->ViewportClient = Game ? Game->GetGameViewportClient() : nullptr;
    if (!Game || !Runtime->ViewportClient || Game->GetLocalPlayers().Num() != 1)
    { Fail(TEXT("Expected one initial local player in the isolated game viewport")); return; }
    AActor* Point = nullptr;
    AActor* Analytic = nullptr;
    int32 PointCount = 0, AnalyticCount = 0, CameraCount = 0;
    for (TActorIterator<AActor> It(GetWorld()); It; ++It)
    {
        if (It->ActorHasTag(TEXT("MoirePointGround"))) { Point = *It; ++PointCount; }
        if (It->ActorHasTag(TEXT("MoireAnalyticGround"))) { Analytic = *It; ++AnalyticCount; }
        if (It->ActorHasTag(TEXT("MoireComparisonCamera"))) { Runtime->Camera = Cast<ACameraActor>(*It); ++CameraCount; }
    }
    if (PointCount != 1 || AnalyticCount != 1 || CameraCount != 1 || !Runtime->Camera.IsValid())
    { Fail(TEXT("Expected exactly one tagged point ground, analytic ground, and CameraActor")); return; }
    UGameMapsSettings* Maps = GetMutableDefault<UGameMapsSettings>();
    Runtime->OriginalUseSplitscreen = Maps->bUseSplitscreen;
    Runtime->OriginalThreePlayerLayout = Maps->ThreePlayerSplitscreenLayout;
    Runtime->OriginalForceDisabled = Runtime->ViewportClient->IsSplitscreenForceDisabled();
    Runtime->SavedSplitSettings = true;
    Maps->bUseSplitscreen = true;
    Maps->ThreePlayerSplitscreenLayout = EThreePlayerSplitScreenType::Vertical;
    Runtime->ViewportClient->SetForceDisableSplitscreen(false);
    for (int32 Index = 0; Index < 2; ++Index)
    {
        FString Error;
        ULocalPlayer* Player = Game->CreateLocalPlayer(-1, Error, true);
        if (!Player) { Fail(TEXT("Could not create local comparison player: ") + Error); return; }
        Runtime->CreatedPlayers.Add(Player);
    }
    for (int32 Index = 0; Index < 3; ++Index)
    {
        ULocalPlayer* Player = Game->GetLocalPlayers()[Index];
        APlayerController* Controller = Player ? Player->PlayerController : nullptr;
        if (!Controller || Runtime->Shared->ArmByController.Contains(Player->GetControllerId()))
        { Fail(TEXT("Missing or duplicate comparison player controller")); return; }
        Runtime->Players.Add(Player);
        Runtime->Shared->ArmByController.Add(Player->GetControllerId(), Index);
        Controller->SetViewTarget(Runtime->Camera.Get());
        Controller->SetCinematicMode(true, true, true, true, true);
        Controller->HiddenActors.AddUnique(Index == 2 ? Point : Analytic);
    }
    SetCVar(TEXT("r.ScreenPercentage"), 100);
    SetCVar(TEXT("r.SecondaryScreenPercentage.GameViewport"), 100);
    SetCVar(TEXT("r.DynamicRes.OperationMode"), 0);
    Runtime->StartWorldTime = GetWorld()->GetTimeSeconds();
    Runtime->Extension = FSceneViewExtensions::NewExtension<FMoireViewExtension>(this, Runtime->Shared, Runtime->ViewportClient);
    Runtime->EndFrameHandle = FCoreDelegates::OnEndFrame.AddUObject(this, &AMoireComparisonDirector::OnEndFrame);
    Runtime->ScreenshotHandle = FScreenshotRequest::OnScreenshotRequestProcessed().AddUObject(this, &AMoireComparisonDirector::OnScreenshotProcessed);
    SetActorTickEnabled(true);
    UpdateSharedPose();
    WriteReport(TEXT("running"));
    UE_LOG(LogMoireCompare, Display, TEXT("Synchronized comparison enabled: three real local-player views, shared %s clock"), *MotionName);
}

void AMoireComparisonDirector::UpdateSharedPose()
{
    if (!Runtime || Runtime->CachedGameFrame == GFrameCounter) return;
    Runtime->CachedGameFrame = GFrameCounter;
    double Time = Runtime->FixedTime >= 0 ? Runtime->FixedTime : FMath::Max(0., double(GetWorld()->GetTimeSeconds()) - Runtime->StartWorldTime);
    int32 LoopIndex = 0;
    if (Runtime->FixedTime < 0 && Runtime->LoopSeconds > 0)
    {
        LoopIndex = FMath::FloorToInt(Time / Runtime->LoopSeconds);
        Time = FMath::Fmod(Time, Runtime->LoopSeconds);
    }
    const double X = MotionName == TEXT("glide") ? FMath::Sin(Time * .28) * 6. : 0.;
    const double Z = MotionName == TEXT("approach") ? 28. - FMath::Sin(Time * .22) * 12. : 28.;
    FPoseSample Pose;
    Pose.GameFrame = GFrameCounter;
    Pose.SourceTime = Time;
    Pose.LoopIndex = LoopIndex;
    Pose.ExplicitCut = LoopIndex != Runtime->PreviousLoopIndex;
    Pose.Location = FVector(-Z * 100., X * 100., 1200.);
    const FVector Target(-(Z - 50.) * 100., X * .45 * 100., 0.);
    Pose.Rotation = (Target - Pose.Location).Rotation();
    Runtime->PreviousLoopIndex = LoopIndex;
    Runtime->CachedPose = Pose;
    if (ACameraActor* Camera = Runtime->Camera.Get()) Camera->SetActorLocationAndRotation(Pose.Location, Pose.Rotation);
    if (Pose.ExplicitCut)
        for (const TWeakObjectPtr<ULocalPlayer>& Player : Runtime->Players)
            if (Player.IsValid() && Player->PlayerController && Player->PlayerController->PlayerCameraManager)
                Player->PlayerController->PlayerCameraManager->SetGameCameraCutThisFrame();
    FScopeLock Lock(&Runtime->Shared->Mutex);
    if (Runtime->Shared->FirstGameFrame != MAX_uint64
        && GFrameCounter < Runtime->Shared->FirstGameFrame + Runtime->Shared->ObserveFrames + 8)
        Runtime->Shared->Poses.Add(GFrameCounter, Pose);
}

void AMoireComparisonDirector::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    UpdateSharedPose();
}

void AMoireComparisonDirector::OnScreenshotProcessed()
{
    if (!Runtime || !Runtime->ShotRequested || Runtime->ShotProcessed) return;
    Runtime->ShotProcessed = true;
    Runtime->ShotProcessedFrame = GFrameCounter;
    Runtime->ShotProcessedTime = Runtime->CachedPose.SourceTime;
    Runtime->ShotFileExists = IFileManager::Get().FileExists(*Runtime->ShotPath);
}

void AMoireComparisonDirector::OnEndFrame()
{
    if (!Runtime || Runtime->ReportFinished) return;
    FString Error;
    int32 CompleteGameFrames = 0;
    bool AllFamiliesComplete = true;
    uint64 LastCompleteGameFrame = 0;
    uint64 First = 0;
    {
        FScopeLock Lock(&Runtime->Shared->Mutex);
        Error = Runtime->Shared->Error;
        for (const auto& GameFrame : Runtime->Shared->ObservedFamilies)
        {
            bool HasCompleteFamily = false;
            for (const auto& Family : GameFrame.Value)
            {
                HasCompleteFamily |= Family.Value == 7;
                AllFamiliesComplete &= Family.Value == 7;
            }
            if (HasCompleteFamily)
            {
                ++CompleteGameFrames;
                LastCompleteGameFrame = FMath::Max(LastCompleteGameFrame, GameFrame.Key);
            }
        }
        First = Runtime->Shared->FirstGameFrame;
    }
    if (!Error.IsEmpty()) { Fail(Error); return; }
    if (First == MAX_uint64) return;
    if (!Runtime->ShotPath.IsEmpty() && !Runtime->ShotRequested && GFrameCounter >= First + Runtime->ShotFrame)
    {
        IFileManager::Get().MakeDirectory(*FPaths::GetPath(Runtime->ShotPath), true);
        Runtime->ShotRequested = true;
        Runtime->ShotRequestFrame = GFrameCounter;
        Runtime->ShotRequestTime = Runtime->CachedPose.SourceTime;
        FScreenshotRequest::RequestScreenshot(Runtime->ShotPath, false, false, false);
    }
    if (CompleteGameFrames == Runtime->Shared->ObserveFrames && AllFamiliesComplete
        && LastCompleteGameFrame >= First + Runtime->Shared->ObserveFrames - 1)
    {
        if (!Runtime->ShotPath.IsEmpty() && (!Runtime->ShotProcessed || !Runtime->ShotFileExists))
        { Fail(TEXT("Ordinary screenshot did not complete before the observation bound")); return; }
        WriteReport(TEXT("observed-unverified"));
        Runtime->ReportFinished = true;
        if (Runtime->QuitAfter) FPlatformMisc::RequestExit(false);
    }
    else if (GFrameCounter > First + Runtime->Shared->ObserveFrames + 8)
        Fail(TEXT("Did not receive all three final render views within the bounded observation window"));
}

void AMoireComparisonDirector::WriteReport(const FString& Status)
{
    if (!Runtime || Runtime->ReportPath.IsEmpty()) return;
    TSharedRef<FJsonObject> Report = MakeShared<FJsonObject>();
    Report->SetStringField(TEXT("schema"), TEXT("moire-synchronized-v1"));
    Report->SetStringField(TEXT("status"), Status);
    Report->SetStringField(TEXT("motion"), MotionName);
    Report->SetBoolField(TEXT("ordinary_game_renderer"), true);
    Report->SetBoolField(TEXT("performance_measurement"), false);
    Report->SetBoolField(TEXT("third_arm_tsr"), Runtime->Shared->ThirdTSR);
    Report->SetBoolField(TEXT("uses_fixed_source_time"), Runtime->FixedTime >= 0);
    Report->SetNumberField(TEXT("fixed_source_time_seconds"), Runtime->FixedTime);
    Report->SetNumberField(TEXT("loop_seconds"), Runtime->LoopSeconds);
    Report->SetNumberField(TEXT("observation_frame_count"), Runtime->Shared->ObserveFrames);
    Report->SetStringField(TEXT("observation_stage"), TEXT("PostRenderView_RenderThread: after postprocessing graph construction, not a GPU fence or timing measurement"));
    Report->SetStringField(TEXT("primary_rectangle_limit"), TEXT("Primary raster rectangle is copied from the single-frame view uniform's ViewRectMinAndSize only when the startup CPU content-map diagnostic is enabled and data is available. Otherwise null. Internal nominal resolution fraction remains unknown; raster/output pixel ratios include integer rounding."));
    Report->SetNumberField(TEXT("requested_primary_screen_percentage_cvar"), 100);
    Report->SetBoolField(TEXT("primary_resolution_verified"), false);
    Report->SetBoolField(TEXT("primary_raster_diagnostic_enabled"), Runtime->Shared->ObservePrimaryRaster);
    Report->SetBoolField(TEXT("uniform_buffer_cpu_copy_overhead_enabled"), Runtime->Shared->ObservePrimaryRaster);
    Report->SetStringField(TEXT("primary_raster_observation_source"), TEXT("UE::RHI::UniformBufferContentMap; no additional render pass or GPU readback; non-Shipping/non-Test builds only"));
    Report->SetStringField(TEXT("observation_origin"), TEXT("First actual comparison SetupView, not BeginPlay"));
    Report->SetStringField(TEXT("matrix_convention"), TEXT("Row-major flattened UE row-vector matrices; unjittered world-to-clip = world_to_view * projection_no_aa"));
    Report->SetStringField(TEXT("shot_path"), Runtime->ShotPath);
    Report->SetBoolField(TEXT("shot_requested"), Runtime->ShotRequested);
    Report->SetBoolField(TEXT("shot_processed"), Runtime->ShotProcessed);
    Report->SetBoolField(TEXT("shot_file_exists"), Runtime->ShotFileExists);
    Report->SetStringField(TEXT("shot_request_stage"), TEXT("OnEndFrame after game viewport draw; no pause/seek"));
    Report->SetStringField(TEXT("shot_completion_stage"), TEXT("FScreenshotRequest.OnScreenshotRequestProcessed; file existence checked; independent pixel registration still required"));
    if (Runtime->ShotRequested)
    {
        Report->SetNumberField(TEXT("shot_requested_game_frame"), double(Runtime->ShotRequestFrame));
        Report->SetNumberField(TEXT("shot_requested_source_time"), Runtime->ShotRequestTime);
    }
    if (Runtime->ShotProcessed)
    {
        Report->SetNumberField(TEXT("shot_processed_game_frame"), double(Runtime->ShotProcessedFrame));
        Report->SetNumberField(TEXT("shot_processed_source_time"), Runtime->ShotProcessedTime);
    }
    TArray<FViewObservation> Records;
    uint64 First;
    {
        FScopeLock Lock(&Runtime->Shared->Mutex);
        Records = Runtime->Shared->Observations;
        First = Runtime->Shared->FirstGameFrame;
        Report->SetStringField(TEXT("failure"), Runtime->Shared->Error);
        int32 FamilyCount = 0;
        int32 CompleteFamilyCount = 0;
        int32 CompleteGameFrameCount = 0;
        uint64 LastObservedGameFrame = 0;
        for (const auto& GameFrame : Runtime->Shared->ObservedFamilies)
        {
            bool HasCompleteFamily = false;
            FamilyCount += GameFrame.Value.Num();
            LastObservedGameFrame = FMath::Max(LastObservedGameFrame, GameFrame.Key);
            for (const auto& Family : GameFrame.Value)
                if (Family.Value == 7) { ++CompleteFamilyCount; HasCompleteFamily = true; }
            if (HasCompleteFamily) ++CompleteGameFrameCount;
        }
        Report->SetNumberField(TEXT("observed_game_frame_count"), Runtime->Shared->ObservedFamilies.Num());
        Report->SetNumberField(TEXT("complete_game_frame_count"), CompleteGameFrameCount);
        Report->SetNumberField(TEXT("observed_render_family_count"), FamilyCount);
        Report->SetNumberField(TEXT("complete_render_family_count"), CompleteFamilyCount);
        Report->SetNumberField(TEXT("observed_view_count"), Records.Num());
        Report->SetNumberField(TEXT("max_render_families_per_game_frame"), 4);
        Report->SetStringField(TEXT("render_family_identity"), TEXT("Pair (game_frame, render_frame_number); all views retained, including repeated game-frame draws"));
        if (Runtime->Shared->ObservedFamilies.IsEmpty())
            Report->SetField(TEXT("last_observed_game_frame"), MakeShared<FJsonValueNull>());
        else Report->SetNumberField(TEXT("last_observed_game_frame"), double(LastObservedGameFrame));
    }
    if (First == MAX_uint64) Report->SetField(TEXT("first_game_frame"), MakeShared<FJsonValueNull>());
    else Report->SetNumberField(TEXT("first_game_frame"), double(First));
    TArray<TSharedPtr<FJsonValue>> Views;
    bool AllRasterObserved = !Records.IsEmpty();
    for (const FViewObservation& Record : Records)
    {
        TSharedRef<FJsonObject> View = MakeShared<FJsonObject>();
        View->SetNumberField(TEXT("arm"), Record.Arm);
        View->SetNumberField(TEXT("controller_id"), Record.ControllerId);
        View->SetNumberField(TEXT("game_frame"), double(Record.Pose.GameFrame));
        View->SetNumberField(TEXT("relative_frame"), double(Record.Pose.GameFrame - First));
        View->SetNumberField(TEXT("render_frame_number"), Record.RenderFrameNumber);
        View->SetNumberField(TEXT("source_time_seconds"), Record.Pose.SourceTime);
        View->SetNumberField(TEXT("loop_index"), Record.Pose.LoopIndex);
        View->SetBoolField(TEXT("explicit_initial_or_loop_cut"), Record.Pose.ExplicitCut);
        View->SetBoolField(TEXT("observed_camera_cut"), Record.CameraCut);
        View->SetNumberField(TEXT("anti_aliasing_method"), Record.AA);
        View->SetNumberField(TEXT("primary_screen_percentage_method"), Record.Scaling);
        View->SetField(TEXT("primary_resolution_fraction"), MakeShared<FJsonValueNull>());
        View->SetBoolField(TEXT("primary_raster_observed"), Record.PrimaryRasterObserved);
        if (Record.PrimaryRasterObserved)
        {
            View->SetArrayField(TEXT("primary_raster_rect"), RectJSON(Record.PrimaryRasterRect));
            if (Record.OutputRect.Width() > 0 && Record.OutputRect.Height() > 0)
                View->SetArrayField(TEXT("primary_raster_to_output_ratio"), Numbers({
                    double(Record.PrimaryRasterRect.Width()) / Record.OutputRect.Width(),
                    double(Record.PrimaryRasterRect.Height()) / Record.OutputRect.Height()}));
            else View->SetField(TEXT("primary_raster_to_output_ratio"), MakeShared<FJsonValueNull>());
        }
        else
        {
            View->SetField(TEXT("primary_raster_rect"), MakeShared<FJsonValueNull>());
            View->SetField(TEXT("primary_raster_to_output_ratio"), MakeShared<FJsonValueNull>());
            AllRasterObserved = false;
        }
        View->SetNumberField(TEXT("secondary_resolution_fraction"), Record.SecondaryFraction);
        View->SetBoolField(TEXT("allows_temporal_jitter"), Record.AllowJitter);
        View->SetBoolField(TEXT("third_party_temporal_upscaler"), Record.ThirdPartyUpscaler);
        View->SetBoolField(TEXT("offline_render"), Record.Offline);
        View->SetNumberField(TEXT("view_key"), Record.ViewKey);
        View->SetStringField(TEXT("view_state_identity"), FString::Printf(TEXT("%llu"), static_cast<uint64>(Record.StateIdentity)));
        View->SetArrayField(TEXT("output_rect"), RectJSON(Record.OutputRect));
        View->SetArrayField(TEXT("unconstrained_rect"), RectJSON(Record.UnconstrainedRect));
        View->SetArrayField(TEXT("jitter_clip"), Numbers({Record.Jitter.X, Record.Jitter.Y}));
        View->SetArrayField(TEXT("camera_location"), Numbers({Record.Location.X, Record.Location.Y, Record.Location.Z}));
        View->SetArrayField(TEXT("camera_rotation"), Numbers({Record.Rotation.Roll, Record.Rotation.Pitch, Record.Rotation.Yaw}));
        View->SetArrayField(TEXT("world_to_view"), MatrixJSON(Record.WorldToView));
        View->SetArrayField(TEXT("projection_no_aa"), MatrixJSON(Record.ProjectionNoAA));
        Views.Add(MakeShared<FJsonValueObject>(View));
    }
    Report->SetArrayField(TEXT("final_view_observations"), Views);
    Report->SetBoolField(TEXT("all_recorded_primary_raster_rects_observed"), AllRasterObserved);
    FString Text;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
    FJsonSerializer::Serialize(Report, Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(Runtime->ReportPath), true);
    if (!FFileHelper::SaveStringToFile(Text, *Runtime->ReportPath))
        UE_LOG(LogMoireCompare, Error, TEXT("Could not write comparison telemetry: %s"), *Runtime->ReportPath);
}

void AMoireComparisonDirector::Fail(const FString& Reason)
{
    UE_LOG(LogMoireCompare, Error, TEXT("%s"), *Reason);
    if (Runtime)
    {
        Runtime->Shared->SetError(Reason);
        WriteReport(TEXT("failed"));
        Runtime->ReportFinished = true;
    }
    FPlatformMisc::RequestExit(false);
}

void AMoireComparisonDirector::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (Runtime)
    {
        FCoreDelegates::OnEndFrame.Remove(Runtime->EndFrameHandle);
        FScreenshotRequest::OnScreenshotRequestProcessed().Remove(Runtime->ScreenshotHandle);
        if (!Runtime->ReportFinished) WriteReport(TEXT("stopped-before-observation-bound"));
        Runtime->Extension.Reset();
        if (UGameInstance* Game = GetGameInstance())
            for (const TWeakObjectPtr<ULocalPlayer>& Player : Runtime->CreatedPlayers)
                if (Player.IsValid()) Game->RemoveLocalPlayer(Player.Get());
        if (Runtime->SavedSplitSettings)
        {
            UGameMapsSettings* Maps = GetMutableDefault<UGameMapsSettings>();
            Maps->bUseSplitscreen = Runtime->OriginalUseSplitscreen;
            Maps->ThreePlayerSplitscreenLayout = Runtime->OriginalThreePlayerLayout;
            if (Runtime->ViewportClient)
                Runtime->ViewportClient->SetForceDisableSplitscreen(Runtime->OriginalForceDisabled);
        }
    }
    Super::EndPlay(EndPlayReason);
}
