# BusMate — Risk Analysis System: Complete Algorithm Reference

> **Covers:** Road Scene Analysis (RSA) · Hazard Analyser (HA / MapRisk) · Fusion Neural Network · Active Shift HUD · Road Scene Fusion Page

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Road Scene Analysis (RSA) — Scene Risk Score](#2-road-scene-analysis-rsa--scene-risk-score)
3. [Hazard Analyser (HA) — Map Risk Score](#3-hazard-analyser-ha--map-risk-score)
4. [Fusion Neural Network — Final Risk Score](#4-fusion-neural-network--final-risk-score)
5. [Active Shift HUD — Integration](#5-active-shift-hud--integration)
6. [Road Scene Fusion Page](#6-road-scene-fusion-page)
7. [API Endpoints Reference](#7-api-endpoints-reference)
8. [Data Flow Diagram](#8-data-flow-diagram)

---

## 1. System Overview

BusMate uses a **three-stage pipeline** to compute a final risk score for every moment of a bus journey.

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  Input 1: Road Camera   │     │  Input 2: Route Data     │
│  (live webcam frames)   │     │  (GPS + terrain + OSM)  │
└────────────┬────────────┘     └────────────┬────────────┘
             │  SceneRiskScore (0-100)        │  MapRiskScore (0-100)
             │  updated every 1500 ms         │  updated every 900 ms tick
             └──────────────┬─────────────────┘
                            ▼
              ┌─────────────────────────────┐
              │   Fusion Scoring Engine     │
              │   score = S×0.56 + M×0.44  │
              └─────────────┬───────────────┘
                            ▼
                  FinalRiskScore (0-100)
                  Level: Low / Medium / High / Critical
```

---

## 2. Road Scene Analysis (RSA) — Scene Risk Score

### 2.1 Model Architecture

| Property | Value |
|---|---|
| Model | SegFormer (B0 variant) |
| Architecture | `SegformerForSemanticSegmentation` |
| Number of Classes | **16** |
| Input Resolution | **512 × 512 pixels** |
| Encoder Hidden Sizes | `[64, 128, 320, 512]` |
| Encoder Depths | `[3, 4, 6, 3]` |
| Decoder Hidden Size | `768` |
| Attention Heads | `[1, 2, 5, 8]` |
| Model File | `backend/RSA&HA/RSA/model.safetensors` (~104 MB) |
| Framework | PyTorch + HuggingFace Transformers 4.40 |

### 2.2 Preprocessing Pipeline

```
Raw camera frame (BGR, any resolution)
        ↓
Convert BGR → RGB
        ↓
Resize to 512 × 512  (bilinear)
        ↓
Rescale pixels by 1/255  (factor = 0.00392156...)
        ↓
Normalize per-channel:
    mean = [0.485, 0.456, 0.406]   (ImageNet mean)
    std  = [0.229, 0.224, 0.225]   (ImageNet std)
        ↓
Feed to SegFormer encoder → decoder
        ↓
Output logits shape: (1, 16, H/4, W/4)
        ↓
Bilinear upsample → (1, 16, orig_H, orig_W)
        ↓
argmax over dim=1 → label_map (H, W)  [each pixel = class 0-15]
```

### 2.3 The 16 Segmentation Classes

| ID | Class Name | Hex Color | Hazard? |
|---|---|---|---|
| 0 | Road | `#804080` | No |
| 1 | Sidewalk | `#F423E8` | No |
| 2 | Curb | `#464646` | No |
| 3 | Lane Marking | `#669C9C` | No |
| 4 | Crosswalk | `#BE9999` | No |
| 5 | Barrier | `#999999` | No |
| 6 | Bridge | `#FAAA1E` | No |
| 7 | Tunnel | `#DCDC00` | No |
| 8 | Building | `#4682B4` | No |
| 9 | Vegetation / Terrain | `#6B8E23` | No |
| 10 | Traffic Control | `#FF0000` | No |
| 11 | Pole / Light | `#DC143C` | No |
| **12** | **Person** | `#0088FF` | **YES** |
| **13** | **Two-wheeler** | `#00C8FF` | **YES** |
| **14** | **Vehicle** | `#FF8000` | **YES** |
| **15** | **Pothole** | `#FF1414` | **YES** |

### 2.4 Hazard Score Formula

Only 4 of the 16 classes contribute to the **Scene Risk Score**. For each hazard class, the system measures what percentage of all pixels belong to that class (`pixel_pct`), then applies a **danger weight**.

```
hazard_score = min(100,
    person_pct     × 2.5   +
    twowheeler_pct × 2.0   +
    vehicle_pct    × 1.0   +
    pothole_pct    × 3.5
)
```

#### Why these weights?

| Class | Weight | Reason |
|---|---|---|
| Person | **2.5** | Pedestrians are highly vulnerable (VRU). Contact = fatality risk. |
| Two-wheeler | **2.0** | Motorcycles/cyclists are vulnerable and unpredictable. |
| Vehicle | **1.0** | Lowest weight — other vehicles are more predictable and protected. |
| Pothole | **3.5** | **Highest weight** — road damage has no self-avoidance capability; direct threat to tyres and stability. |

#### Score → Level Mapping

| Score Range | Level |
|---|---|
| 0 – 9.9 | **Low** |
| 10 – 34.9 | **Medium** |
| 35 – 100 | **High** |

### 2.5 Overlay Generation

```python
overlay = addWeighted(original_RGB, 0.5, color_mask_RGB, 0.5, gamma=0)
# 50% original image + 50% segmentation colour map
```

The overlay is JPEG-encoded at quality 85 and returned as a base64 `data:image/jpeg` string.

### 2.6 Update Frequency

- **Live Monitor / Active Shift HUD / Road Scene Fusion**: every **1500 ms**  
- **Video upload endpoint**: every frame

---

## 3. Hazard Analyser (HA) — Map Risk Score

The HA pipeline computes a risk value for each GPS point along a bus route using elevation data (SRTM), road geometry (OSRM routing), and OSM road metadata.

### 3.1 Data Sources

| Source | File | Description |
|---|---|---|
| DEM (elevation) | `backend/RSA&HA/HA/sri_lanka_srtm.tif` (92 MB) | SRTM 30 m resolution elevation grid for Sri Lanka |
| OSM road network | `backend/RSA&HA/HA/sri-lanka-260223.osm.pbf` (135 MB) | OpenStreetMap road graph, snapshot 2023-02-26 |
| Geocoding | Nominatim (online) | Converts location names → lat/lon |
| Routing | OSRM (local server) | Computes actual road-following path between two coordinates |

### 3.2 Full Pipeline Steps

```
1. Geocode start/end names → (lat, lon) pairs
         ↓
2. OSRM route → list of coordinate pairs following real roads
         ↓
3. Densify path to one point every 5 m
         ↓
4. Sample SRTM elevation at every point → elev[]
         ↓
5. Compute raw slope (rise/run × 100 = grade %)
         ↓
6. Smooth slope with 9-point moving average
         ↓
7. Classify terrain (Flat / Normal Steep Hill / Medium Steep Hill / High Steep Hill / Downhill variants)
         ↓
8. Compute curvature = |Δbearing| / distance  (smoothed with 7-point window)
         ↓
9. Fetch OSM features for 500 m buffer around route (road class, speed limit, intersections, bridge/tunnel)
         ↓
10. Compute per-point risk score
         ↓
11. Return path_data[] JSON
```

### 3.3 Terrain Risk Formula

```
slope_risk_input = clip(-smoothed_grade, 0, ∞)
    # Only downhill grades count as slope risk (negative grade = going downhill)

terrain_risk = 0.70 × (slope_val / 10.0)
             + 0.30 × (curv_val  /  1.0)
```

#### Weight breakdown:

| Component | Weight | Normalisation divisor | Reasoning |
|---|---|---|---|
| Slope (downhill grade %) | **0.70** | 10.0 | Downhill sections increase speed and reduce braking effectiveness — dominant risk |
| Curvature (°/m) | **0.30** | 1.0 | Sharp bends require speed reduction; secondary contributor |

### 3.4 Road Context Penalty

OSM road metadata adds an additional penalty on top of terrain risk:

```
risk = terrain_risk + context_penalty
```

#### Base penalty by road class:

| Highway Type | Base Penalty |
|---|---|
| motorway | 0.02 |
| trunk | 0.03 |
| primary | 0.05 |
| secondary | 0.08 |
| tertiary | 0.10 |
| residential | 0.12 |
| service | 0.14 |
| unclassified | 0.11 |
| track | 0.15 |
| path | 0.18 |
| unknown | 0.10 |

> **Why higher for smaller roads?** Local roads have no crash barriers, unpredictable pedestrian movement, and often poor surfacing.

#### Intersection penalty:
```
junction_penalty = min(near_intersections × 0.03, 0.15)
```
Each nearby intersection adds 0.03 risk (capped at 0.15) — intersections are high-collision zones.

#### Structure penalty:
```
structure_penalty = 0.05  if is_bridge or is_tunnel  else 0.0
```
Bridges and tunnels restrict evasive manoeuvres and increase crash severity.

#### Final context penalty:
```
context_penalty = base + junction_penalty + structure_penalty
```

### 3.5 Risk Classification

```
risk < 0.40  → "Low Risk"      (green)
risk < 0.70  → "Medium Risk"   (orange)
risk < 1.00  → "High Risk"     (red)
risk ≥ 1.00  → "Critical Risk" (darkred)
```

### 3.6 Converting to MapRiskScore (0–100)

The frontend converts the raw `risk` value (0–~1.5) to a 0–100 scale:

```javascript
mapScore = clamp(hzPoint.risk * 100, 0, 100)
```

### 3.7 Output Fields per Point

| Field | Type | Description |
|---|---|---|
| `lat`, `lon` | float | GPS coordinates |
| `risk` | float (0–1.5+) | Raw composite risk |
| `risk_label` | string | "Low Risk" / "Medium Risk" / "High Risk" / "Critical Risk" |
| `slope` | float (%) | Downhill grade at this point |
| `curvature` | float (°/m) | Angular sharpness of the curve |
| `distance` | float (m) | Cumulative distance from start |
| `terrain_feature` | string | "Flat", "High Steep Hill", "Medium Downhill", etc. |
| `road_name` | string | OSM road name |
| `road_class` | string | OSM highway type |
| `maxspeed` | string | Speed limit from OSM |
| `is_bridge` | bool | On a bridge |
| `is_tunnel` | bool | In a tunnel |
| `near_intersections` | int | Number of intersections within 50 m |
| `context_penalty` | float | OSM context addition to risk |
| `signed_grade` | float (%) | Grade with sign (+uphill / -downhill) |

### 3.8 Update Frequency

- Route is fetched **once** when start/end locations are set
- `mapScore` updates every **900 ms** as the animated marker advances along the route

---

## 4. Fusion Neural Network — Final Risk Score

### 4.1 Architecture

```
Input (9 features)
    ↓
Linear(9 → 64)
    ↓
ReLU
    ↓
Dropout
    ↓
Linear(64 → 32)
    ↓
ReLU
    ↓
Dropout
    ↓
Linear(32 → 4)
    ↓
Softmax → class probabilities [Critical, High, Low, Medium]
```

| Property | Value |
|---|---|
| Input dimensions | **9** |
| Hidden layers | 2 (64 units, 32 units) |
| Output classes | **4** (Critical, High, Low, Medium) |
| Activation | ReLU + Dropout |
| Best validation F1 | **0.644** |
| Best epoch estimate | ~8 |
| Target column | `HazardLabel` |
| Model file | `backend/hazard_fusion/artifacts/hazard_fusion_model_best.pth` |

### 4.2 The 9 Input Features

| # | Feature Name | Description | Source |
|---|---|---|---|
| 1 | `VRU` | Vulnerable Road User presence score | RSA Person + Two-wheeler pixel % |
| 2 | `SidewalkDef` | Sidewalk deficiency indicator | RSA Sidewalk pixel % |
| 3 | `GuidanceSupport` | Presence of guidance markings | RSA Lane Marking + Traffic Control % |
| 4 | `SurfaceDamage` | Road surface damage indicator | RSA Pothole pixel % |
| 5 | `TrafficConflict` | Traffic conflict likelihood | RSA Vehicle pixel % |
| 6 | `DowngradeSeverity` | Downhill grade severity | HA `slope` value |
| 7 | `CurveSeverity` | Curve sharpness | HA `curvature` value |
| 8 | `ComboSeverity` | Combined terrain + road class risk | HA `risk` score |
| 9 | `SpeedRisk` | Speed-related risk from road context | Derived from `maxspeed` + `road_class` |

### 4.3 Preprocessing

Before feeding to the neural network:
- Features are scaled with a **StandardScaler** (saved as `artifacts/scaler.pkl`)
- Labels are encoded with a **LabelEncoder** (saved as `artifacts/label_encoder.pkl`)

### 4.4 Output Classes

The model was trained on 4 classes (note the alphabetical ordering from sklearn):

| Index | Class | Meaning |
|---|---|---|
| 0 | Critical | Immediate danger — stop or reroute |
| 1 | High | Significant hazard — reduce speed, increase alertness |
| 2 | Low | Safe conditions |
| 3 | Medium | Moderate hazard — maintain caution |

### 4.5 Frontend Fallback Formula

Since the `.pth` model requires a running PyTorch inference server, the frontend uses a **linear fallback formula** whenever the backend `/api/fusion/predict` endpoint is unavailable:

```javascript
fusionScore = clamp(sceneScore × 0.56 + mapScore × 0.44, 0, 100)
```

#### Why 0.56 / 0.44 split?

| Input | Weight | Reasoning |
|---|---|---|
| SceneRiskScore | **0.56 (56%)** | Live camera data reflects real-time, immediate conditions in front of the bus — highest relevance |
| MapRiskScore | **0.44 (44%)** | Terrain/road geometry is predictive of risk but doesn't change second-to-second — slightly lower but still significant |

#### Score → Level (frontend):

```javascript
fusionScore >= 70  → "Critical"
fusionScore >= 40  → "High"
fusionScore >= 20  → "Medium"
fusionScore  < 20  → "Low"
```

---

## 5. Active Shift HUD — Integration

When the driver enters **Driving Mode**, the HUD shows a 3-column layout:

### 5.1 LEFT Column — Input Sources

| Card | Data Source | Update Rate |
|---|---|---|
| Driver Camera | Live webcam (Camera 1) + Socket.IO drowsiness | ~1 fps (socket) |
| Road Camera | Live webcam (Camera 2) | 1500 ms RSA loop |
| **Scene Analyse** | `rsResult.scene_latest.hazard.score` | **1500 ms** |
| **Map Risk** | `hzPoint.risk × 100` | **900 ms per tick** |

**Scene Analyse card** shows:
- Scene hazard level badge (Low / Medium / High)
- Scene score (0–100)
- Top 3 detected segment classes (label + colour swatch)

**Map Risk card** shows:
- Terrain risk score (0–100)
- Risk label (Low / Medium / High / Critical Risk)
- Current road name from OSM

### 5.2 CENTER Column — Map

- Leaflet map with route drawn as a coloured polyline (green→orange→red by risk)
- Animated bus marker advances every 900 ms
- `HazardDashPanel` overlay showing current point stats

### 5.3 RIGHT Column — Analysis Output

| Card | Description |
|---|---|
| Drowsiness | BVI confidence %, drowsy/alert verdict, 5-frame streak indicator |
| Emotion | Current emotion label, BVI score, distraction detection |
| Road Sign | YOLO-detected sign class, priority level, instruction |
| **Fusion Output** | Final risk score + level chips + Scene/Route progress bars |

**Fusion Output card** shows:
- Final risk score (large, coloured by level)
- All 4 level chips (Low / Medium / High / Critical) with active one highlighted
- Two progress bars: Scene input (blue) and Route input (green)

### 5.4 Key State Variables

```javascript
// Scene Risk Score
const activeSceneFrame = rsResult?.scene_latest  // updated every 1500 ms
const sceneScore = activeSceneFrame?.hazard?.score  // 0-100

// Map Risk Score  
const hzPoint = ...  // current route point, updated every 900 ms
const mapScore = hzPoint ? clamp(hzPoint.risk * 100, 0, 100) : null

// Fusion
const fusionScore = sceneScore * 0.56 + mapScore * 0.44

// Level classification
const fusionLevel =
    fusionScore >= 70 ? "Critical" :
    fusionScore >= 40 ? "High" :
    fusionScore >= 20 ? "Medium" : "Low"
```

---

## 6. Road Scene Fusion Page

**Route:** `/road-scene/fusion`  
**File:** `frontend/src/pages/RoadSceneFusion/RoadSceneFusionPage.jsx`

### 6.1 Card Layout

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  Card 1: Scene       │ ──▶ │  Card 2: Route        │ ──▶ │  Card 3: Fusion      │
│  (Blue theme)        │     │  (Green theme)        │     │  (Amber theme)       │
│                      │     │                       │     │                      │
│  Camera device pick  │     │  Start / End select   │     │  FinalRiskScore      │
│  Live webcam feed    │     │  Animated map         │     │  4-level chips       │
│  RSA overlay image   │     │  MapRiskScore         │     │  Confidence bars     │
│  SceneRiskScore      │     │  Segment list         │     │                      │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

### 6.2 Auto-Start Behaviour

1. On page mount: `enumerateDevices()` → lists webcams → starts the **first available camera automatically**
2. Once camera active: RSA loop fires every **1500 ms** → updates `sceneScore` + overlay
3. On camera start: route fetch fires for default route **Malabe → Athurugiriya**
4. Once route data loads: map animation **auto-starts** (900 ms per step)
5. `fusionScore` updates live as both inputs change

### 6.3 Route Locations Available

```javascript
const START_POINTS = ["Colombo","Kandy","Galle","Kurunegala","Negombo",
                      "Jaffna","Matara","Ratnapura","Malabe","Athurugiriya"];
const END_POINTS   = ["Galle","Kandy","Colombo","Badulla","Batticaloa",
                      "Trincomalee","Anuradhapura","Nuwara Eliya","Athurugiriya","Malabe"];
```

Each name is geocoded as `"<Name>, Sri Lanka"` via Nominatim to ensure correct resolution.

---

## 7. API Endpoints Reference

### POST `/rsa/analyse`

Analyse a single camera frame.

**Request:** `multipart/form-data`, field `file` = JPEG image

**Response:**
```json
{
  "original": "data:image/jpeg;base64,...",
  "overlay":  "data:image/jpeg;base64,...",
  "segments": [
    { "id": 0, "label": "Road", "pixel_pct": 42.3, "color": "#804080" },
    ...
  ],
  "hazard": {
    "score": 14.7,
    "level": "Medium",
    "breakdown": {
      "person_pct": 1.2,
      "twowheeler_pct": 0.8,
      "vehicle_pct": 6.5,
      "pothole_pct": 0.0
    }
  }
}
```

---

### POST `/api/analyze-route`

Analyse terrain and road risk for a bus route.

**Request:**
```json
{
  "start_location": "Malabe, Sri Lanka",
  "end_location":   "Athurugiriya, Sri Lanka",
  "step_m": 5.0
}
```

**Response:**
```json
{
  "status": "success",
  "total_points": 1243,
  "path_data": [
    {
      "lat": 6.9024, "lon": 79.9722,
      "risk": 0.18,
      "risk_label": "Low Risk", "color": "green",
      "slope": 1.2, "curvature": 0.003,
      "distance": 5.0,
      "terrain_feature": "Flat",
      "road_name": "Malabe Road", "road_class": "secondary",
      "maxspeed": "50", "lanes": "2",
      "is_bridge": false, "is_tunnel": false,
      "near_intersections": 1,
      "context_penalty": 0.11,
      "signed_grade": -1.2
    },
    ...
  ]
}
```

---

### POST `/api/fusion/predict` *(optional — backend must be running)*

Run the MLP fusion model with pre-extracted features.

**Request:**
```json
{
  "VRU": 2.1, "SidewalkDef": 0.5, "GuidanceSupport": 8.3,
  "SurfaceDamage": 0.0, "TrafficConflict": 6.5,
  "DowngradeSeverity": 1.2, "CurveSeverity": 0.003,
  "ComboSeverity": 0.18, "SpeedRisk": 0.08
}
```

**Response:**
```json
{
  "label": "Medium",
  "probabilities": { "Critical": 0.04, "High": 0.18, "Low": 0.22, "Medium": 0.56 }
}
```

---

## 8. Data Flow Diagram

```
Camera Frame (640×480 JPEG)
  │
  ├─→ POST /rsa/analyse (every 1500 ms)
  │       │
  │       └─→ SegFormer 512×512 inference
  │               │
  │               └─→ hazard_score = Σ(pixel_pct[i] × weight[i])
  │                       Person × 2.5
  │                       Two-wheeler × 2.0
  │                       Vehicle × 1.0
  │                       Pothole × 3.5
  │                   → SceneRiskScore (0–100)
  │                   → Overlay image (base64)
  │                   → Segment list
  │
Location Names (Malabe / Athurugiriya)
  │
  ├─→ POST /api/analyze-route (once on load)
  │       │
  │       ├─→ Nominatim geocode → lat/lon
  │       ├─→ OSRM routing → real road path
  │       ├─→ Densify to 5 m steps
  │       ├─→ SRTM elevation sampling
  │       ├─→ Slope (grade %) + curvature
  │       └─→ OSM road features (class, intersections, bridge)
  │               │
  │               └─→ risk = 0.70×(slope/10) + 0.30×curvature + context_penalty
  │                   → path_data[] with per-point risk values
  │
Animated Map (every 900 ms tick)
  │
  └─→ hzPoint = current path_data[i]
          │
          └─→ MapRiskScore = clamp(hzPoint.risk × 100, 0, 100)

                        ┌──────────────────────────────────────┐
                        │  SceneRiskScore  ×  0.56             │
                        │  MapRiskScore    ×  0.44             │
                        │  ─────────────────────────           │
                        │  FinalRiskScore  (0–100)             │
                        │  Level: Low / Medium / High / Crit   │
                        └──────────────────────────────────────┘
```

---

*Generated for BusMate project — 2026*
