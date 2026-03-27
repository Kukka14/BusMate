import numpy as np
from tensorflow.keras.models import model_from_json, Sequential
from tensorflow.keras.layers import Dense, Input
from sklearn.preprocessing import StandardScaler
from pathlib import Path

# ==============================
# LOAD MODEL
# ==============================
MODEL_NAME = "model@1535477330"

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "Weight" / "Distance_Estimate_model"
MODEL_JSON = MODEL_DIR / f"{MODEL_NAME}.json"
MODEL_H5 = MODEL_DIR / f"{MODEL_NAME}.h5"

def build_fallback_model():
    """Fallback architecture for legacy model@1535477330 weights."""
    return Sequential([
        Input(shape=(4,)),
        Dense(6, activation="relu", name="dense_1"),
        Dense(5, activation="relu", name="dense_2"),
        Dense(2, activation="relu", name="dense_3"),
        Dense(1, activation="linear", name="dense_4"),
    ])


try:
    with open(MODEL_JSON, "r", encoding="utf-8") as f:
        model_json = f.read()

    model = model_from_json(
        model_json,
        custom_objects={
            "Sequential": Sequential,
            "Dense": Dense,
        },
    )
    model.load_weights(str(MODEL_H5))
except Exception as e:
    print(f"⚠ JSON model load failed, using fallback architecture: {e}")
    model = build_fallback_model()
    model.load_weights(str(MODEL_H5))

print("✅ Model loaded successfully\n")

# ==============================
# SCALER (TEMP FIX)
# ==============================
scaler_X = StandardScaler()
scaler_y = StandardScaler()

# Dummy fit (needed for transform)
scaler_X.fit([[0, 0, 0, 0], [1000, 1000, 1000, 1000]])
scaler_y.fit([[0], [100]])

# ==============================
# USER INPUT
# ==============================
print("Enter bounding box values:")

xmin = float(input("xmin: "))
ymin = float(input("ymin: "))
xmax = float(input("xmax: "))
ymax = float(input("ymax: "))

input_box = np.array([[xmin, ymin, xmax, ymax]])

# ==============================
# PREDICTION
# ==============================
input_scaled = scaler_X.transform(input_box).astype("float32")  # (1, 4)

# Some legacy exports expect 2D (None, 4), others 3D (None, None, 4)
input_rank = len(model.input_shape) if isinstance(model.input_shape, tuple) else 2
if input_rank == 3:
    model_input = input_scaled.reshape((1, 1, 4))  # (batch, steps, features)
else:
    model_input = input_scaled  # (batch, features)

pred_scaled = model.predict(model_input, verbose=0)

# Ensure shape is (n_samples, 1) for inverse_transform
pred_scaled_2d = np.array(pred_scaled, dtype="float32").reshape(-1, 1)
distance = scaler_y.inverse_transform(pred_scaled_2d)

# ==============================
# OUTPUT
# ==============================
print("\n📦 Bounding Box:", input_box)
print(f"📏 Predicted Distance: {distance[0][0]:.2f} meters")