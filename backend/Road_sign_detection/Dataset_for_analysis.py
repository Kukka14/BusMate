import pandas as pd
import random
import uuid
from datetime import datetime, timedelta

# ----------------------------
# ROUTES (FIXED TRUE VALUES)
# ----------------------------
routes = {
    "Colombo → Kandy": {
        "distance": 115, "type": "hills",
        "signs": {"Stop": 12, "Children Crossing": 6, "pedestrian crossing": 5, "No parking": 4}
    },
    "Galle → Mathara": {
        "distance": 47, "type": "coastal",
        "signs": {"Stop": 8, "Children Crossing": 4, "pedestrian crossing": 3, "No parking": 2}
    },
    "Kurunagala → Anuradhapura": {
        "distance": 109, "type": "normal",
        "signs": {"Stop": 6, "Children Crossing": 3, "pedestrian crossing": 2, "No parking": 2}
    },
    "Negombo → Colombo": {
        "distance": 35, "type": "coastal",
        "signs": {"Stop": 10, "Children Crossing": 5, "pedestrian crossing": 4, "No parking": 3}
    },
    "Kandy → NuwaraEliya": {
        "distance": 75, "type": "high_hills",
        "signs": {"Stop": 5, "Children Crossing": 3, "pedestrian crossing": 2, "No parking": 2}
    },
    "Colombo → Galle": {
        "distance": 130, "type": "coastal",
        "signs": {"Stop": 14, "Children Crossing": 7, "pedestrian crossing": 6, "No parking": 5}
    },
    "Kandy → Panadura": {
        "distance": 165, "type": "hills",
        "signs": {"Stop": 13, "Children Crossing": 6, "pedestrian crossing": 5, "No parking": 4}
    },
    "Kaduwela → Kollupitiya": {
        "distance": 18, "type": "urban",
        "signs": {"Stop": 9, "Children Crossing": 4, "pedestrian crossing": 4, "No parking": 3}
    }
}

# ----------------------------
# HELPERS
# ----------------------------
def random_time():
    now = datetime.now()
    past = now - timedelta(days=90)
    delta = now - past
    minutes = random.randint(0, int(delta.total_seconds()/60))
    return past + timedelta(minutes=minutes)

def traffic(hour):
    if 6 <= hour <= 9 or 16 <= hour <= 20:
        return "HIGH"
    elif 10 <= hour <= 15:
        return "MEDIUM"
    return "LOW"

def speed(route_type, traffic):
    base = {"urban":30, "coastal":50, "hills":40, "high_hills":30, "normal":45}[route_type]
    if traffic == "HIGH":
        base *= 0.6
    elif traffic == "MEDIUM":
        base *= 0.8
    return base

def detection_variation(true_count):
    # simulate model error (±20%)
    variation = int(true_count * random.uniform(-0.2, 0.2))
    return max(0, true_count + variation)

# ----------------------------
# GENERATE DATA
# ----------------------------
data = []

for i in range(1500):

    route = random.choice(list(routes.keys()))
    start, end = route.split(" → ")

    info = routes[route]
    distance = info["distance"]
    route_type = info["type"]

    start_time = random_time()
    hour = start_time.hour
    traffic_level = traffic(hour)

    # duration
    sp = speed(route_type, traffic_level)
    duration = int((distance / sp) * 60)
    end_time = start_time + timedelta(minutes=duration)

    # -------- SIGN VARIATION --------
    true_signs = info["signs"]

    stop = detection_variation(true_signs["Stop"])
    children = detection_variation(true_signs["Children Crossing"])
    pedestrian = detection_variation(true_signs["pedestrian crossing"])
    no_parking = detection_variation(true_signs["No parking"])

    total_signs = stop + children + pedestrian + no_parking

    # other simulated values
    avg_distance = round(random.uniform(20, 35), 2)
    avg_vehicle = round(random.uniform(5, 15), 2)

    # driver scores
    drowsiness = random.randint(5, 20)
    emotion = random.randint(5, 20)

    row = {
        "trip_id": str(uuid.uuid4()),
        "route": route,
        "start": start,
        "end": end,
        "distance_km": distance,
        "route_type": route_type,

        "date": start_time.strftime("%Y-%m-%d"),
        "start_time": start_time.strftime("%H:%M"),
        "end_time": end_time.strftime("%H:%M"),
        "duration_min": duration,

        "hour": hour,
        "traffic": traffic_level,

        "total_signs": total_signs,
        "stop_signs": stop,
        "children_crossing_signs": children,
        "pedestrian_crossing_signs": pedestrian,
        "no_parking_signs": no_parking,

        "avg_sign_distance": avg_distance,
        "avg_vehicle_count": avg_vehicle,

        "drowsiness_score": drowsiness,
        "emotion_score": emotion
    }

    data.append(row)

# ----------------------------
# SAVE
# ----------------------------
df = pd.DataFrame(data)
df.to_excel("REALISTIC_DATASET.xlsx", index=False)

print("✅ Realistic dataset generated!")