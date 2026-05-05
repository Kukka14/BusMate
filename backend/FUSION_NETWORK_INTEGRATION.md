# Neural Fusion Network Integration Guide

## 1. Purpose

This document explains how to add the trained Neural Fusion Network into the existing road hazard scoring project.

The Fusion Neural Network combines:

- Scene-based risk features from the scene analysis model
- Map-based risk features from SRTM and OSM analysis
- Route or GPS context features

The final output is:

- `FinalRiskScore`
- `RiskLevel`
- Optional confidence or probability values, depending on the model output

---

## 2. Saved Model Files

The trained model files are saved in Google Drive under:

```text
My Drive / Research / Hazard New
```

Required files:

| File name | Purpose |
|---|---|
| `hazard_fusion_model_best.pth` | Best trained PyTorch Fusion Neural Network model weights |
| `scaler.pkl` | StandardScaler or preprocessing scaler used during training |
| `feature_cols.json` | Exact feature column order used during training |
| `label_encoder.pkl` | Encoder used to convert model output labels into readable risk classes |
| `training_meta.json` | Training metadata such as model settings, scores, label names, and feature count |
| `DataSet` | Dataset used to train the fusion model |

Important: the feature order must match `feature_cols.json`. If the input order changes, the prediction can be wrong even if the model loads correctly.

---

## 3. Recommended Project Folder Structure

Add a new folder inside the backend for the fusion model.

```text
Project-Integration/
│
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   │
│   ├── models/
│   │   └── fusion/
│   │       ├── hazard_fusion_model_best.pth
│   │       ├── scaler.pkl
│   │       ├── feature_cols.json
│   │       ├── label_encoder.pkl
│   │       └── training_meta.json
│   │
│   ├── services/
│   │   ├── scene_risk_service.py
│   │   ├── map_risk_service.py
│   │   └── fusion_risk_service.py
│   │
│   └── routes/
│       └── fusion_routes.py
│
└── frontend/
    └── React Vite dashboard
```

---

## 4. Copy Model Files from Google Drive

From Google Drive, download these files:

```text
scaler.pkl
hazard_fusion_model_best.pth
feature_cols.json
training_meta.json
label_encoder.pkl
```

Place them inside:

```text
backend/models/fusion/
```

---

## 5. Install Required Backend Packages

In the backend virtual environment, install the required packages.

```powershell
pip install torch numpy pandas scikit-learn joblib flask flask-cors
```

If these are already installed, no need to reinstall.

Update `requirements.txt`:

```text
torch
numpy
pandas
scikit-learn
joblib
flask
flask-cors
```

---

## 6. Fusion Neural Network Loading Service

Create this file:

```text
backend/services/fusion_risk_service.py
```

Use this structure and adjust the neural network layers only if your training code used a different architecture.

```python
import json
import joblib
import torch
import torch.nn as nn
import numpy as np
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = BASE_DIR / "models" / "fusion"

MODEL_PATH = MODEL_DIR / "hazard_fusion_model_best.pth"
SCALER_PATH = MODEL_DIR / "scaler.pkl"
FEATURE_COLS_PATH = MODEL_DIR / "feature_cols.json"
LABEL_ENCODER_PATH = MODEL_DIR / "label_encoder.pkl"
TRAINING_META_PATH = MODEL_DIR / "training_meta.json"


class HazardFusionNN(nn.Module):
    def __init__(self, input_dim, output_dim):
        super(HazardFusionNN, self).__init__()

        self.network = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.20),

            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.20),

            nn.Linear(32, output_dim)
        )

    def forward(self, x):
        return self.network(x)


class FusionRiskService:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        with open(FEATURE_COLS_PATH, "r") as f:
            self.feature_cols = json.load(f)

        with open(TRAINING_META_PATH, "r") as f:
            self.training_meta = json.load(f)

        self.scaler = joblib.load(SCALER_PATH)
        self.label_encoder = joblib.load(LABEL_ENCODER_PATH)

        input_dim = len(self.feature_cols)
        output_dim = len(self.label_encoder.classes_)

        self.model = HazardFusionNN(input_dim=input_dim, output_dim=output_dim)
        self.model.load_state_dict(torch.load(MODEL_PATH, map_location=self.device))
        self.model.to(self.device)
        self.model.eval()

    def prepare_features(self, input_data):
        missing_features = []

        feature_values = []
        for col in self.feature_cols:
            if col not in input_data:
                missing_features.append(col)
                feature_values.append(0)
            else:
                feature_values.append(input_data[col])

        feature_array = np.array(feature_values, dtype=np.float32).reshape(1, -1)
        scaled_features = self.scaler.transform(feature_array)

        return scaled_features, missing_features

    def predict(self, input_data):
        scaled_features, missing_features = self.prepare_features(input_data)

        tensor_input = torch.tensor(scaled_features, dtype=torch.float32).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor_input)
            probabilities = torch.softmax(logits, dim=1)
            predicted_index = torch.argmax(probabilities, dim=1).item()
            confidence = probabilities[0][predicted_index].item()

        risk_level = self.label_encoder.inverse_transform([predicted_index])[0]

        return {
            "FinalRiskScore": float(confidence),
            "RiskLevel": str(risk_level),
            "Confidence": round(float(confidence), 4),
            "MissingFeaturesFilledWithZero": missing_features
        }


fusion_risk_service = FusionRiskService()
```

