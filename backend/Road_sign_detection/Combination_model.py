


from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
WEIGHT_DIR = BASE_DIR / "Weight"
#this code for custom model without image quality enhancement ///////////////////////////////////////////////////////

# import cv2
# import os
# import json
# import numpy as np
# from ultralytics import YOLO
# from tensorflow import keras
# from tensorflow.keras import layers
# import tkinter as tk
# from tkinter import filedialog

# # =====================================================
# # CONFIG
# # =====================================================
# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# YOLO_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Detect_Model\RoadSignDetector_v22\weights\best.pt"
# CLASS_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\epoch_026.weights.h5"
# CLASS_MAPPING_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\class_mapping.json"

# # =====================================================
# # LOAD MODELS
# # =====================================================
# detector = YOLO(YOLO_MODEL_PATH)
# print("✅ YOLO Detection Model Loaded")

# with open(CLASS_MAPPING_PATH, "r") as f:
#     class_indices = json.load(f)

# index_to_class = {v: k for k, v in class_indices.items()}
# NUM_CLASSES = len(class_indices)

# # ===== EXACT CLASSIFICATION ARCHITECTURE =====
# def conv_block(x, filters, stride=1):
#     shortcut = x
#     x = layers.Conv2D(filters, (3,3), strides=stride, padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters, (3,3), padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride != 1 or shortcut.shape[-1] != filters:
#         shortcut = layers.Conv2D(filters, (1,1), strides=stride, padding='same', use_bias=False)(shortcut)
#         shortcut = layers.BatchNormalization()(shortcut)

#     x = layers.Add()([x, shortcut])
#     x = layers.ReLU()(x)
#     return x

# def depthwise_block(x, filters, stride=1):
#     shortcut = x
#     x = layers.DepthwiseConv2D((3,3), strides=stride, padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters, (1,1), padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride == 1 and shortcut.shape[-1] == filters:
#         x = layers.Add()([x, shortcut])

#     x = layers.ReLU()(x)
#     return x

# def build_model():
#     inputs = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))

#     x = layers.Conv2D(32, (3,3), strides=2, padding='same', use_bias=False)(inputs)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = conv_block(x, 64)
#     x = conv_block(x, 64)

#     x = conv_block(x, 128, stride=2)
#     x = conv_block(x, 128)

#     x = depthwise_block(x, 256, stride=2)
#     x = depthwise_block(x, 256)

#     x = depthwise_block(x, 512, stride=2)
#     x = depthwise_block(x, 512)

#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.6)(x)

#     x = layers.Dense(512, activation='relu')(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

#     return keras.Model(inputs, outputs)

# classifier = build_model()
# classifier.load_weights(CLASS_MODEL_PATH)
# print("✅ Classification Model Loaded")

# # =====================================================
# # PROCESS FRAME
# # =====================================================
# def process_frame(frame):

#     original = frame.copy()
#     results = detector(frame, conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes) == 0:
#         return original, original, None

#     best_box = max(boxes, key=lambda b: float(b.conf[0]))
#     x1, y1, x2, y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     w = x2 - x1
#     h = y2 - y1
#     mx = int(w * MARGIN_RATIO)
#     my = int(h * MARGIN_RATIO)

#     x1 = max(0, x1 - mx)
#     y1 = max(0, y1 - my)
#     x2 = min(frame.shape[1], x2 + mx)
#     y2 = min(frame.shape[0], y2 + my)

#     crop = frame[y1:y2, x1:x2]

#     # Classification
#     crop_resized = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
#     crop_rgb = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2RGB)
#     crop_norm = crop_rgb.astype("float32") / 255.0
#     crop_input = np.expand_dims(crop_norm, axis=0)

#     pred = classifier.predict(crop_input, verbose=0)[0]
#     class_id = np.argmax(pred)
#     class_name = index_to_class[class_id]
#     confidence = float(pred[class_id])

#     detected_img = original.copy()
#     cv2.rectangle(detected_img, (x1, y1), (x2, y2), (0,255,0), 3)
#     cv2.putText(detected_img,
#                 f"{class_name} ({confidence:.2f})",
#                 (x1, y1-10),
#                 cv2.FONT_HERSHEY_SIMPLEX,
#                 0.8,
#                 (0,255,0),
#                 2)

#     crop_display = crop.copy()
#     cv2.putText(crop_display,
#                 f"{class_name}",
#                 (10,30),
#                 cv2.FONT_HERSHEY_SIMPLEX,
#                 1,
#                 (0,255,0),
#                 2)

#     return original, detected_img, crop_display

# # =====================================================
# # INPUT MODE
# # =====================================================
# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")
# choice = input("Enter choice (1/2/3): ")

# # =====================================================
# # IMAGE / VIDEO FILE PICKER
# # =====================================================
# if choice in ["1", "2"]:

#     root = tk.Tk()
#     root.withdraw()

#     filetypes = [("All Files", "*.*")]
#     path = filedialog.askopenfilename(title="Select File", filetypes=filetypes)

#     root.destroy()

#     if not path:
#         print("❌ No file selected.")
#         exit()

# # =====================================================
# # IMAGE MODE
# # =====================================================
# if choice == "1":

#     img = cv2.imread(path)
#     orig, detected, crop = process_frame(img)

#     if crop is None:
#         print("❌ No road sign detected.")
#         exit()

#     combined = np.hstack([
#         cv2.resize(orig, (400,400)),
#         cv2.resize(detected, (400,400)),
#         cv2.resize(crop, (400,400))
#     ])

#     cv2.imshow("Original | Detected | Crop+Classified", combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()

# # =====================================================
# # VIDEO MODE
# # =====================================================
# elif choice == "2":

#     cap = cv2.VideoCapture(path)

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300,300)),
#                 cv2.resize(detected, (300,300)),
#                 cv2.resize(crop, (300,300))
#             ])
#             cv2.imshow("Detection Pipeline", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()

# # =====================================================
# # WEBCAM MODE
# # =====================================================
# elif choice == "3":

#     cap = cv2.VideoCapture(0)

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300,300)),
#                 cv2.resize(detected, (300,300)),
#                 cv2.resize(crop, (300,300))
#             ])
#             cv2.imshow("Live Detection Pipeline", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()

# else:
#     print("Invalid choice.")



##################### MobileNetV2 Single Image Prediction Template #####################

# import cv2
# import os
# import json
# import numpy as np
# from ultralytics import YOLO
# import tkinter as tk
# from tkinter import filedialog

# from tensorflow import keras
# from tensorflow.keras import layers
# from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

# # =====================================================
# # CONFIG
# # =====================================================
# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# YOLO_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Detect_Model\RoadSignDetector_v22\weights\best.pt"
# CLASS_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\mobilenet_weights\Mobilenetv2_Retrain_weight\phase2_epoch_015.weights.h5"
# CLASS_MAPPING_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\mobilenet_weights\Mobilenetv2_Retrain_weight\class_mapping.json"

# # =====================================================
# # LOAD YOLO MODEL
# # =====================================================
# detector = YOLO(YOLO_MODEL_PATH)
# print("✅ YOLO Detection Model Loaded")

# # =====================================================
# # LOAD CLASS MAPPING
# # =====================================================
# with open(CLASS_MAPPING_PATH, "r") as f:
#     class_indices = json.load(f)

# index_to_class = {v: k for k, v in class_indices.items()}
# NUM_CLASSES = len(class_indices)

# # =====================================================
# # BUILD CLASSIFICATION MODEL (EXACT SAME AS TRAINING)
# # =====================================================
# def build_model():
#     base_model = keras.applications.MobileNetV2(
#         input_shape=(IMG_SIZE, IMG_SIZE, 3),
#         include_top=False,
#         weights=None   # 🔥 IMPORTANT: SAME AS TRAINING
#     )

#     x = base_model.output
#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.Dense(256, activation='relu')(x)
#     x = layers.Dropout(0.5)(x)
#     outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

#     model = keras.Model(inputs=base_model.input, outputs=outputs)
#     return model


# classifier = build_model()
# classifier.load_weights(CLASS_MODEL_PATH)
# print("✅ MobileNetV2 Classification Model Loaded Successfully")

# # =====================================================
# # PROCESS FRAME
# # =====================================================
# def process_frame(frame):

#     original = frame.copy()

#     results = detector(frame, conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes) == 0:
#         return original, original, None

#     best_box = max(boxes, key=lambda b: float(b.conf[0]))
#     x1, y1, x2, y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     # Add margin
#     w = x2 - x1
#     h = y2 - y1
#     mx = int(w * MARGIN_RATIO)
#     my = int(h * MARGIN_RATIO)

#     x1 = max(0, x1 - mx)
#     y1 = max(0, y1 - my)
#     x2 = min(frame.shape[1], x2 + mx)
#     y2 = min(frame.shape[0], y2 + my)

#     crop = frame[y1:y2, x1:x2]

#     # =====================
#     # Classification
#     # =====================
#     crop_resized = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
#     crop_rgb = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2RGB)
#     crop_rgb = np.array(crop_rgb, dtype=np.float32)
#     crop_processed = preprocess_input(crop_rgb)  # 🔥 SAME AS TRAINING
#     crop_input = np.expand_dims(crop_processed, axis=0)

#     pred = classifier.predict(crop_input, verbose=0)[0]
#     class_id = np.argmax(pred)
#     class_name = index_to_class[class_id]
#     confidence = float(pred[class_id])

#     # Draw bounding box
#     detected_img = original.copy()
#     cv2.rectangle(detected_img, (x1, y1), (x2, y2), (0, 255, 0), 3)
#     cv2.putText(
#         detected_img,
#         f"{class_name} ({confidence:.2f})",
#         (x1, y1 - 10),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.8,
#         (0, 255, 0),
#         2
#     )

#     # Crop display
#     crop_display = crop.copy()
#     cv2.putText(
#         crop_display,
#         f"{class_name}",
#         (10, 30),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         1,
#         (0, 255, 0),
#         2
#     )

#     return original, detected_img, crop_display


# # =====================================================
# # SELECT INPUT TYPE
# # =====================================================
# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")
# choice = input("Enter choice (1/2/3): ")

