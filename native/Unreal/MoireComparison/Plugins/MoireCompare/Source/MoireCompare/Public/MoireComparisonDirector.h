#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MoireComparisonDirector.generated.h"

struct FMoireDirectorState;
struct FMoireDirectorStateDeleter
{
    void operator()(FMoireDirectorState* State) const;
};
class FMoireViewExtension;

/** Dormant in the editor and without -MoireSynchronized. */
UCLASS(BlueprintType)
class MOIRECOMPARE_API AMoireComparisonDirector : public AActor
{
    GENERATED_BODY()
public:
    AMoireComparisonDirector();
    virtual ~AMoireComparisonDirector() override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Moiré")
    FString MotionName = TEXT("glide");

    virtual void Tick(float DeltaSeconds) override;
protected:
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
private:
    friend class FMoireViewExtension;
    TUniquePtr<FMoireDirectorState, FMoireDirectorStateDeleter> Runtime;
    void UpdateSharedPose();
    void OnEndFrame();
    void OnScreenshotProcessed();
    void WriteReport(const FString& Status);
    void Fail(const FString& Reason);
};
