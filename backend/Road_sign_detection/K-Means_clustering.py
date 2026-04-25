import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

# ----------------------------
# LOAD DATA
# ----------------------------
df = pd.read_excel(r"D:\NETHMYY\datasets_for_analytics\FINAL_DATASET_WITH_DATE.xlsx")

# ----------------------------
# PREPROCESS
# ----------------------------
df["date"] = pd.to_datetime(df["date"])
df["day_of_week"] = df["date"].dt.day_name()

# ----------------------------
# IDEA 1 — RULE-BASED COMPLEXITY
# ----------------------------
q1 = df["total_signs"].quantile(0.33)
q2 = df["total_signs"].quantile(0.66)

def classify_complexity(signs):
    if signs > q2:
        return "HIGH"
    elif signs >= q1:
        return "MEDIUM"
    else:
        return "LOW"

df["route_complexity"] = df["total_signs"].apply(classify_complexity)

# ----------------------------
# IDEA 2 — K-MEANS CLUSTERING
# ----------------------------
features = df[["hour", "avg_vehicle_count", "duration_min"]]

scaler = StandardScaler()
scaled = scaler.fit_transform(features)

kmeans = KMeans(n_clusters=3, random_state=42)
df["cluster"] = kmeans.fit_predict(scaled)

# Label clusters
cluster_summary = df.groupby("cluster")[["avg_vehicle_count"]].mean()
cluster_order = cluster_summary.sort_values("avg_vehicle_count").index.tolist()

cluster_labels = {
    cluster_order[0]: "LOW",
    cluster_order[1]: "MEDIUM",
    cluster_order[2]: "HIGH"
}

df["traffic_level"] = df["cluster"].map(cluster_labels)

# ----------------------------
# FIND TOP 3 PEAK HOURS
# ----------------------------
traffic_by_hour = df.groupby("hour")["avg_vehicle_count"].mean()

top_hours = traffic_by_hour.sort_values(ascending=False).head(3)

print("\n===== TOP 3 PEAK TRAFFIC HOURS =====")

peak_ranges = []
for h in top_hours.index:
    time_range = f"{h:02d}:00 – {h+1:02d}:00"
    peak_ranges.append((h, time_range))
    print(time_range)

# ----------------------------
# FIND MOST AFFECTED ROUTES
# ----------------------------
print("\n===== ROUTES WITH HIGH TRAFFIC IN PEAK HOURS =====")

for h, time_range in peak_ranges:
    print(f"\n⏰ Time: {time_range}")

    subset = df[df["hour"] == h]

    # Get routes with highest vehicle count
    route_traffic = (
        subset.groupby("route")["avg_vehicle_count"]
        .mean()
        .sort_values(ascending=False)
        .head(3)
    )

    print("Top routes:")
    print(route_traffic)

# ----------------------------
# SAVE RESULTS
# ----------------------------
df.to_excel("FINAL_ANALYZED_RESULTS.xlsx", index=False)

print("\n✅ Analysis complete with Top 3 peak hours + route impact")