# # =====================================================
# # FILE PICKER
# # =====================================================
# if choice in ["1", "2"]:
#     root = tk.Tk()
#     root.withdraw()
#     path = filedialog.askopenfilename(title="Select File")
#     root.destroy()

#     if not path:
#         print("❌ No file selected.")
#         exit()

# # =====================================================
# # IMAGE MODE
# # =====================================================
# if choice == "1":

#     img = cv2.imread(path)
#     orig, detected, crop = process_frame(img)

#     if crop is None:
#         print("❌ No road sign detected.")
#         exit()

#     combined = np.hstack([
#         cv2.resize(orig, (400, 400)),
#         cv2.resize(detected, (400, 400)),
#         cv2.resize(crop, (400, 400))
#     ])

#     cv2.imshow("Original | Detected | Crop+Classified", combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()

# # =====================================================
# # VIDEO MODE
# # =====================================================
# elif choice == "2":

#     cap = cv2.VideoCapture(path)

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300, 300)),
#                 cv2.resize(detected, (300, 300)),
#                 cv2.resize(crop, (300, 300))
#             ])
#             cv2.imshow("Detection Pipeline", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()

# # =====================================================
# # WEBCAM MODE
# # =====================================================
# elif choice == "3":

#     cap = cv2.VideoCapture(0)

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300, 300)),
#                 cv2.resize(detected, (300, 300)),
#                 cv2.resize(crop, (300, 300))
#             ])
#             cv2.imshow("Live Detection Pipeline", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()



# this code for custom model with image quality enhancement ///////////////////////////////////////////////////////


# import cv2
# import os
# import json
# import numpy as np
# from ultralytics import YOLO
# from tensorflow import keras
# from tensorflow.keras import layers
# import tkinter as tk
# from tkinter import filedialog

# # =====================================================
# # CONFIG
# # =====================================================
# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# # Confidence thresholds
# NORMAL_THRESHOLD = 0.75
# DAMAGED_THRESHOLD = 0.40

# # Blur threshold (empirically tune this for your camera)
# BLUR_THRESHOLD = 100  

# YOLO_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Detect_Model\RoadSignDetector_v22\weights\best.pt"
# CLASS_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\epoch_026.weights.h5"
# CLASS_MAPPING_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\class_mapping.json"

# # =====================================================
# # LOAD MODELS
# # =====================================================
# detector = YOLO(YOLO_MODEL_PATH)
# print("✅ YOLO Detection Model Loaded")

# with open(CLASS_MAPPING_PATH, "r") as f:
#     class_indices = json.load(f)

# index_to_class = {v: k for k, v in class_indices.items()}
# NUM_CLASSES = len(class_indices)

# # =====================================================
# # CLASSIFICATION ARCHITECTURE
# # =====================================================
# def conv_block(x, filters, stride=1):
#     shortcut = x
#     x = layers.Conv2D(filters, (3,3), strides=stride, padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters, (3,3), padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride != 1 or shortcut.shape[-1] != filters:
#         shortcut = layers.Conv2D(filters, (1,1), strides=stride, padding='same', use_bias=False)(shortcut)
#         shortcut = layers.BatchNormalization()(shortcut)

#     x = layers.Add()([x, shortcut])
#     x = layers.ReLU()(x)
#     return x

# def depthwise_block(x, filters, stride=1):
#     shortcut = x
#     x = layers.DepthwiseConv2D((3,3), strides=stride, padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters, (1,1), padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride == 1 and shortcut.shape[-1] == filters:
#         x = layers.Add()([x, shortcut])

#     x = layers.ReLU()(x)
#     return x

# def build_model():
#     inputs = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
#     x = layers.Conv2D(32, (3,3), strides=2, padding='same', use_bias=False)(inputs)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = conv_block(x, 64)
#     x = conv_block(x, 64)

#     x = conv_block(x, 128, stride=2)
#     x = conv_block(x, 128)

#     x = depthwise_block(x, 256, stride=2)
#     x = depthwise_block(x, 256)

#     x = depthwise_block(x, 512, stride=2)
#     x = depthwise_block(x, 512)

#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.6)(x)

#     x = layers.Dense(512, activation='relu')(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

#     return keras.Model(inputs, outputs)

# classifier = build_model()
# classifier.load_weights(CLASS_MODEL_PATH)
# print("✅ Classification Model Loaded")

# # =====================================================
# # IMAGE QUALITY FUNCTIONS
# # =====================================================
# def blur_score(image):
#     gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
#     return cv2.Laplacian(gray, cv2.CV_64F).var()

# def sharpen_image(image):
#     gaussian = cv2.GaussianBlur(image, (9,9), 10)
#     sharpened = cv2.addWeighted(image, 1.5, gaussian, -0.5, 0)
#     return sharpened

# def classify_crop(crop):
#     crop_resized = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
#     crop_rgb = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2RGB)
#     crop_norm = crop_rgb.astype("float32") / 255.0
#     crop_input = np.expand_dims(crop_norm, axis=0)

#     pred = classifier.predict(crop_input, verbose=0)[0]
#     class_id = np.argmax(pred)
#     class_name = index_to_class[class_id]
#     confidence = float(pred[class_id])

#     return class_name, confidence

# # =====================================================
# # PROCESS FRAME
# # =====================================================
# def process_frame(frame):

#     original = frame.copy()
#     results = detector(frame, conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes) == 0:
#         print("❌ No road sign detected in this frame.")
#         return original, original, None

#     best_box = max(boxes, key=lambda b: float(b.conf[0]))
#     x1, y1, x2, y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     w = x2 - x1
#     h = y2 - y1
#     mx = int(w * MARGIN_RATIO)
#     my = int(h * MARGIN_RATIO)

#     x1 = max(0, x1 - mx)
#     y1 = max(0, y1 - my)
#     x2 = min(frame.shape[1], x2 + mx)
#     y2 = min(frame.shape[0], y2 + my)

#     crop = frame[y1:y2, x1:x2]

#     # ==============================
#     # Blur Detection
#     # ==============================
#     blur_value = blur_score(crop)
#     print(f"[INFO] Blur Score: {blur_value:.2f}")

#     # ==============================
#     # INITIAL CLASSIFICATION
#     # ==============================
#     class_name, confidence = classify_crop(crop)

#     print("------ INITIAL CLASSIFICATION ------")
#     print(f"[INFO] Initial Class       : {class_name}")
#     print(f"[INFO] Initial Confidence  : {confidence:.4f}")

#     initial_confidence = confidence

#     # ==============================
#     # Adaptive Enhancement
#     # ==============================
#     if blur_value < BLUR_THRESHOLD:
#         print("[INFO] Image appears blurry → Applying sharpening...")

#         enhanced_crop = sharpen_image(crop)
#         class_name2, confidence2 = classify_crop(enhanced_crop)

#         print("------ AFTER ENHANCEMENT ------")
#         print(f"[INFO] Enhanced Class      : {class_name2}")
#         print(f"[INFO] Enhanced Confidence : {confidence2:.4f}")

#         if confidence2 > confidence:
#             print("[INFO] Confidence improved after enhancement.")
#             class_name = class_name2
#             confidence = confidence2
#             crop = enhanced_crop
#         else:
#             print("[INFO] Enhancement did NOT improve confidence.")

#     # ==============================
#     # DAMAGE DECISION LOGIC
#     # ==============================
#     if confidence >= NORMAL_THRESHOLD:
#         status = "Normal"

#     elif confidence < DAMAGED_THRESHOLD and blur_value < BLUR_THRESHOLD:
#         status = "Damaged (Unclear Image)"

#     elif confidence < DAMAGED_THRESHOLD and blur_value >= BLUR_THRESHOLD:
#         status = "Uncertain Classification"

#     else:
#         status = "Possibly Damaged"

#     # ==============================
#     # FINAL TERMINAL OUTPUT
#     # ==============================
#     print("--------------------------------------------------")
#     print(f"[INFO] Final Class       : {class_name}")
#     print(f"[INFO] Final Confidence  : {confidence:.4f}")
#     print(f"[INFO] Status            : {status}")
#     print("--------------------------------------------------")

#     # ==============================
#     # Determine Color Based on Status
#     # ==============================
#     if status == "Normal":
#         color = (0, 255, 0)  # Green
#     elif "Damaged" in status or "Unclear" in status:
#         color = (0, 0, 255)  # Red
#     else:
#         color = (0, 165, 255)  # Orange

#     # ==============================
#     # Drawing
#     # ==============================
#     detected_img = original.copy()
#     cv2.rectangle(detected_img, (x1, y1), (x2, y2), color, 3)
#     cv2.putText(detected_img,
#                 f"{class_name} ({confidence:.2f}) - {status}",
#                 (x1, y1-10),
#                 cv2.FONT_HERSHEY_SIMPLEX,
#                 0.7,
#                 color,
#                 2)

#     crop_display = crop.copy()
#     cv2.putText(crop_display,
#                 f"{class_name} - {status}",
#                 (10,30),
#                 cv2.FONT_HERSHEY_SIMPLEX,
#                 0.8,
#                 color,
#                 2)

#     return original, detected_img, crop_display

# # =====================================================
# # INPUT MODE
# # =====================================================
# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")
# choice = input("Enter choice (1/2/3): ")

# if choice in ["1", "2"]:
#     root = tk.Tk()
#     root.withdraw()
#     path = filedialog.askopenfilename(title="Select File")
#     root.destroy()
#     if not path:
#         print("❌ No file selected.")
#         exit()

# if choice == "1":
#     img = cv2.imread(path)
#     orig, detected, crop = process_frame(img)
#     if crop is None:
#         exit()

#     combined = np.hstack([
#         cv2.resize(orig, (400,400)),
#         cv2.resize(detected, (400,400)),
#         cv2.resize(crop, (400,400))
#     ])
#     cv2.imshow("Detection Pipeline", combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()

# elif choice == "2":
#     cap = cv2.VideoCapture(path)
#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300,300)),
#                 cv2.resize(detected, (300,300)),
#                 cv2.resize(crop, (300,300))
#             ])
#             cv2.imshow("Detection Pipeline", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()

