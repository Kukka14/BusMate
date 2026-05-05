import os
import glob
import json
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import ModelCheckpoint, CSVLogger, ReduceLROnPlateau, EarlyStopping
from tqdm.keras import TqdmCallback

# ============================================
# CONFIG
# ============================================
IMG_HEIGHT = 224
IMG_WIDTH = 224
CHANNELS = 3
NUM_CLASSES = 68
EPOCHS = 30
BATCH_SIZE = 32
LR = 0.001

WEIGHT_DIR = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Weight\Custom_model2_weights"
os.makedirs(WEIGHT_DIR, exist_ok=True)

TRAIN_DIR = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Dataset\Resized\Train"
VALID_DIR = r"D:\NETHMYY\BusMate\BusMate\backend\Road_sign_detection\Dataset\Resized\Valid"
# ============================================
# MODEL ARCHITECTURE (Hybrid ResNet + Depthwise)
# ============================================

def conv_block(x, filters, stride=1):
    shortcut = x

    x = layers.Conv2D(filters, (3,3), strides=stride, padding='same', use_bias=False)(x)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)

    x = layers.Conv2D(filters, (3,3), padding='same', use_bias=False)(x)
    x = layers.BatchNormalization()(x)

    if stride != 1 or shortcut.shape[-1] != filters:
        shortcut = layers.Conv2D(filters, (1,1), strides=stride, padding='same', use_bias=False)(shortcut)
        shortcut = layers.BatchNormalization()(shortcut)

    x = layers.Add()([x, shortcut])
    x = layers.ReLU()(x)

    return x


def depthwise_block(x, filters, stride=1):
    shortcut = x

    x = layers.DepthwiseConv2D((3,3), strides=stride, padding='same', use_bias=False)(x)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)

    x = layers.Conv2D(filters, (1,1), padding='same', use_bias=False)(x)
    x = layers.BatchNormalization()(x)

    if stride == 1 and shortcut.shape[-1] == filters:
        x = layers.Add()([x, shortcut])

    x = layers.ReLU()(x)
    return x


def build_model():
    inputs = keras.Input(shape=(IMG_HEIGHT, IMG_WIDTH, CHANNELS))

    # Stem
    x = layers.Conv2D(32, (3,3), strides=2, padding='same', use_bias=False)(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.ReLU()(x)

    # Stage 1
    x = conv_block(x, 64, stride=1)
    x = conv_block(x, 64, stride=1)

    # Stage 2
    x = conv_block(x, 128, stride=2)
    x = conv_block(x, 128, stride=1)

    # Stage 3
    x = depthwise_block(x, 256, stride=2)
    x = depthwise_block(x, 256, stride=1)

    # Stage 4
    x = depthwise_block(x, 512, stride=2)
    x = depthwise_block(x, 512, stride=1)

    # Head
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.6)(x)

    x = layers.Dense(512, activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.5)(x)

    outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

    model = keras.Model(inputs, outputs)
    return model


model = build_model()

# ============================================
# OPTIMIZER
# ============================================

opt = Adam(learning_rate=LR)

model.compile(
    loss=keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
    optimizer=opt,
    metrics=['accuracy']
)

model.summary()

# ============================================
# DATA AUGMENTATION
# ============================================

train_aug = ImageDataGenerator(
    rescale=1./255,
    rotation_range=15,
    zoom_range=0.2,
    width_shift_range=0.15,
    height_shift_range=0.15,
    shear_range=0.15,
    horizontal_flip=True,
    fill_mode="nearest"
)

valid_aug = ImageDataGenerator(rescale=1./255)

train_gen = train_aug.flow_from_directory(
    TRAIN_DIR,
    target_size=(IMG_HEIGHT, IMG_WIDTH),
    batch_size=BATCH_SIZE,
    class_mode='categorical'
)

# Save class mapping
print("\n==============================")
print("Class Indices Mapping:")
print(train_gen.class_indices)
print("==============================\n")

with open(os.path.join(WEIGHT_DIR, "class_mapping.json"), "w") as f:
    json.dump(train_gen.class_indices, f)

valid_gen = valid_aug.flow_from_directory(
    VALID_DIR,
    target_size=(IMG_HEIGHT, IMG_WIDTH),
    batch_size=BATCH_SIZE,
    class_mode='categorical'
)

# ============================================
# RESUME TRAINING
# ============================================

def find_latest_checkpoint():
    checkpoints = glob.glob(os.path.join(WEIGHT_DIR, "epoch_*.weights.h5"))
    if not checkpoints:
        return None, 0

    latest = max(checkpoints, key=os.path.getctime)
    epoch_number = int(os.path.basename(latest).split("_")[1].split(".")[0])
    return latest, epoch_number

checkpoint_path, start_epoch = find_latest_checkpoint()

if checkpoint_path:
    print(f"🔁 Resuming from {checkpoint_path}")
    model.load_weights(checkpoint_path)
else:
    print("🆕 Starting fresh training")
    start_epoch = 0

# ============================================
# CALLBACKS
# ============================================

checkpoint_callback = ModelCheckpoint(
    os.path.join(WEIGHT_DIR, "epoch_{epoch:03d}.weights.h5"),
    save_weights_only=True,
    save_freq='epoch'
)

csv_logger = CSVLogger(
    os.path.join(WEIGHT_DIR, "training_log.csv"),
    append=True
)

reduce_lr = ReduceLROnPlateau(
    monitor='val_loss',
    factor=0.3,
    patience=4,
    verbose=1
)

early_stop = EarlyStopping(
    monitor='val_loss',
    patience=8,
    restore_best_weights=True,
    verbose=1
)

# ============================================
# TRAIN
# ============================================

history = model.fit(
    train_gen,
    validation_data=valid_gen,
    epochs=EPOCHS,
    initial_epoch=start_epoch,
    callbacks=[
        checkpoint_callback,
        csv_logger,
        reduce_lr,
        early_stop,
        TqdmCallback(verbose=1)
    ]
)

print("✅ Custom Model 2 Training Completed")