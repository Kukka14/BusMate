import os
import json
import glob
import re
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import ModelCheckpoint, ReduceLROnPlateau, EarlyStopping

# ==================================
# CONFIG
# ==================================
IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS_PHASE1 = 15
EPOCHS_PHASE2 = 15

TRAIN_DIR = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Dataset\Resized\Train"
VALID_DIR = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Dataset\Resized\Valid"

WEIGHT_DIR = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Weight\mobilenet_weights"
os.makedirs(WEIGHT_DIR, exist_ok=True)

# ==================================
# DATA GENERATORS
# ==================================
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

train_aug = ImageDataGenerator(
    preprocessing_function=preprocess_input,
    rotation_range=10,
    zoom_range=0.15,
    width_shift_range=0.1,
    height_shift_range=0.1,
    shear_range=0.15,
    brightness_range=(0.7, 1.3)
)

valid_aug = ImageDataGenerator(
    preprocessing_function=preprocess_input
)

train_gen = train_aug.flow_from_directory(
    TRAIN_DIR,
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical'
)

valid_gen = valid_aug.flow_from_directory(
    VALID_DIR,
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical'
)

# ✅ AUTO DETECT CLASS COUNT
NUM_CLASSES = train_gen.num_classes
print("Detected classes:", NUM_CLASSES)

# Save class mapping
with open(os.path.join(WEIGHT_DIR, "class_mapping.json"), "w") as f:
    json.dump(train_gen.class_indices, f)

# ==================================
# BUILD MODEL FUNCTION
# ==================================
def build_model():
    base_model = keras.applications.MobileNetV2(
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        include_top=False,
        weights='imagenet'
    )

    x = base_model.output
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dense(256, activation='relu')(x)
    x = layers.Dropout(0.5)(x)
    outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

    model = keras.Model(inputs=base_model.input, outputs=outputs)

    return model, base_model

# ==================================
# FIND LATEST CHECKPOINT
# ==================================
def find_latest_checkpoint(prefix):
    pattern = os.path.join(WEIGHT_DIR, f"{prefix}_epoch_*.weights.h5")
    files = glob.glob(pattern)

    if not files:
        return None, 0

    latest = max(files, key=os.path.getctime)

    match = re.search(r"epoch_(\d+)", latest)
    epoch_number = int(match.group(1)) if match else 0

    return latest, epoch_number

# ==================================
# PHASE 1
# ==================================
print("\n🚀 PHASE 1 TRAINING")

model, base_model = build_model()
base_model.trainable = False

model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=0.001),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

checkpoint_path, start_epoch = find_latest_checkpoint("phase1")

if checkpoint_path:
    print(f"🔁 Resuming Phase 1 from {checkpoint_path}")
    model.load_weights(checkpoint_path)
else:
    print("🆕 Starting Phase 1 from scratch")
    start_epoch = 0

checkpoint_callback = ModelCheckpoint(
    os.path.join(WEIGHT_DIR, "phase1_epoch_{epoch:03d}.weights.h5"),
    save_weights_only=True,
    save_freq='epoch'
)

reduce_lr = ReduceLROnPlateau(
    monitor='val_loss',
    factor=0.3,
    patience=3,
    verbose=1
)

early_stop = EarlyStopping(
    monitor='val_loss',
    patience=5,
    restore_best_weights=True
)

model.fit(
    train_gen,
    validation_data=valid_gen,
    epochs=EPOCHS_PHASE1,
    initial_epoch=start_epoch,
    callbacks=[checkpoint_callback, reduce_lr, early_stop]
)

print("\n✅ Phase 1 Completed")

# ==================================
# PHASE 2 (Fine-Tuning)
# ==================================
print("\n🔥 PHASE 2 FINE-TUNING")

base_model.trainable = True

for layer in base_model.layers[:100]:
    layer.trainable = False

model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=0.0001),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

checkpoint_path2, start_epoch2 = find_latest_checkpoint("phase2")

if checkpoint_path2:
    print(f"🔁 Resuming Phase 2 from {checkpoint_path2}")
    model.load_weights(checkpoint_path2)
else:
    print("🆕 Starting Phase 2 from scratch")
    start_epoch2 = 0

checkpoint_callback2 = ModelCheckpoint(
    os.path.join(WEIGHT_DIR, "phase2_epoch_{epoch:03d}.weights.h5"),
    save_weights_only=True,
    save_freq='epoch'
)

model.fit(
    train_gen,
    validation_data=valid_gen,
    epochs=EPOCHS_PHASE2,
    initial_epoch=start_epoch2,
    callbacks=[checkpoint_callback2, reduce_lr, early_stop]
)

print("\n🎉 MobileNetV2 Training Fully Completed!")