# elif choice == "3":
#     cap = cv2.VideoCapture(0)
#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300,300)),
#                 cv2.resize(detected, (300,300)),
#                 cv2.resize(crop, (300,300))
#             ])
#             cv2.imshow("Live Detection", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()

# else:
#     print("Invalid choice.")


# after enhancement CLAHE ////////////////////////////////////////////////////////////////////////////////////////////////////////


# import cv2
# import os
# import json
# import numpy as np
# from ultralytics import YOLO
# from tensorflow import keras
# from tensorflow.keras import layers
# import tkinter as tk
# from tkinter import filedialog

# # =====================================================
# # CONFIG
# # =====================================================
# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# NORMAL_THRESHOLD = 0.75
# DAMAGED_THRESHOLD = 0.40
# BLUR_THRESHOLD = 100  # Tune based on camera

# YOLO_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Detect_Model\RoadSignDetector_v22\weights\best.pt"
# CLASS_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\epoch_026.weights.h5"
# CLASS_MAPPING_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\class_mapping.json"

# # =====================================================
# # LOAD MODELS
# # =====================================================
# detector = YOLO(YOLO_MODEL_PATH)
# print("✅ YOLO Detection Model Loaded")

# with open(CLASS_MAPPING_PATH, "r") as f:
#     class_indices = json.load(f)

# index_to_class = {v: k for k, v in class_indices.items()}
# NUM_CLASSES = len(class_indices)

# # =====================================================
# # CLASSIFICATION MODEL
# # =====================================================
# def conv_block(x, filters, stride=1):
#     shortcut = x
#     x = layers.Conv2D(filters, (3,3), strides=stride, padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters, (3,3), padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride != 1 or shortcut.shape[-1] != filters:
#         shortcut = layers.Conv2D(filters, (1,1), strides=stride, padding='same', use_bias=False)(shortcut)
#         shortcut = layers.BatchNormalization()(shortcut)

#     x = layers.Add()([x, shortcut])
#     x = layers.ReLU()(x)
#     return x

# def depthwise_block(x, filters, stride=1):
#     shortcut = x
#     x = layers.DepthwiseConv2D((3,3), strides=stride, padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters, (1,1), padding='same', use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride == 1 and shortcut.shape[-1] == filters:
#         x = layers.Add()([x, shortcut])

#     x = layers.ReLU()(x)
#     return x

# def build_model():
#     inputs = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
#     x = layers.Conv2D(32, (3,3), strides=2, padding='same', use_bias=False)(inputs)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = conv_block(x, 64)
#     x = conv_block(x, 64)

#     x = conv_block(x, 128, stride=2)
#     x = conv_block(x, 128)

#     x = depthwise_block(x, 256, stride=2)
#     x = depthwise_block(x, 256)

#     x = depthwise_block(x, 512, stride=2)
#     x = depthwise_block(x, 512)

#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.6)(x)

#     x = layers.Dense(512, activation='relu')(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)
#     return keras.Model(inputs, outputs)

# classifier = build_model()
# classifier.load_weights(CLASS_MODEL_PATH)
# print("✅ Classification Model Loaded")

# # =====================================================
# # IMAGE QUALITY FUNCTIONS
# # =====================================================
# def blur_score(image):
#     gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
#     return cv2.Laplacian(gray, cv2.CV_64F).var()

# def sharpen_image(image):
#     gaussian = cv2.GaussianBlur(image, (9,9), 10)
#     return cv2.addWeighted(image, 1.5, gaussian, -0.5, 0)

# def apply_clahe(image):
#     lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
#     l, a, b = cv2.split(lab)
#     clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
#     cl = clahe.apply(l)
#     merged = cv2.merge((cl,a,b))
#     return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)

# def classify_crop(crop):
#     crop_resized = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
#     crop_rgb = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2RGB)
#     crop_norm = crop_rgb.astype("float32") / 255.0
#     crop_input = np.expand_dims(crop_norm, axis=0)

#     pred = classifier.predict(crop_input, verbose=0)[0]
#     class_id = np.argmax(pred)
#     class_name = index_to_class[class_id]
#     confidence = float(pred[class_id])
#     return class_name, confidence

# # =====================================================
# # PROCESS FRAME
# # =====================================================
# def process_frame(frame):

#     original = frame.copy()
#     results = detector(frame, conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes) == 0:
#         print("❌ No road sign detected.")
#         return original, original, None

#     best_box = max(boxes, key=lambda b: float(b.conf[0]))
#     x1, y1, x2, y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     w = x2 - x1
#     h = y2 - y1
#     mx = int(w * MARGIN_RATIO)
#     my = int(h * MARGIN_RATIO)

#     x1 = max(0, x1 - mx)
#     y1 = max(0, y1 - my)
#     x2 = min(frame.shape[1], x2 + mx)
#     y2 = min(frame.shape[0], y2 + my)

#     crop = frame[y1:y2, x1:x2]

#     blur_value = blur_score(crop)
#     print(f"\n[INFO] Blur Score: {blur_value:.2f}")

#     # ------------------------------
#     # Original Classification
#     # ------------------------------
#     class_o, conf_o = classify_crop(crop)
#     print(f"[Original] {class_o} | {conf_o:.4f}")

#     best_class = class_o
#     best_conf = conf_o
#     best_crop = crop

#     # ------------------------------
#     # Enhancements if Blurry
#     # ------------------------------
#     if blur_value < BLUR_THRESHOLD:

#         sharpened = sharpen_image(crop)
#         class_s, conf_s = classify_crop(sharpened)
#         print(f"[Sharpen]  {class_s} | {conf_s:.4f}")

#         if conf_s > best_conf:
#             best_conf = conf_s
#             best_class = class_s
#             best_crop = sharpened

#         clahe_img = apply_clahe(crop)
#         class_c, conf_c = classify_crop(clahe_img)
#         print(f"[CLAHE]    {class_c} | {conf_c:.4f}")

#         if conf_c > best_conf:
#             best_conf = conf_c
#             best_class = class_c
#             best_crop = clahe_img

#     confidence = best_conf
#     class_name = best_class
#     crop = best_crop

#     # ------------------------------
#     # Status Decision
#     # ------------------------------
#     if confidence >= NORMAL_THRESHOLD:
#         status = "Normal"
#     elif confidence < DAMAGED_THRESHOLD and blur_value < BLUR_THRESHOLD:
#         status = "Damaged (Unclear Image)"
#     elif confidence < DAMAGED_THRESHOLD and blur_value >= BLUR_THRESHOLD:
#         status = "Uncertain Classification"
#     else:
#         status = "Possibly unclear "

#     print(f"[FINAL] {class_name} | {confidence:.4f} | {status}")

#     # ------------------------------
#     # Visualization
#     # ------------------------------
#     if status == "Normal":
#         color = (0,255,0)
#     elif "Damaged" in status:
#         color = (0,0,255)
#     else:
#         color = (0,165,255)

#     detected_img = original.copy()
#     cv2.rectangle(detected_img, (x1,y1), (x2,y2), color, 3)
#     cv2.putText(detected_img,
#                 f"{class_name} ({confidence:.2f}) - {status}",
#                 (x1,y1-10),
#                 cv2.FONT_HERSHEY_SIMPLEX,
#                 0.7,
#                 color,
#                 2)

#     crop_display = crop.copy()
#     cv2.putText(crop_display,
#                 f"{class_name} - {status}",
#                 (10,30),
#                 cv2.FONT_HERSHEY_SIMPLEX,
#                 0.8,
#                 color,
#                 2)

#     return original, detected_img, crop_display

# # =====================================================
# # INPUT MODE
# # =====================================================
# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")
# choice = input("Enter choice (1/2/3): ")

# if choice in ["1", "2"]:
#     root = tk.Tk()
#     root.withdraw()
#     path = filedialog.askopenfilename(title="Select File")
#     root.destroy()
#     if not path:
#         print("❌ No file selected.")
#         exit()

# if choice == "1":
#     img = cv2.imread(path)
#     orig, detected, crop = process_frame(img)
#     if crop is None:
#         exit()

#     combined = np.hstack([
#         cv2.resize(orig, (400,400)),
#         cv2.resize(detected, (400,400)),
#         cv2.resize(crop, (400,400))
#     ])
#     cv2.imshow("Detection Pipeline", combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()

# elif choice == "2":
#     cap = cv2.VideoCapture(path)
#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break
#         orig, detected, crop = process_frame(frame)
#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300,300)),
#                 cv2.resize(detected, (300,300)),
#                 cv2.resize(crop, (300,300))
#             ])
#             cv2.imshow("Detection Pipeline", combined)
#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break
#     cap.release()
#     cv2.destroyAllWindows()

# elif choice == "3":
#     cap = cv2.VideoCapture(0)
#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break
#         orig, detected, crop = process_frame(frame)
#         if crop is not None:
#             combined = np.hstack([
#                 cv2.resize(orig, (300,300)),
#                 cv2.resize(detected, (300,300)),
#                 cv2.resize(crop, (300,300))
#             ])
#             cv2.imshow("Live Detection", combined)
#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break
#     cap.release()
#     cv2.destroyAllWindows()

# else:
#     print("Invalid choice.")


####YOLO model //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

# import cv2
# import numpy as np
# from ultralytics import YOLO
# import tkinter as tk
# from tkinter import filedialog

# # =====================================================
# # CONFIG
# # =====================================================

# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# NORMAL_THRESHOLD = 0.75
# DAMAGED_THRESHOLD = 0.40
# BLUR_THRESHOLD = 100

# DETECT_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Detect_Model\RoadSignDetector_v22\weights\best.pt"
# YOLO_CLASS_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\YOLO8\YOLOv8_Classifier\weights\best.pt"

# # =====================================================
# # LOAD MODELS
# # =====================================================

# detector = YOLO(DETECT_MODEL_PATH)
# classifier = YOLO(YOLO_CLASS_MODEL_PATH)

# print("✅ YOLO Detection Model Loaded")
# print("✅ YOLOv8 Classification Model Loaded")

# # =====================================================
# # IMAGE QUALITY FUNCTIONS
# # =====================================================

# def blur_score(image):
#     gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
#     return cv2.Laplacian(gray, cv2.CV_64F).var()


