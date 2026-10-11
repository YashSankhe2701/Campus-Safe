"""
Utility script to stage the offline trained model artifact for container builds.
Copies existing trained model from ai/prediction/artifacts to backend/artifacts
without retraining.
"""

from pathlib import Path
import shutil
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

SOURCE_ARTIFACT = (
    REPO_ROOT
    / "ai"
    / "prediction"
    / "artifacts"
    / "evacuation_time_rf.joblib"
)
DEST_DIR = BACKEND_DIR / "artifacts"
DEST_ARTIFACT = DEST_DIR / "evacuation_time_rf.joblib"


def stage_artifact():
    if DEST_ARTIFACT.is_file():
        print(f"Artifact already staged at {DEST_ARTIFACT}")
        return True

    if not SOURCE_ARTIFACT.is_file():
        print(
            f"Source artifact not found at {SOURCE_ARTIFACT}. "
            "Please ensure the offline trained model exists before staging.",
            file=sys.stderr,
        )
        return False

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE_ARTIFACT, DEST_ARTIFACT)
    print(f"Staged model artifact to {DEST_ARTIFACT} successfully.")
    return True


if __name__ == "__main__":
    success = stage_artifact()
    sys.exit(0 if success else 1)
