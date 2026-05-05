import os
import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.optimizers import Adam
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.callbacks import ModelCheckpoint, CSVLogger, ReduceLROnPlateau, EarlyStopping

# ============================================
# CONFIG
# ============================================

EPOCHS = 30
BATCH_SIZE = 32
LR = 0.001

WEIGHT_DIR = "distance_model_weights"
os.makedirs(WEIGHT_DIR, exist_ok=True)

TRAIN_CSV = "data/train.csv"
TEST_CSV = "data/test.csv"

# ============================================
# LOAD DATA
# ============================================

df_train = pd.read_csv(TRAIN_CSV)
df_test = pd.read_csv(TEST_CSV)

X_train = df_train[['xmin', 'ymin', 'xmax', 'ymax']].values
y_train = df_train[['zloc']].values

X_test = df_test[['xmin', 'ymin', 'xmax', 'ymax']].values
y_test = df_test[['zloc']].values

# ============================================
# NORMALIZATION
# ============================================

x_scaler = StandardScaler()
y_scaler = StandardScaler()

X_train = x_scaler.fit_transform(X_train)
X_test = x_scaler.transform(X_test)

y_train = y_scaler.fit_transform(y_train)
y_test = y_scaler.transform(y_test)

# Save scalers (IMPORTANT for inference)
import joblib
joblib.dump(x_scaler, os.path.join(WEIGHT_DIR, "x_scaler.pkl"))
joblib.dump(y_scaler, os.path.join(WEIGHT_DIR, "y_scaler.pkl"))

# ============================================
# MODEL ARCHITECTURE
# ============================================

def build_model():
    inputs = keras.Input(shape=(4,))

    x = layers.Dense(6, activation='relu')(inputs)
    x = layers.Dense(5, activation='relu')(x)
    x = layers.Dense(2, activation='relu')(x)

    outputs = layers.Dense(1, activation='linear')(x)

    model = keras.Model(inputs, outputs)
    return model

model = build_model()

# ============================================
# COMPILE
# ============================================

model.compile(
    optimizer=Adam(learning_rate=LR),
    loss='mse',
    metrics=['mae']
)

model.summary()

# ============================================
# CALLBACKS
# ============================================

checkpoint_callback = ModelCheckpoint(
    os.path.join(WEIGHT_DIR, "best.weights.h5"),
    monitor='val_loss',
    save_best_only=True,
    save_weights_only=True,
    verbose=1
)

csv_logger = CSVLogger(
    os.path.join(WEIGHT_DIR, "training_log.csv")
)

reduce_lr = ReduceLROnPlateau(
    monitor='val_loss',
    factor=0.3,
    patience=5,
    verbose=1
)

early_stop = EarlyStopping(
    monitor='val_loss',
    patience=10,
    restore_best_weights=True,
    verbose=1
)

# ============================================
# TRAIN
# ============================================

history = model.fit(
    X_train,
    y_train,
    validation_split=0.1,
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    callbacks=[
        checkpoint_callback,
        csv_logger,
        reduce_lr,
        early_stop
    ],
    verbose=1
)

# ============================================
# EVALUATE
# ============================================

loss, mae = model.evaluate(X_test, y_test)
print(f"\nTest Loss: {loss:.4f}")
print(f"Test MAE: {mae:.4f}")

# ============================================
# SAVE MODEL
# ============================================

model.save(os.path.join(WEIGHT_DIR, "distance_model.keras"))