# def sharpen_image(image):
#     gaussian = cv2.GaussianBlur(image, (9,9), 10)
#     return cv2.addWeighted(image, 1.5, gaussian, -0.5, 0)


# def apply_clahe(image):
#     lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
#     l, a, b = cv2.split(lab)

#     clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
#     cl = clahe.apply(l)

#     merged = cv2.merge((cl,a,b))
#     return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


# # =====================================================
# # CLASSIFICATION FUNCTION
# # =====================================================

# def classify_crop(crop):

#     crop_resized = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))

#     results = classifier.predict(crop_resized, verbose=False)

#     probs = results[0].probs
#     class_id = int(probs.top1)
#     confidence = float(probs.top1conf)

#     class_name = classifier.names[class_id]

#     return class_name, confidence


# # =====================================================
# # PROCESS FRAME
# # =====================================================

# def process_frame(frame):

#     original = frame.copy()

#     results = detector(frame, conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes) == 0:
#         print("❌ No road sign detected.")
#         return original, original, None

#     best_box = max(boxes, key=lambda b: float(b.conf[0]))

#     x1, y1, x2, y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     w = x2 - x1
#     h = y2 - y1

#     mx = int(w * MARGIN_RATIO)
#     my = int(h * MARGIN_RATIO)

#     x1 = max(0, x1 - mx)
#     y1 = max(0, y1 - my)
#     x2 = min(frame.shape[1], x2 + mx)
#     y2 = min(frame.shape[0], y2 + my)

#     crop = frame[y1:y2, x1:x2]

#     blur_value = blur_score(crop)

#     print("\n----------------------------------")
#     print(f"[INFO] Blur Score: {blur_value:.2f}")

#     # ORIGINAL
#     class_o, conf_o = classify_crop(crop)
#     print(f"[Original] {class_o} | {conf_o:.4f}")

#     best_class = class_o
#     best_conf = conf_o
#     best_crop = crop
#     best_version = "Original"

#     # SHARPEN
#     sharpened = sharpen_image(crop)
#     class_s, conf_s = classify_crop(sharpened)
#     print(f"[Sharpen]  {class_s} | {conf_s:.4f}")

#     if conf_s > best_conf:
#         best_conf = conf_s
#         best_class = class_s
#         best_crop = sharpened
#         best_version = "Sharpen"

#     # CLAHE
#     clahe_img = apply_clahe(crop)
#     class_c, conf_c = classify_crop(clahe_img)
#     print(f"[CLAHE]    {class_c} | {conf_c:.4f}")

#     if conf_c > best_conf:
#         best_conf = conf_c
#         best_class = class_c
#         best_crop = clahe_img
#         best_version = "CLAHE"

#     print(f"[SELECTED VERSION] {best_version}")

#     # STATUS
#     if best_conf >= NORMAL_THRESHOLD:
#         status = "Normal"
#     elif best_conf < DAMAGED_THRESHOLD and blur_value < BLUR_THRESHOLD:
#         status = "Damaged (Unclear Image)"
#     elif best_conf < DAMAGED_THRESHOLD and blur_value >= BLUR_THRESHOLD:
#         status = "Uncertain Classification"
#     else:
#         status = "Possibly unclear"

#     print(f"[FINAL] {best_class} | {best_conf:.4f} | {status}")
#     print("----------------------------------")

#     # VISUALIZATION
#     if status == "Normal":
#         color = (0,255,0)
#     elif "Damaged" in status:
#         color = (0,0,255)
#     else:
#         color = (0,165,255)

#     detected_img = original.copy()

#     cv2.rectangle(detected_img, (x1,y1), (x2,y2), color, 3)

#     cv2.putText(
#         detected_img,
#         f"{best_class} ({best_conf:.2f})",
#         (x1,y1-10),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.7,
#         color,
#         2
#     )

#     crop_display = best_crop.copy()

#     cv2.putText(
#         crop_display,
#         f"{best_class} - {status}",
#         (10,30),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.8,
#         color,
#         2
#     )

#     return original, detected_img, crop_display


# # =====================================================
# # INPUT MODE
# # =====================================================

# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")

# choice = input("Enter choice (1/2/3): ")

# if choice in ["1", "2"]:
#     root = tk.Tk()
#     root.withdraw()
#     path = filedialog.askopenfilename(title="Select File")
#     root.destroy()

#     if not path:
#         print("❌ No file selected.")
#         exit()

# # =====================================================
# # IMAGE MODE
# # =====================================================

# if choice == "1":

#     img = cv2.imread(path)

#     orig, detected, crop = process_frame(img)

#     if crop is None:
#         exit()

#     combined = np.hstack([
#         cv2.resize(orig,(400,400)),
#         cv2.resize(detected,(400,400)),
#         cv2.resize(crop,(400,400))
#     ])

#     cv2.imshow("Detection Pipeline", combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()


# # =====================================================
# # VIDEO MODE
# # =====================================================

# elif choice == "2":

#     cap = cv2.VideoCapture(path)

#     while True:

#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:

#             combined = np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Detection Pipeline", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()


# # =====================================================
# # WEBCAM MODE
# # =====================================================

# elif choice == "3":

#     cap = cv2.VideoCapture(0)

#     while True:

#         ret, frame = cap.read()
#         if not ret:
#             break

#         orig, detected, crop = process_frame(frame)

#         if crop is not None:

#             combined = np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Live Detection", combined)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()

# else:
#     print("Invalid choice.")





# After applying ensenble method////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


# import cv2
# import json
# import numpy as np
# from ultralytics import YOLO
# import tkinter as tk
# from tkinter import filedialog

# from tensorflow import keras
# from tensorflow.keras import layers
# from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

# # ============================================
# # CONFIG
# # ============================================

# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# NORMAL_THRESHOLD = 0.75
# DAMAGED_THRESHOLD = 0.40
# BLUR_THRESHOLD = 100

# YOLO_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Detect_Model\RoadSignDetector_v22\weights\best.pt"

# MOBILENET_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\mobilenet_weights\Mobilenetv2_Retrain_weight\phase2_epoch_015.weights.h5"

# CUSTOM_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\epoch_026.weights.h5"

# CLASS_MAPPING_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\class_mapping.json"


# # ============================================
# # LOAD YOLO
# # ============================================

# detector = YOLO(YOLO_MODEL_PATH)
# print("✅ YOLO Detection Model Loaded")


# # ============================================
# # CLASS MAPPING
# # ============================================

# with open(CLASS_MAPPING_PATH, "r") as f:
#     class_indices = json.load(f)

# index_to_class = {v: k for k, v in class_indices.items()}
# NUM_CLASSES = len(class_indices)


# # ============================================
# # MOBILENETV2 MODEL
# # ============================================

# def build_mobilenet():

#     base_model = keras.applications.MobileNetV2(
#         input_shape=(IMG_SIZE, IMG_SIZE, 3),
#         include_top=False,
#         weights=None
#     )

#     x = base_model.output
#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.Dense(256, activation='relu')(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

#     return keras.Model(inputs=base_model.input, outputs=outputs)


# mobilenet_model = build_mobilenet()
# mobilenet_model.load_weights(MOBILENET_PATH)

# print("✅ MobileNetV2 Loaded")


# # ============================================
# # CUSTOM MODEL 2 ARCHITECTURE
# # ============================================

# def conv_block(x, filters, stride=1):

#     shortcut = x

#     x = layers.Conv2D(filters,(3,3),strides=stride,padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters,(3,3),padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride != 1 or shortcut.shape[-1] != filters:
#         shortcut = layers.Conv2D(filters,(1,1),strides=stride,padding='same',use_bias=False)(shortcut)
#         shortcut = layers.BatchNormalization()(shortcut)

#     x = layers.Add()([x,shortcut])
#     x = layers.ReLU()(x)

#     return x


# def depthwise_block(x, filters, stride=1):

#     shortcut = x

#     x = layers.DepthwiseConv2D((3,3),strides=stride,padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters,(1,1),padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride == 1 and shortcut.shape[-1] == filters:
#         x = layers.Add()([x,shortcut])

#     x = layers.ReLU()(x)

#     return x


# def build_custom():

#     inputs = keras.Input(shape=(224,224,3))

#     x = layers.Conv2D(32,(3,3),strides=2,padding='same',use_bias=False)(inputs)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = conv_block(x,64)
#     x = conv_block(x,64)

#     x = conv_block(x,128,stride=2)
#     x = conv_block(x,128)

#     x = depthwise_block(x,256,stride=2)
#     x = depthwise_block(x,256)

#     x = depthwise_block(x,512,stride=2)
#     x = depthwise_block(x,512)

#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.6)(x)

#     x = layers.Dense(512,activation='relu')(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES,activation='softmax')(x)

#     return keras.Model(inputs,outputs)


# custom_model = build_custom()
# custom_model.load_weights(CUSTOM_MODEL_PATH)

# print("✅ Custom Model 2 Loaded")


# # ============================================
# # IMAGE QUALITY FUNCTIONS
# # ============================================

# def blur_score(image):

#     gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
#     return cv2.Laplacian(gray, cv2.CV_64F).var()


# def sharpen_image(image):

#     gaussian = cv2.GaussianBlur(image,(9,9),10)
#     return cv2.addWeighted(image,1.5,gaussian,-0.5,0)


# def apply_clahe(image):

#     lab = cv2.cvtColor(image,cv2.COLOR_BGR2LAB)

#     l,a,b = cv2.split(lab)

#     clahe = cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8))

#     cl = clahe.apply(l)

#     merged = cv2.merge((cl,a,b))

#     return cv2.cvtColor(merged,cv2.COLOR_LAB2BGR)


# # ============================================
# # MODEL PREDICTIONS
# # ============================================

# def mobilenet_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
#     img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
#     img = preprocess_input(img)

#     img = np.expand_dims(img,axis=0)

#     pred = mobilenet_model.predict(img,verbose=0)[0]

#     return pred


# def custom_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
#     img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
#     img = img.astype("float32")/255.0

#     img = np.expand_dims(img,axis=0)

#     pred = custom_model.predict(img,verbose=0)[0]

#     return pred


# # ============================================
# # ENSEMBLE WITH DEBUG PRINT
# # ============================================

# def evaluate_image_version(img, name):