Important: the `HazardFusionNN` architecture must match the architecture used during training. If your training model used different hidden layers, dropout, batch normalization, or activation functions, copy the same class from your Colab training code.

---

## 7. API Route for Fusion Prediction

Create this file:

```text
backend/routes/fusion_routes.py
```

```python
from flask import Blueprint, request, jsonify
from services.fusion_risk_service import fusion_risk_service

fusion_bp = Blueprint("fusion", __name__)


@fusion_bp.route("/api/fusion/predict", methods=["POST"])
def predict_fusion_risk():
    try:
        input_data = request.get_json()

        if not input_data:
            return jsonify({
                "error": "No input data received"
            }), 400

        result = fusion_risk_service.predict(input_data)

        return jsonify({
            "success": True,
            "result": result
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
```

---

## 8. Register the Route in Flask

In `backend/app.py`, import and register the route.

```python
from flask import Flask
from flask_cors import CORS
from routes.fusion_routes import fusion_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(fusion_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
```

If your project already has an `app.py`, add only the import and blueprint registration.

---

## 9. Expected Input Format

The frontend or backend pipeline must send JSON data using the same feature names found in `feature_cols.json`.

Example:

```json
{
  "SceneRiskScore": 0.72,
  "MapRiskScore": 0.64,
  "slope": 8.5,
  "curvature": 0.31,
  "intersection_density": 0.20,
  "speed_limit": 50,
  "bridge_present": 0,
  "tunnel_present": 0,
  "vru_presence": 1,
  "road_type_encoded": 2
}
```

The actual required fields must be taken from:

```text
feature_cols.json
```

Do not guess the feature names. Always use the exact names from the JSON file.

---

## 10. Full System Flow

```text
Camera / Road Scene Image
        ↓
Scene Analysis Model
        ↓
SceneRiskScore
        ↓
Route GPS + OSM + SRTM DEM
        ↓
Map Risk Analysis
        ↓
MapRiskScore
        ↓
Feature Combination
        ↓
Fusion Neural Network
        ↓
FinalRiskScore + RiskLevel
        ↓
Dashboard Output
```

---

## 11. How the Fusion Model Fits into the Project

The Fusion Neural Network should not replace the scene model or map risk model.

It should work as the final decision layer.

```text
Scene model = understands visible road scene risk
Map model = understands road geometry and surrounding map risk
Fusion model = learns how both risks should be combined
```

This is stronger than using a simple weighted formula because the neural network can learn non-linear relationships between scene and map features.

Example:

```text
A sharp bend alone may be medium risk.
Rainy road scene alone may be medium risk.
Sharp bend + rainy scene together may become high or critical risk.
```

The fusion network learns these combined patterns from the training dataset.

---

## 12. Frontend API Call Example

In React Vite, call the backend after scene and map scores are calculated.

```javascript
async function getFusionPrediction(featurePayload) {
  const response = await fetch("http://localhost:5000/api/fusion/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(featurePayload),
  });

  const data = await response.json();
  return data;
}
```

