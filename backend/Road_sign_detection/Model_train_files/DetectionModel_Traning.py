from ultralytics import YOLO
from pathlib import Path

# =====================================================
# CONFIG
# =====================================================

# 🔥 Start from pretrained YOLO (safe)
MODEL_WEIGHTS = "yolov8s.pt"

# Your dataset yaml
DATA_YAML = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detectionYOLO_dataset\data.yaml"

EPOCHS = 30
IMGSZ = 640
BATCH = 8

# Name of this training run
NAME = "yolo_retrain"

# ✅ FINAL SAVE LOCATION (what you requested)
PROJECT = Path(r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Weight\Detect_Model\Yolo")

# =====================================================
# PREPARE
# =====================================================
PROJECT.mkdir(parents=True, exist_ok=True)

# If this file exists, training will continue from the last saved epoch
LAST_CHECKPOINT = PROJECT / NAME / "weights" / "last.pt"

# Load model (resume from last checkpoint if available)
if LAST_CHECKPOINT.exists():
    print(f"🔁 Resuming training from: {LAST_CHECKPOINT}")
    model = YOLO(str(LAST_CHECKPOINT))
    resume_flag = True
else:
    print("🆕 No previous checkpoint found. Starting new training.")
    model = YOLO(MODEL_WEIGHTS)
    resume_flag = False

# =====================================================
# TRAIN
# =====================================================
model.train(
    data=DATA_YAML,
    epochs=EPOCHS,
    imgsz=IMGSZ,
    batch=BATCH,
    project=str(PROJECT),   
    name=NAME,
    device="cpu",              
    workers=4,
    cache=True,
    patience=10,    
    save_period=5,
    resume=resume_flag
)

print("✅ Training Completed!")