#     pred_m = mobilenet_predict(img)
#     pred_c = custom_predict(img)

#     class_m = index_to_class[np.argmax(pred_m)]
#     conf_m = float(np.max(pred_m))

#     class_c = index_to_class[np.argmax(pred_c)]
#     conf_c = float(np.max(pred_c))

#     ensemble = (pred_m + pred_c) / 2

#     class_e = index_to_class[np.argmax(ensemble)]
#     conf_e = float(np.max(ensemble))

#     print(f"\n---- {name} ----")
#     print(f"MobileNetV2 : {class_m} | {conf_m:.4f}")
#     print(f"CustomModel2: {class_c} | {conf_c:.4f}")
#     print(f"Ensemble    : {class_e} | {conf_e:.4f}")

#     return class_e, conf_e, ensemble


# # ============================================
# # FRAME PROCESSING
# # ============================================

# def process_frame(frame):

#     original = frame.copy()

#     results = detector(frame,conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes) == 0:
#         return original,original,None

#     best_box = max(boxes,key=lambda b:float(b.conf[0]))

#     x1,y1,x2,y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     w = x2-x1
#     h = y2-y1

#     mx = int(w*MARGIN_RATIO)
#     my = int(h*MARGIN_RATIO)

#     x1 = max(0,x1-mx)
#     y1 = max(0,y1-my)
#     x2 = min(frame.shape[1],x2+mx)
#     y2 = min(frame.shape[0],y2+my)

#     crop = frame[y1:y2,x1:x2]

#     print("\n-----------------------------------------")

#     blur_value = blur_score(crop)

#     print(f"[INFO] Blur Score: {blur_value:.2f}")

#     results_list = []

#     # ORIGINAL
#     class_o, conf_o, _ = evaluate_image_version(crop, "Original Image")
#     results_list.append(("Original", crop, class_o, conf_o))

#     # SHARPEN
#     sharpened = sharpen_image(crop)
#     class_s, conf_s, _ = evaluate_image_version(sharpened, "Sharpened Image")
#     results_list.append(("Sharpen", sharpened, class_s, conf_s))

#     # CLAHE
#     clahe_img = apply_clahe(crop)
#     class_c, conf_c, _ = evaluate_image_version(clahe_img, "CLAHE Image")
#     results_list.append(("CLAHE", clahe_img, class_c, conf_c))

#     # SELECT BEST
#     best = max(results_list, key=lambda x: x[3])

#     version, best_crop, class_name, confidence = best

#     print(f"\n[SELECTED VERSION] {version}")

#     if confidence >= NORMAL_THRESHOLD:
#         status = "Normal"
#     elif confidence < DAMAGED_THRESHOLD:
#         status = "Damaged"
#     else:
#         status = "Possibly unclear"

#     print("\n[FINAL RESULT]")
#     print(f"Class      : {class_name}")
#     print(f"Confidence : {confidence:.4f}")
#     print(f"Status     : {status}")
#     print("-----------------------------------------")

#     # DRAW
#     color = (0,255,0) if status=="Normal" else (0,0,255)

#     detected_img = original.copy()

#     cv2.rectangle(detected_img,(x1,y1),(x2,y2),color,3)

#     cv2.putText(
#         detected_img,
#         f"{class_name} ({confidence:.2f})",
#         (x1,y1-10),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.8,
#         color,
#         2
#     )

#     crop_display = best_crop.copy()

#     cv2.putText(
#         crop_display,
#         f"{class_name} - {status}",
#         (10,30),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         1,
#         color,
#         2
#     )

#     return original,detected_img,crop_display


# # ============================================
# # INPUT MODE
# # ============================================

# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")

# choice = input("Enter choice (1/2/3): ")

# if choice in ["1","2"]:

#     root = tk.Tk()
#     root.withdraw()

#     path = filedialog.askopenfilename(title="Select File")

#     root.destroy()

#     if not path:
#         print("No file selected")
#         exit()


# # ============================================
# # IMAGE MODE
# # ============================================

# if choice == "1":

#     img = cv2.imread(path)

#     orig,detected,crop = process_frame(img)

#     if crop is None:
#         print("No sign detected")
#         exit()

#     combined = np.hstack([
#         cv2.resize(orig,(400,400)),
#         cv2.resize(detected,(400,400)),
#         cv2.resize(crop,(400,400))
#     ])

#     cv2.imshow("Detection Pipeline",combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()


# # ============================================
# # VIDEO MODE
# # ============================================

# elif choice == "2":

#     cap = cv2.VideoCapture(path)

#     while True:

#         ret,frame = cap.read()

#         if not ret:
#             break

#         orig,detected,crop = process_frame(frame)

#         if crop is not None:

#             combined = np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Detection Pipeline",combined)

#         if cv2.waitKey(1)&0xFF==ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()


# # ============================================
# # WEBCAM MODE
# # ============================================

# elif choice == "3":

#     cap = cv2.VideoCapture(0)

#     while True:

#         ret,frame = cap.read()

#         if not ret:
#             break

#         orig,detected,crop = process_frame(frame)

#         if crop is not None:

#             combined = np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Live Detection",combined)

#         if cv2.waitKey(1)&0xFF==ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()


###applying ensemble method with YOLOv8 classifier////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



# import cv2
# import json
# import numpy as np
# from ultralytics import YOLO
# import tkinter as tk
# from tkinter import filedialog

# from tensorflow import keras
# from tensorflow.keras import layers
# from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

# # ============================================
# # CONFIG
# # ============================================

# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# NORMAL_THRESHOLD = 0.75
# DAMAGED_THRESHOLD = 0.40
# BLUR_THRESHOLD = 100

# YOLO_DETECT_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Detect_Model\RoadSignDetector_v22\weights\best.pt"

# MOBILENET_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\mobilenet_weights\Mobilenetv2_Retrain_weight\phase2_epoch_015.weights.h5"

# CUSTOM_MODEL_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\epoch_026.weights.h5"

# YOLO_CLASSIFIER_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\YOLO8\YOLOv8_Classifier\weights\best.pt"

# CLASS_MAPPING_PATH = r"D:\Nethmyy__Research\Research_YOLO_model\Weight\Custom_model2_weights\class_mapping.json"


# # ============================================
# # LOAD YOLO DETECTION
# # ============================================

# detector = YOLO(YOLO_DETECT_PATH)
# print("✅ YOLO Detection Model Loaded")


# # ============================================
# # LOAD CLASS MAPPING
# # ============================================

# with open(CLASS_MAPPING_PATH, "r") as f:
#     class_indices = json.load(f)

# index_to_class = {v: k for k, v in class_indices.items()}
# NUM_CLASSES = len(class_indices)


# # ============================================
# # MOBILENET MODEL
# # ============================================

# def build_mobilenet():

#     base_model = keras.applications.MobileNetV2(
#         input_shape=(IMG_SIZE, IMG_SIZE, 3),
#         include_top=False,
#         weights=None
#     )

#     x = base_model.output
#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.Dense(256, activation='relu')(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

#     return keras.Model(inputs=base_model.input, outputs=outputs)


# mobilenet_model = build_mobilenet()
# mobilenet_model.load_weights(MOBILENET_PATH)

# print("✅ MobileNetV2 Loaded")


# # ============================================
# # CUSTOM MODEL ARCHITECTURE
# # ============================================

# def conv_block(x, filters, stride=1):

#     shortcut = x

#     x = layers.Conv2D(filters,(3,3),strides=stride,padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters,(3,3),padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride != 1 or shortcut.shape[-1] != filters:
#         shortcut = layers.Conv2D(filters,(1,1),strides=stride,padding='same',use_bias=False)(shortcut)
#         shortcut = layers.BatchNormalization()(shortcut)

#     x = layers.Add()([x,shortcut])
#     x = layers.ReLU()(x)

#     return x


# def depthwise_block(x, filters, stride=1):

#     shortcut = x

#     x = layers.DepthwiseConv2D((3,3),strides=stride,padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters,(1,1),padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride == 1 and shortcut.shape[-1] == filters:
#         x = layers.Add()([x,shortcut])

#     x = layers.ReLU()(x)

#     return x


# def build_custom():

#     inputs = keras.Input(shape=(224,224,3))

#     x = layers.Conv2D(32,(3,3),strides=2,padding='same',use_bias=False)(inputs)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = conv_block(x,64)
#     x = conv_block(x,64)

#     x = conv_block(x,128,stride=2)
#     x = conv_block(x,128)

#     x = depthwise_block(x,256,stride=2)
#     x = depthwise_block(x,256)

#     x = depthwise_block(x,512,stride=2)
#     x = depthwise_block(x,512)

#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.6)(x)

#     x = layers.Dense(512,activation='relu')(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES,activation='softmax')(x)

#     return keras.Model(inputs,outputs)


# custom_model = build_custom()
# custom_model.load_weights(CUSTOM_MODEL_PATH)

# print("✅ Custom Model Loaded")


# # ============================================
# # YOLOv8 CLASSIFIER
# # ============================================

# yolo_classifier = YOLO(YOLO_CLASSIFIER_PATH)

# print("✅ YOLOv8 Classifier Loaded")


# # ============================================
# # IMAGE QUALITY FUNCTIONS
# # ============================================

# def blur_score(image):

#     gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
#     return cv2.Laplacian(gray, cv2.CV_64F).var()


# def sharpen_image(image):

#     gaussian = cv2.GaussianBlur(image,(9,9),10)
#     return cv2.addWeighted(image,1.5,gaussian,-0.5,0)


# def apply_clahe(image):

#     lab = cv2.cvtColor(image,cv2.COLOR_BGR2LAB)

#     l,a,b = cv2.split(lab)

#     clahe = cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8))

#     cl = clahe.apply(l)

#     merged = cv2.merge((cl,a,b))

#     return cv2.cvtColor(merged,cv2.COLOR_LAB2BGR)


# # ============================================
# # MODEL PREDICTIONS
# # ============================================

# def mobilenet_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
#     img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
#     img = preprocess_input(img)

#     img = np.expand_dims(img,axis=0)

#     pred = mobilenet_model.predict(img,verbose=0)[0]

#     return pred


# def custom_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
#     img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
#     img = img.astype("float32")/255.0

