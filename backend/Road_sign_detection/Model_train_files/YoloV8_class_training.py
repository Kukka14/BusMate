from ultralytics import YOLO

DATASET_PATH = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection"
SAVE_PATH = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Weight\YOLO8"

model = YOLO("yolov8n-cls.pt")

print("YOLOv8 Classification Model Loaded")

model.train(
    data=DATASET_PATH,
    epochs=30,
    imgsz=224,
    batch=32,

    project=SAVE_PATH,
    name="YOLOv8_Classifier",

    device="cpu",   
    patience=10
)

print("Training Completed")