Example usage:

```javascript
const payload = {
  SceneRiskScore: sceneRiskScore,
  MapRiskScore: mapRiskScore,
  slope: slopeValue,
  curvature: curvatureValue,
  intersection_density: intersectionDensity,
  speed_limit: speedLimit,
};

const fusionResult = await getFusionPrediction(payload);

console.log(fusionResult.result.RiskLevel);
console.log(fusionResult.result.FinalRiskScore);
```

---

## 13. Dashboard Output Fields

Display these values in the dashboard:

| Output | Meaning |
|---|---|
| `SceneRiskScore` | Risk score from image or scene analysis |
| `MapRiskScore` | Risk score from map, slope, curvature, and OSM features |
| `FinalRiskScore` | Final fused risk confidence or score |
| `RiskLevel` | Final predicted risk category |
| `Confidence` | Model confidence for the predicted class |

Recommended UI labels:

```text
Scene Risk
Map Risk
Fusion Risk
Final Hazard Level
```

---

## 14. Testing with Postman or PowerShell

Run Flask backend:

```powershell
python app.py
```

Test prediction:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/fusion/predict" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{
    "SceneRiskScore": 0.72,
    "MapRiskScore": 0.64,
    "slope": 8.5,
    "curvature": 0.31,
    "intersection_density": 0.20,
    "speed_limit": 50
  }'
```

If the model returns missing feature warnings, add those missing fields to the payload.

---

## 15. Important Validation Checks

Before final integration, check these points:

1. `feature_cols.json` must contain the exact input feature names.
2. The frontend payload must send the same names.
3. The model architecture must match the Colab training architecture.
4. `scaler.pkl` must be the same scaler used during training.
5. `label_encoder.pkl` must be the same encoder used during training.
6. The model should be tested with sample records from the original dataset.
7. The backend should not retrain the model during runtime.
8. The model should only load once when the backend starts.

---

## 16. Common Errors and Fixes

### Error: size mismatch for model weights

Reason:

The neural network class in the backend does not match the model architecture used during training.

Fix:

Copy the exact model class from the Colab training notebook.

---

### Error: expected input dimension does not match

Reason:

The number of input features is different from the training feature count.

Fix:

Use the exact `feature_cols.json` file and send all required fields.

---

### Error: scaler expects different number of features

Reason:

Input feature count does not match the scaler training input.

Fix:

Check `feature_cols.json` and make sure the backend creates the feature array in the same order.

---

### Error: label encoder file not found

Reason:

The file path is wrong or the file is missing.

Fix:

Place `label_encoder.pkl` inside:

```text
backend/models/fusion/
```

---

## 17. Research Explanation for Report or Viva

The Fusion Neural Network is used as the final hazard prediction layer of the system. The scene analysis module extracts visual risk information from road scene data, while the map risk module extracts contextual risk indicators from SRTM terrain data and OSM road attributes. These two sources represent different views of road hazard conditions.

Instead of using only a manually weighted formula, the proposed approach trains a neural fusion model to learn the relationship between scene-based risk and map-based risk. This allows the system to capture non-linear risk interactions, such as cases where a moderate visual hazard and a moderate road geometry hazard together produce a high-risk condition.

The final output of the model is a fused road hazard level, which can be displayed on the real-time dashboard for driver assistance, route monitoring, and risk visualization.

---

## 18. Final Integration Checklist

| Task | Status |
|---|---|
| Download model files from Google Drive | Pending |
| Add files to `backend/models/fusion/` | Pending |
| Add `fusion_risk_service.py` | Pending |
| Add `fusion_routes.py` | Pending |
| Register route in `app.py` | Pending |
| Test with sample JSON input | Pending |
| Connect React dashboard to `/api/fusion/predict` | Pending |
| Display `FinalRiskScore` and `RiskLevel` | Pending |
| Test with real scene + map pipeline output | Pending |

---

## 19. Recommended Git Commit

After integration, commit the changes.

```powershell
git status
git add backend/models/fusion backend/services/fusion_risk_service.py backend/routes/fusion_routes.py backend/app.py backend/requirements.txt
git commit -m "Add neural fusion network integration"
git push origin dev
```

Do not commit very large datasets unless they are required for deployment.