#     img = np.expand_dims(img,axis=0)

#     pred = custom_model.predict(img,verbose=0)[0]

#     return pred


# def yolo_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))

#     results = yolo_classifier.predict(img,verbose=False)

#     probs = results[0].probs.data.cpu().numpy()

#     return probs


# # ============================================
# # ENSEMBLE
# # ============================================

# def evaluate_image_version(img,name):

#     pred_m = mobilenet_predict(img)
#     pred_c = custom_predict(img)
#     pred_y = yolo_predict(img)

#     class_m = index_to_class[np.argmax(pred_m)]
#     conf_m = float(np.max(pred_m))

#     class_c = index_to_class[np.argmax(pred_c)]
#     conf_c = float(np.max(pred_c))

#     class_y = index_to_class[np.argmax(pred_y)]
#     conf_y = float(np.max(pred_y))

#     ensemble = (pred_m + pred_c + pred_y) / 3

#     class_e = index_to_class[np.argmax(ensemble)]
#     conf_e = float(np.max(ensemble))

#     print(f"\n---- {name} ----")
#     print(f"MobileNetV2 : {class_m} | {conf_m:.4f}")
#     print(f"CustomModel2: {class_c} | {conf_c:.4f}")
#     print(f"YOLOv8      : {class_y} | {conf_y:.4f}")
#     print(f"Ensemble    : {class_e} | {conf_e:.4f}")

#     return class_e, conf_e


# # ============================================
# # PROCESS FRAME
# # ============================================

# def process_frame(frame):

#     original = frame.copy()

#     results = detector(frame,conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes)==0:
#         return original,original,None

#     best_box = max(boxes,key=lambda b:float(b.conf[0]))

#     x1,y1,x2,y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     crop = frame[y1:y2,x1:x2]

#     print("\n----------------------------------")

#     blur_value = blur_score(crop)

#     print(f"[INFO] Blur Score: {blur_value:.2f}")

#     results_list = []

#     class_o,conf_o = evaluate_image_version(crop,"Original")
#     results_list.append(("Original",crop,class_o,conf_o))

#     sharpened = sharpen_image(crop)
#     class_s,conf_s = evaluate_image_version(sharpened,"Sharpen")
#     results_list.append(("Sharpen",sharpened,class_s,conf_s))

#     clahe_img = apply_clahe(crop)
#     class_c,conf_c = evaluate_image_version(clahe_img,"CLAHE")
#     results_list.append(("CLAHE",clahe_img,class_c,conf_c))

#     best = max(results_list,key=lambda x:x[3])

#     version,best_crop,class_name,confidence = best

#     print(f"\n[SELECTED VERSION] {version}")

#     if confidence >= NORMAL_THRESHOLD:
#         status="Normal"
#     elif confidence < DAMAGED_THRESHOLD:
#         status="Damaged"
#     else:
#         status="Possibly unclear"

#     print("\n[FINAL RESULT]")
#     print(f"Class      : {class_name}")
#     print(f"Confidence : {confidence:.4f}")
#     print(f"Status     : {status}")
#     print("----------------------------------")

#     color = (0,255,0) if status=="Normal" else (0,0,255)

#     detected_img = original.copy()

#     cv2.rectangle(detected_img,(x1,y1),(x2,y2),color,3)

#     cv2.putText(
#         detected_img,
#         f"{class_name} ({confidence:.2f})",
#         (x1,y1-10),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.8,
#         color,
#         2
#     )

#     crop_display = best_crop.copy()

#     cv2.putText(
#         crop_display,
#         f"{class_name} - {status}",
#         (10,30),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         1,
#         color,
#         2
#     )

#     return original,detected_img,crop_display


# # ============================================
# # INPUT MODE
# # ============================================

# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")

# choice=input("Enter choice (1/2/3): ")

# if choice in ["1","2"]:

#     root=tk.Tk()
#     root.withdraw()

#     path=filedialog.askopenfilename(title="Select File")

#     root.destroy()

#     if not path:
#         exit()


# if choice=="1":

#     img=cv2.imread(path)

#     orig,detected,crop=process_frame(img)

#     if crop is None:
#         exit()

#     combined=np.hstack([
#         cv2.resize(orig,(400,400)),
#         cv2.resize(detected,(400,400)),
#         cv2.resize(crop,(400,400))
#     ])

#     cv2.imshow("Detection Pipeline",combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()


# elif choice=="2":

#     cap=cv2.VideoCapture(path)

#     while True:

#         ret,frame=cap.read()

#         if not ret:
#             break

#         orig,detected,crop=process_frame(frame)

#         if crop is not None:

#             combined=np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Detection Pipeline",combined)

#         if cv2.waitKey(1)&0xFF==ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()


# elif choice=="3":

#     cap=cv2.VideoCapture(0)

#     while True:

#         ret,frame=cap.read()

#         if not ret:
#             break

#         orig,detected,crop=process_frame(frame)

#         if crop is not None:

#             combined=np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Live Detection",combined)

#         if cv2.waitKey(1)&0xFF==ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()
    

# apply Temporal Frame Voting////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////




# import cv2
# import json
# import numpy as np
# from ultralytics import YOLO
# import tkinter as tk
# from tkinter import filedialog
# from collections import deque, Counter

# from tensorflow import keras
# from tensorflow.keras import layers
# from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

# # ============================================
# # CONFIG
# # ============================================

# IMG_SIZE = 224
# MARGIN_RATIO = 0.15

# NORMAL_THRESHOLD = 0.75
# DAMAGED_THRESHOLD = 0.40
# BLUR_THRESHOLD = 100

# # ============================================
# # TEMPORAL FRAME VOTING CONFIG
# # ============================================

# FRAME_BUFFER = 10
# MIN_VOTES = 7

# prediction_buffer = deque(maxlen=FRAME_BUFFER)
# stable_prediction = None

# YOLO_DETECT_PATH = r"D:\Nethmyy__Research\Robust-Road-sign-detector-for-PP2\Weights\Detect_Model\RoadSignDetector_v22\weights\best.pt"

# MOBILENET_PATH = r"D:\Nethmyy__Research\Robust-Road-sign-detector-for-PP2\Weights\mobilenet_weights\Mobilenetv2_Retrain_weight\phase2_epoch_015.weights.h5"

# CUSTOM_MODEL_PATH = r"D:\Nethmyy__Research\Robust-Road-sign-detector-for-PP2\Weights\Custom_model2_weights\epoch_026.weights.h5"

# YOLO_CLASSIFIER_PATH = r"D:\Nethmyy__Research\Robust-Road-sign-detector-for-PP2\Weights\YOLO8\YOLOv8_Classifier\weights\best.pt"

# CLASS_MAPPING_PATH = r"D:\Nethmyy__Research\Robust-Road-sign-detector-for-PP2\Weights\Custom_model2_weights\class_mapping.json"


# # ============================================
# # LOAD YOLO DETECTION
# # ============================================

# detector = YOLO(YOLO_DETECT_PATH)
# print("✅ YOLO Detection Model Loaded")


# # ============================================
# # LOAD CLASS MAPPING
# # ============================================

# with open(CLASS_MAPPING_PATH, "r") as f:
#     class_indices = json.load(f)

# index_to_class = {v: k for k, v in class_indices.items()}
# NUM_CLASSES = len(class_indices)


# # ============================================
# # MOBILENET MODEL
# # ============================================

# def build_mobilenet():

#     base_model = keras.applications.MobileNetV2(
#         input_shape=(IMG_SIZE, IMG_SIZE, 3),
#         include_top=False,
#         weights=None
#     )

#     x = base_model.output
#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.Dense(256, activation='relu')(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

#     return keras.Model(inputs=base_model.input, outputs=outputs)


# mobilenet_model = build_mobilenet()
# mobilenet_model.load_weights(MOBILENET_PATH)

# print("✅ MobileNetV2 Loaded")


# # ============================================
# # CUSTOM MODEL ARCHITECTURE
# # ============================================

# def conv_block(x, filters, stride=1):

#     shortcut = x

#     x = layers.Conv2D(filters,(3,3),strides=stride,padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters,(3,3),padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride != 1 or shortcut.shape[-1] != filters:
#         shortcut = layers.Conv2D(filters,(1,1),strides=stride,padding='same',use_bias=False)(shortcut)
#         shortcut = layers.BatchNormalization()(shortcut)

#     x = layers.Add()([x,shortcut])
#     x = layers.ReLU()(x)

#     return x


# def depthwise_block(x, filters, stride=1):

#     shortcut = x

#     x = layers.DepthwiseConv2D((3,3),strides=stride,padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = layers.Conv2D(filters,(1,1),padding='same',use_bias=False)(x)
#     x = layers.BatchNormalization()(x)

#     if stride == 1 and shortcut.shape[-1] == filters:
#         x = layers.Add()([x,shortcut])

#     x = layers.ReLU()(x)

#     return x


# def build_custom():

#     inputs = keras.Input(shape=(224,224,3))

#     x = layers.Conv2D(32,(3,3),strides=2,padding='same',use_bias=False)(inputs)
#     x = layers.BatchNormalization()(x)
#     x = layers.ReLU()(x)

#     x = conv_block(x,64)
#     x = conv_block(x,64)

#     x = conv_block(x,128,stride=2)
#     x = conv_block(x,128)

#     x = depthwise_block(x,256,stride=2)
#     x = depthwise_block(x,256)

#     x = depthwise_block(x,512,stride=2)
#     x = depthwise_block(x,512)

#     x = layers.GlobalAveragePooling2D()(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.6)(x)

#     x = layers.Dense(512,activation='relu')(x)
#     x = layers.BatchNormalization()(x)
#     x = layers.Dropout(0.5)(x)

#     outputs = layers.Dense(NUM_CLASSES,activation='softmax')(x)

#     return keras.Model(inputs,outputs)


# custom_model = build_custom()
# custom_model.load_weights(CUSTOM_MODEL_PATH)

# print("✅ Custom Model Loaded")


# # ============================================
# # YOLOv8 CLASSIFIER
# # ============================================

# yolo_classifier = YOLO(YOLO_CLASSIFIER_PATH)

# print("✅ YOLOv8 Classifier Loaded")


# # ============================================
# # IMAGE QUALITY FUNCTIONS
# # ============================================

# def blur_score(image):

#     gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
#     return cv2.Laplacian(gray, cv2.CV_64F).var()


# def sharpen_image(image):

#     gaussian = cv2.GaussianBlur(image,(9,9),10)
#     return cv2.addWeighted(image,1.5,gaussian,-0.5,0)


# def apply_clahe(image):

#     lab = cv2.cvtColor(image,cv2.COLOR_BGR2LAB)

#     l,a,b = cv2.split(lab)

#     clahe = cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8))

#     cl = clahe.apply(l)

#     merged = cv2.merge((cl,a,b))

#     return cv2.cvtColor(merged,cv2.COLOR_LAB2BGR)


# # ============================================
# # MODEL PREDICTIONS
# # ============================================

# def mobilenet_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
#     img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
#     img = preprocess_input(img)

#     img = np.expand_dims(img,axis=0)

#     pred = mobilenet_model.predict(img,verbose=0)[0]

#     return pred


# def custom_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
#     img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
#     img = img.astype("float32")/255.0

#     img = np.expand_dims(img,axis=0)

#     pred = custom_model.predict(img,verbose=0)[0]

#     return pred


# def yolo_predict(crop):

#     img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))

#     results = yolo_classifier.predict(img,verbose=False)

#     probs = results[0].probs.data.cpu().numpy()

#     return probs


# # ============================================
# # ENSEMBLE
# # ============================================

# def evaluate_image_version(img,name):

#     pred_m = mobilenet_predict(img)
#     pred_c = custom_predict(img)
#     pred_y = yolo_predict(img)

#     class_m = index_to_class[np.argmax(pred_m)]
#     conf_m = float(np.max(pred_m))

#     class_c = index_to_class[np.argmax(pred_c)]
#     conf_c = float(np.max(pred_c))

#     class_y = index_to_class[np.argmax(pred_y)]
#     conf_y = float(np.max(pred_y))

#     ensemble = (pred_m + pred_c + pred_y) / 3

#     class_e = index_to_class[np.argmax(ensemble)]
#     conf_e = float(np.max(ensemble))

#     print(f"\n---- {name} ----")
#     print(f"MobileNetV2 : {class_m} | {conf_m:.4f}")
#     print(f"CustomModel2: {class_c} | {conf_c:.4f}")
#     print(f"YOLOv8      : {class_y} | {conf_y:.4f}")
#     print(f"Ensemble    : {class_e} | {conf_e:.4f}")

#     return class_e, conf_e


# # ============================================
# # TEMPORAL FRAME VOTING
# # ============================================

# def temporal_voting(predicted_class):

#     global stable_prediction

#     prediction_buffer.append(predicted_class)

#     # If buffer not full yet
#     if len(prediction_buffer) < FRAME_BUFFER:
#         print("[TEMPORAL] Buffer not full yet...")
#         return None

#     counts = Counter(prediction_buffer)

#     best_class, votes = counts.most_common(1)[0]

#     print("\n[TEMPORAL VOTING]")
#     print("Buffer:", list(prediction_buffer))
#     print("Votes :", counts)

#     if votes >= MIN_VOTES:
#         stable_prediction = best_class
#         print(f"[CONFIRMED SIGN] {best_class}")
#         return best_class

#     return None

# # ============================================
# # PROCESS FRAME
# # ============================================

# def process_frame(frame):

#     original = frame.copy()

#     results = detector(frame,conf=0.25)
#     boxes = results[0].boxes

#     if len(boxes)==0:
#         return original,original,None

#     best_box = max(boxes,key=lambda b:float(b.conf[0]))

#     x1,y1,x2,y2 = best_box.xyxy[0].cpu().numpy().astype(int)

#     crop = frame[y1:y2,x1:x2]

#     print("\n----------------------------------")

#     blur_value = blur_score(crop)

#     print(f"[INFO] Blur Score: {blur_value:.2f}")

#     results_list = []

#     class_o,conf_o = evaluate_image_version(crop,"Original")
#     results_list.append(("Original",crop,class_o,conf_o))

#     sharpened = sharpen_image(crop)
#     class_s,conf_s = evaluate_image_version(sharpened,"Sharpen")
#     results_list.append(("Sharpen",sharpened,class_s,conf_s))

#     clahe_img = apply_clahe(crop)
#     class_c,conf_c = evaluate_image_version(clahe_img,"CLAHE")
#     results_list.append(("CLAHE",clahe_img,class_c,conf_c))

#     best = max(results_list,key=lambda x:x[3])

#     version,best_crop,class_name,confidence = best

#     # ============================================
#     # APPLY TEMPORAL FRAME VOTING
#     # ============================================

#     confirmed_class = temporal_voting(class_name)

#     if confirmed_class is not None:
#         display_class = confirmed_class
#     else:
#         display_class = "Detecting..."

#     print(f"\n[SELECTED VERSION] {version}")

#     if confidence >= NORMAL_THRESHOLD:
#         status="Normal"
#     elif confidence < DAMAGED_THRESHOLD:
#         status="Damaged"
#     else:
#         status="Possibly unclear"

#     print("\n[FINAL RESULT]")
#     print(f"Class      : {class_name}")
#     print(f"Confidence : {confidence:.4f}")
#     print(f"Status     : {status}")
#     print("----------------------------------")

#     color = (0,255,0) if status=="Normal" else (0,0,255)

#     detected_img = original.copy()

#     cv2.rectangle(detected_img,(x1,y1),(x2,y2),color,3)

#     cv2.putText(
#         detected_img,
#         f"{display_class} ({confidence:.2f})",
#         (x1,y1-10),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.8,
#         color,
#         2
#     )

#     crop_display = best_crop.copy()

#     cv2.putText(
#         crop_display,
#         f"{class_name} - {status}",
#         (10,30),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         1,
#         color,
#         2
#     )

#     return original,detected_img,crop_display


# # ============================================
# # INPUT MODE
# # ============================================

# print("\nChoose Input Type:")
# print("1 - Image")
# print("2 - Video")
# print("3 - Webcam")

# choice=input("Enter choice (1/2/3): ")

# if choice in ["1","2"]:

#     root=tk.Tk()
#     root.withdraw()

#     path=filedialog.askopenfilename(title="Select File")

#     root.destroy()

#     if not path:
#         exit()


# if choice=="1":

#     img=cv2.imread(path)

#     orig,detected,crop=process_frame(img)

#     if crop is None:
#         exit()

#     combined=np.hstack([
#         cv2.resize(orig,(400,400)),
#         cv2.resize(detected,(400,400)),
#         cv2.resize(crop,(400,400))
#     ])

#     cv2.imshow("Detection Pipeline",combined)
#     cv2.waitKey(0)
#     cv2.destroyAllWindows()


# elif choice=="2":

#     cap=cv2.VideoCapture(path)

#     while True:

#         ret,frame=cap.read()

#         if not ret:
#             break

#         orig,detected,crop=process_frame(frame)

#         if crop is not None:

#             combined=np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Detection Pipeline",combined)

#         if cv2.waitKey(1)&0xFF==ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()


# elif choice=="3":

#     cap=cv2.VideoCapture(0)

#     while True:

#         ret,frame=cap.read()

#         if not ret:
#             break

#         orig,detected,crop=process_frame(frame)

#         if crop is not None:

#             combined=np.hstack([
#                 cv2.resize(orig,(300,300)),
#                 cv2.resize(detected,(300,300)),
#                 cv2.resize(crop,(300,300))
#             ])

#             cv2.imshow("Live Detection",combined)

#         if cv2.waitKey(1)&0xFF==ord('q'):
#             break

#     cap.release()
#     cv2.destroyAllWindows()




#add video detection yolov8s part ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


import cv2
import json
import numpy as np
from ultralytics import YOLO
import tkinter as tk
from tkinter import filedialog
from collections import deque, Counter

from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

# ============================================
# CONFIG
# ============================================

IMG_SIZE = 224
MARGIN_RATIO = 0.15

NORMAL_THRESHOLD = 0.75
DAMAGED_THRESHOLD = 0.40
BLUR_THRESHOLD = 100

# ============================================
# TEMPORAL FRAME VOTING CONFIG
# ============================================

FRAME_BUFFER = 10
MIN_VOTES = 7

prediction_buffer = deque(maxlen=FRAME_BUFFER)
stable_prediction = None

YOLO_DETECT_PATH = WEIGHT_DIR / "Detect_Model/RoadSignDetector_v22/weights/best.pt"

MOBILENET_PATH = WEIGHT_DIR / "mobilenet_weights/Mobilenetv2_Retrain_weight/phase2_epoch_015.weights.h5"

CUSTOM_MODEL_PATH = WEIGHT_DIR / "Custom_model2_weights/epoch_026.weights.h5"

YOLO_CLASSIFIER_PATH = WEIGHT_DIR / "YOLO8/YOLOv8_Classifier/weights/best.pt"

CLASS_MAPPING_PATH = WEIGHT_DIR / "Custom_model2_weights/class_mapping.json"

YOLO_VIDEO_PATH = WEIGHT_DIR / "Video_weight/yolov8s.pt"
# ============================================
# LOAD YOLO DETECTION
# ============================================

detector = YOLO(YOLO_DETECT_PATH)
print("✅ YOLO Detection Model Loaded")

video_detector = YOLO(YOLO_VIDEO_PATH)
print("✅ YOLOv8s Video Detector Loaded")
# ============================================
# LOAD CLASS MAPPING
# ============================================

with open(CLASS_MAPPING_PATH, "r") as f:
    class_indices = json.load(f)

index_to_class = {v: k for k, v in class_indices.items()}
NUM_CLASSES = len(class_indices)


# ============================================
# MOBILENET MODEL
# ============================================

def build_mobilenet():

    base_model = keras.applications.MobileNetV2(
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        include_top=False,
        weights=None
    )

    x = base_model.output
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dense(256, activation='relu')(x)
    x = layers.Dropout(0.5)(x)

    outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

    return keras.Model(inputs=base_model.input, outputs=outputs)


mobilenet_model = build_mobilenet()
mobilenet_model.load_weights(MOBILENET_PATH)

print("✅ MobileNetV2 Loaded")


# ============================================
# CUSTOM MODEL ARCHITECTURE
# ============================================

def conv_block(x, filters, stride=1):

    shortcut = x

    x = layers.Conv2D(filters,(3,3),strides=stride,padding='same',use_bias=False)(x)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)

    x = layers.Conv2D(filters,(3,3),padding='same',use_bias=False)(x)
    x = layers.BatchNormalization()(x)

    if stride != 1 or shortcut.shape[-1] != filters:
        shortcut = layers.Conv2D(filters,(1,1),strides=stride,padding='same',use_bias=False)(shortcut)
        shortcut = layers.BatchNormalization()(shortcut)

    x = layers.Add()([x,shortcut])
    x = layers.ReLU()(x)

    return x


def depthwise_block(x, filters, stride=1):

    shortcut = x

    x = layers.DepthwiseConv2D((3,3),strides=stride,padding='same',use_bias=False)(x)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)

    x = layers.Conv2D(filters,(1,1),padding='same',use_bias=False)(x)
    x = layers.BatchNormalization()(x)

    if stride == 1 and shortcut.shape[-1] == filters:
        x = layers.Add()([x,shortcut])

    x = layers.ReLU()(x)

    return x


def build_custom():

    inputs = keras.Input(shape=(224,224,3))

    x = layers.Conv2D(32,(3,3),strides=2,padding='same',use_bias=False)(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)

    x = conv_block(x,64)
    x = conv_block(x,64)

    x = conv_block(x,128,stride=2)
    x = conv_block(x,128)

    x = depthwise_block(x,256,stride=2)
    x = depthwise_block(x,256)

    x = depthwise_block(x,512,stride=2)
    x = depthwise_block(x,512)

    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.6)(x)

    x = layers.Dense(512,activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.5)(x)

    outputs = layers.Dense(NUM_CLASSES,activation='softmax')(x)

    return keras.Model(inputs,outputs)


custom_model = build_custom()
custom_model.load_weights(CUSTOM_MODEL_PATH)

print("✅ Custom Model Loaded")


# ============================================
# YOLOv8 CLASSIFIER
# ============================================

yolo_classifier = YOLO(YOLO_CLASSIFIER_PATH)

print("✅ YOLOv8 Classifier Loaded")


# ============================================
# IMAGE QUALITY FUNCTIONS
# ============================================

def blur_score(image):

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def sharpen_image(image):

    gaussian = cv2.GaussianBlur(image,(9,9),10)
    return cv2.addWeighted(image,1.5,gaussian,-0.5,0)


def apply_clahe(image):

    lab = cv2.cvtColor(image,cv2.COLOR_BGR2LAB)

    l,a,b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8))

    cl = clahe.apply(l)

    merged = cv2.merge((cl,a,b))

    return cv2.cvtColor(merged,cv2.COLOR_LAB2BGR)


# ============================================
# MODEL PREDICTIONS
# ============================================

def mobilenet_predict(crop):

    img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
    img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
    img = preprocess_input(img)

    img = np.expand_dims(img,axis=0)

    pred = mobilenet_model.predict(img,verbose=0)[0]

    return pred


def custom_predict(crop):

    img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))
    img = cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
    img = img.astype("float32")/255.0

    img = np.expand_dims(img,axis=0)

    pred = custom_model.predict(img,verbose=0)[0]

    return pred


def yolo_predict(crop):

    img = cv2.resize(crop,(IMG_SIZE,IMG_SIZE))

    results = yolo_classifier.predict(img,verbose=False)

    probs = results[0].probs.data.cpu().numpy()

    return probs


# ============================================
# ENSEMBLE
# ============================================

def evaluate_image_version(img,name):

    pred_m = mobilenet_predict(img)
    pred_c = custom_predict(img)
    pred_y = yolo_predict(img)

    class_m = index_to_class[np.argmax(pred_m)]
    conf_m = float(np.max(pred_m))

    class_c = index_to_class[np.argmax(pred_c)]
    conf_c = float(np.max(pred_c))

    class_y = index_to_class[np.argmax(pred_y)]
    conf_y = float(np.max(pred_y))

    ensemble = (pred_m + pred_c + pred_y) / 3

    class_e = index_to_class[np.argmax(ensemble)]
    conf_e = float(np.max(ensemble))

    print(f"\n---- {name} ----")
    print(f"MobileNetV2 : {class_m} | {conf_m:.4f}")
    print(f"CustomModel2: {class_c} | {conf_c:.4f}")
    print(f"YOLOv8      : {class_y} | {conf_y:.4f}")
    print(f"Ensemble    : {class_e} | {conf_e:.4f}")

    return class_e, conf_e


# ============================================
# TEMPORAL FRAME VOTING
# ============================================

def temporal_voting(predicted_class):

    global stable_prediction

    prediction_buffer.append(predicted_class)

    # If buffer not full yet
    if len(prediction_buffer) < FRAME_BUFFER:
        print("[TEMPORAL] Buffer not full yet...")
        return None

    counts = Counter(prediction_buffer)

    best_class, votes = counts.most_common(1)[0]

    print("\n[TEMPORAL VOTING]")
    print("Buffer:", list(prediction_buffer))
    print("Votes :", counts)

    if votes >= MIN_VOTES:
        stable_prediction = best_class
        print(f"[CONFIRMED SIGN] {best_class}")
        return best_class

    return None

# ============================================
# PROCESS FRAME
# ============================================

def process_frame(frame):

    original = frame.copy()

    results = detector(frame,conf=0.25)
    boxes = results[0].boxes

    if len(boxes)==0:
        return original,original,None

    best_box = max(boxes,key=lambda b:float(b.conf[0]))

    x1,y1,x2,y2 = best_box.xyxy[0].cpu().numpy().astype(int)

    crop = frame[y1:y2,x1:x2]

    print("\n----------------------------------")

    blur_value = blur_score(crop)

    print(f"[INFO] Blur Score: {blur_value:.2f}")

    results_list = []

    class_o,conf_o = evaluate_image_version(crop,"Original")
    results_list.append(("Original",crop,class_o,conf_o))

    sharpened = sharpen_image(crop)
    class_s,conf_s = evaluate_image_version(sharpened,"Sharpen")
    results_list.append(("Sharpen",sharpened,class_s,conf_s))

    clahe_img = apply_clahe(crop)
    class_c,conf_c = evaluate_image_version(clahe_img,"CLAHE")
    results_list.append(("CLAHE",clahe_img,class_c,conf_c))

    best = max(results_list,key=lambda x:x[3])

    version,best_crop,class_name,confidence = best

    # ============================================
    # APPLY TEMPORAL FRAME VOTING
    # ============================================

    confirmed_class = temporal_voting(class_name)

    if confirmed_class is not None:
        display_class = confirmed_class
    else:
        display_class = "Detecting..."

    print(f"\n[SELECTED VERSION] {version}")

    if confidence >= NORMAL_THRESHOLD:
        status="Normal"
    elif confidence < DAMAGED_THRESHOLD:
        status="Damaged"
    else:
        status="Possibly unclear"

    print("\n[FINAL RESULT]")
    print(f"Class      : {class_name}")
    print(f"Confidence : {confidence:.4f}")
    print(f"Status     : {status}")
    print("----------------------------------")

    color = (0,255,0) if status=="Normal" else (0,0,255)

    detected_img = original.copy()

    cv2.rectangle(detected_img,(x1,y1),(x2,y2),color,3)

    cv2.putText(
        detected_img,
        f"{display_class} ({confidence:.2f})",
        (x1,y1-10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        color,
        2
    )

    crop_display = best_crop.copy()

    cv2.putText(
        crop_display,
        f"{class_name} - {status}",
        (10,30),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        color,
        2
    )

    return original,detected_img,crop_display


# ============================================
# INPUT MODE
# ============================================

print("\nChoose Input Type:")
print("1 - Image")
print("2 - Video")
print("3 - Webcam")

choice=input("Enter choice (1/2/3): ")

if choice in ["1","2"]:

    root=tk.Tk()
    root.withdraw()

    path=filedialog.askopenfilename(title="Select File")

    root.destroy()

    if not path:
        exit()


if choice=="1":

    img=cv2.imread(path)

    orig,detected,crop=process_frame(img)

    if crop is None:
        exit()

    combined=np.hstack([
        cv2.resize(orig,(400,400)),
        cv2.resize(detected,(400,400)),
        cv2.resize(crop,(400,400))
    ])

    cv2.imshow("Detection Pipeline",combined)
    cv2.waitKey(0)
    cv2.destroyAllWindows()


elif choice=="2":

    cap=cv2.VideoCapture(path)

    while True:

        ret,frame=cap.read()

        if not ret:
            break

        # ==========================================
        # YOLOv8s PRETRAINED DETECTION
        # ==========================================

        results = video_detector(frame,conf=0.25)

        boxes = results[0].boxes

        crop=None
        detected_img=frame.copy()
        orig=frame.copy()

        if len(boxes)>0:

            for box in boxes:

                class_id=int(box.cls[0])
                class_name=video_detector.names[class_id]

                # detect only STOP SIGN
                if class_name=="stop sign":

                    x1,y1,x2,y2 = box.xyxy[0].cpu().numpy().astype(int)

                    crop = frame[y1:y2,x1:x2]

                    # send crop to your NORMAL PIPELINE
                    orig2,detected2,crop2 = process_frame(frame)

                    if crop2 is not None:

                        combined=np.hstack([
                            cv2.resize(orig2,(300,300)),
                            cv2.resize(detected2,(300,300)),
                            cv2.resize(crop2,(300,300))
                        ])

                        cv2.imshow("Detection Pipeline",combined)

                    break

        if cv2.waitKey(1)&0xFF==ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


elif choice=="3":

    cap=cv2.VideoCapture(0)

    while True:

        ret,frame=cap.read()

        if not ret:
            break

        orig,detected,crop=process_frame(frame)

        if crop is not None:

            combined=np.hstack([
                cv2.resize(orig,(300,300)),
                cv2.resize(detected,(300,300)),
                cv2.resize(crop,(300,300))
            ])

            cv2.imshow("Live Detection",combined)

        if cv2.waitKey(1)&0xFF==ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()