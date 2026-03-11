/**
 * Road Sign Instruction Database
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers all 68 signs detected by the road-sign ensemble model.
 *
 * Priority levels:
 *   4 – Critical   (red)
 *   3 – High       (orange)
 *   2 – Medium     (amber)
 *   1 – Low        (green)
 *
 * Lookup is normalised (lowercase, trimmed) so casing / spacing differences
 * in the model output don't break the match.
 */

const SIGN_DB = {
  /* ── Mandatory / Direction signs ──────────────────────────────────────── */
  "ahead only": {
    priority: 1,
    priorityLabel: "Low",
    icon: "⬆️",
    instructions: [
      "⬆️ Maintain your current lane — go straight only",
      "🚫 Do not turn left or right at this junction",
      "🚗 Keep a safe following distance",
    ],
  },
  "ahead or right only": {
    priority: 1,
    priorityLabel: "Low",
    icon: "↗️",
    instructions: [
      "↗️ You may go straight or turn right only",
      "🚫 Left turn is not permitted here",
      "🔦 Indicate right if turning",
    ],
  },
  "ahead or left only": {
    priority: 1,
    priorityLabel: "Low",
    icon: "↖️",
    instructions: [
      "↖️ You may go straight or turn left only",
      "🚫 Right turn is not permitted here",
      "🔦 Indicate left if turning",
    ],
  },
  "turn left ahead": {
    priority: 1,
    priorityLabel: "Low",
    icon: "⬅️",
    instructions: [
      "⬅️ Prepare to turn left ahead",
      "🔦 Signal left early",
      "🚗 Slow down before the turn",
      "👀 Check for cyclists and pedestrians on the left",
    ],
  },
  "pass right side": {
    priority: 1,
    priorityLabel: "Low",
    icon: "➡️",
    instructions: [
      "➡️ Pass the obstacle or divider on the right side",
      "🚫 Do not pass on the left",
      "🚗 Maintain steady speed while passing",
    ],
  },
  "pass left side": {
    priority: 1,
    priorityLabel: "Low",
    icon: "⬅️",
    instructions: [
      "⬅️ Pass the obstacle or divider on the left side",
      "🚫 Do not pass on the right",
      "🚗 Maintain steady speed while passing",
    ],
  },
  "compulsory roundabout": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🔄",
    instructions: [
      "🔄 Prepare to enter the roundabout",
      "⬅️ Give way to traffic already in the roundabout",
      "🔦 Use indicators when exiting",
      "🚗 Maintain slow speed inside the roundabout",
    ],
  },

  /* ── Warning / Hazard signs ────────────────────────────────────────────── */
  "be careful": {
    priority: 3,
    priorityLabel: "High",
    icon: "⚠️",
    instructions: [
      "⚠️ Proceed with extra caution ahead",
      "🚗 Reduce speed immediately",
      "👀 Scan the road carefully for hazards",
    ],
  },
  "blind people crossing  ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🦯",
    instructions: [
      "🦯 Blind pedestrians may be crossing",
      "🚗 Reduce speed significantly",
      "🛑 Be prepared to stop at any moment",
      "👀 Watch carefully — pedestrians may not see you",
    ],
  },
  "blind people crossing ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🦯",
    instructions: [
      "🦯 Blind pedestrians may be crossing",
      "🚗 Reduce speed significantly",
      "🛑 Be prepared to stop at any moment",
      "👀 Watch carefully — pedestrians may not see you",
    ],
  },
  "children crossing": {
    priority: 4,
    priorityLabel: "Critical",
    icon: "🧒",
    instructions: [
      "🚗 Slow down immediately",
      "🛑 Be prepared to stop at any moment",
      "👀 Watch for children on both sides of the road",
      "🔕 Do not honk — stay calm and patient",
    ],
  },
  "school area ahead": {
    priority: 4,
    priorityLabel: "Critical",
    icon: "🏫",
    instructions: [
      "🚗 Slow down significantly",
      "👀 Watch carefully for children near the road",
      "🛑 Stop for pedestrians at all times",
      "🔕 No unnecessary honking",
      "📅 Extra caution during school hours",
    ],
  },
  "pedestrian crossing": {
    priority: 4,
    priorityLabel: "Critical",
    icon: "🚶",
    instructions: [
      "🚗 Slow down immediately",
      "🛑 Stop for pedestrians who are waiting or crossing",
      "👀 Check both sides of the road for pedestrians",
      "🔕 Do not honk at pedestrians on the crossing",
    ],
  },
  "animal crossing": {
    priority: 3,
    priorityLabel: "High",
    icon: "🐄",
    instructions: [
      "🐄 Watch for animals crossing the road",
      "🚗 Reduce speed significantly",
      "🛑 Stop if animals are on or near the road",
      "🔕 Avoid sudden horn use — it may startle animals",
    ],
  },
  "near hospital": {
    priority: 3,
    priorityLabel: "High",
    icon: "🏥",
    instructions: [
      "🔕 No honking in this zone",
      "🚗 Maintain low speed",
      "🚑 Watch for ambulances and emergency vehicles",
      "🛑 Give immediate way to emergency vehicles",
    ],
  },
  "dangerous ascent ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "⛰️",
    instructions: [
      "⚙️ Shift to a lower gear before the hill",
      "🚗 Increase engine power gradually",
      "👀 Be aware of slow-moving vehicles ahead",
      "🔦 Keep a safe following distance on the incline",
    ],
  },
  "dangerous descent ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🏔️",
    instructions: [
      "🚗 Reduce speed before the descent",
      "⚙️ Shift to a lower gear to use engine braking",
      "🛑 Avoid heavy braking on the slope",
      "👀 Watch for vehicles ahead slowing or stopping",
    ],
  },
  "slippery road ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🌊",
    instructions: [
      "🚗 Reduce speed immediately",
      "🛑 Avoid sudden braking or sharp steering",
      "↔️ Keep a greater distance from the vehicle ahead",
      "⚙️ Drive smoothly and avoid sudden acceleration",
    ],
  },
  "road work ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🚧",
    instructions: [
      "🚗 Reduce speed immediately",
      "👀 Watch for road workers and machinery",
      "↔️ Follow lane markings or marshal directions",
      "🛑 Be prepared to stop if directed",
    ],
  },
  "uneven road ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🪨",
    instructions: [
      "🚗 Reduce speed to avoid vehicle damage",
      "🛑 Avoid sudden braking",
      "↔️ Keep both hands on the steering wheel",
      "👀 Watch for potholes and bumps",
    ],
  },
  "bump ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "〰️",
    instructions: [
      "🚗 Reduce speed before the speed bump",
      "🛑 Drive over the bump slowly",
      "↔️ Keep both hands on the steering wheel",
    ],
  },
  "falling rock": {
    priority: 3,
    priorityLabel: "High",
    icon: "🪨",
    instructions: [
      "👀 Watch for rocks or debris on the road",
      "🚗 Reduce speed significantly",
      "↔️ Be ready to swerve safely if needed",
      "🚫 Do not stop or park under rock faces",
    ],
  },
  "narrow bridge ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🌉",
    instructions: [
      "🚗 Slow down before entering the bridge",
      "👀 Check if oncoming traffic is present",
      "🛑 Yield to oncoming vehicles if needed",
      "↔️ Keep to the centre of your lane",
    ],
  },
  "road narrows ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "↔️",
    instructions: [
      "🚗 Reduce speed before the narrow section",
      "↔️ Move towards the centre of your lane",
      "👀 Watch for oncoming traffic in the narrow section",
      "🛑 Yield if oncoming traffic is present",
    ],
  },
  "road narrows on left  ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "↔️",
    instructions: [
      "🚗 Reduce speed approaching the narrow section",
      "➡️ Move slightly to the right",
      "👀 Be alert to the reduced left-side clearance",
    ],
  },
  "road narrows on left ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "↔️",
    instructions: [
      "🚗 Reduce speed approaching the narrow section",
      "➡️ Move slightly to the right",
      "👀 Be alert to the reduced left-side clearance",
    ],
  },
  "road narrows on the right": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "↔️",
    instructions: [
      "🚗 Reduce speed approaching the narrow section",
      "⬅️ Move slightly to the left",
      "👀 Be alert to the reduced right-side clearance",
    ],
  },
  "road ahead on a quay": {
    priority: 3,
    priorityLabel: "High",
    icon: "🌊",
    instructions: [
      "🚗 Reduce speed significantly",
      "👀 Be extremely cautious — there is water nearby",
      "🛑 Stay well within your lane boundaries",
      "⚠️ Risk of falling off the road edge",
    ],
  },
  "tunnel ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🚇",
    instructions: [
      "💡 Switch on headlights before entering",
      "🚗 Maintain a safe following distance",
      "🚫 No overtaking inside the tunnel",
      "👀 Watch your speed — it can appear slower in tunnels",
    ],
  },
  "two-way traffic ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "🔃",
    instructions: [
      "👀 Oncoming traffic will be present ahead",
      "🚗 Move to the left side of the road",
      "🚫 No overtaking until you can clearly see ahead",
      "💡 Use dipped headlights in poor visibility",
    ],
  },

  /* ── Bend / Junction signs ─────────────────────────────────────────────── */
  "left  bend ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "↩️",
    instructions: [
      "🚗 Reduce speed before the bend",
      "↩️ Steer gently to the left",
      "🚫 No overtaking on this bend",
      "👀 Watch for oncoming vehicles",
    ],
  },
  "left bend ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "↩️",
    instructions: [
      "🚗 Reduce speed before the bend",
      "↩️ Steer gently to the left",
      "🚫 No overtaking on this bend",
      "👀 Watch for oncoming vehicles",
    ],
  },
  "right bend ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "↪️",
    instructions: [
      "🚗 Reduce speed before the bend",
      "↪️ Steer gently to the right",
      "🚫 No overtaking on this bend",
      "👀 Watch for oncoming vehicles",
    ],
  },
  "double bend to left": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🔀",
    instructions: [
      "🚗 Reduce speed before the first bend",
      "↩️ Steer carefully through the double bend",
      "🚫 Do not overtake on the bends",
      "👀 Watch for oncoming vehicles",
    ],
  },
  "double bend to right ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🔀",
    instructions: [
      "🚗 Reduce speed before the first bend",
      "↪️ Steer carefully through the double bend",
      "🚫 Do not overtake on the bends",
      "👀 Watch for oncoming vehicles",
    ],
  },
  "hair pin bend to left  ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "↩️",
    instructions: [
      "🚗 Reduce speed significantly before the hairpin bend",
      "⚙️ Change to a lower gear",
      "↩️ Stay in your lane throughout the sharp bend",
      "🚫 Absolutely no overtaking",
    ],
  },
  "hair pin bend to left ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "↩️",
    instructions: [
      "🚗 Reduce speed significantly before the hairpin bend",
      "⚙️ Change to a lower gear",
      "↩️ Stay in your lane throughout the sharp bend",
      "🚫 Absolutely no overtaking",
    ],
  },
  "hair pin bend to right ahead": {
    priority: 3,
    priorityLabel: "High",
    icon: "↪️",
    instructions: [
      "🚗 Reduce speed significantly before the hairpin bend",
      "⚙️ Change to a lower gear",
      "↪️ Stay in your lane throughout the sharp bend",
      "🚫 Absolutely no overtaking",
    ],
  },
  "'y' junction ahead 111": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🔱",
    instructions: [
      "🚗 Reduce speed as you approach the Y-junction",
      "👀 Watch for vehicles entering from both branches",
      "↔️ Choose the correct lane in advance",
      "🔦 Use indicators before turning",
    ],
  },
  "t junction ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "⊤",
    instructions: [
      "🚗 Reduce speed and approach with caution",
      "🔦 Signal your intended direction early",
      "👀 Check for traffic from both sides",
      "🛑 Yield if required",
    ],
  },
  "cross road ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "✚",
    instructions: [
      "👀 Approach with caution — cross traffic ahead",
      "🚗 Reduce speed",
      "🔦 Signal your direction early",
      "🛑 Check all directions before crossing",
    ],
  },
  "roundabout ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🔄",
    instructions: [
      "🔄 Prepare to enter the roundabout",
      "🚗 Slow down and yield to traffic already inside",
      "🔦 Use indicators when exiting the roundabout",
      "↩️ Take the correct exit",
    ],
  },

  /* ── Stop / Give way ───────────────────────────────────────────────────── */
  "stop": {
    priority: 4,
    priorityLabel: "Critical",
    icon: "🛑",
    instructions: [
      "⚠️ Slow down immediately",
      "🛑 Stop the vehicle before the stop line",
      "👀 Check traffic from all directions before moving",
      "🚦 Only proceed when it is completely safe",
    ],
  },
  "give way": {
    priority: 3,
    priorityLabel: "High",
    icon: "⚠️",
    instructions: [
      "🚗 Slow down and prepare to stop",
      "👀 Check for traffic on the main road",
      "🛑 Yield to all vehicles on the priority road",
      "🔦 Only proceed when it is clearly safe",
    ],
  },
  "traffic signals ahead": {
    priority: 4,
    priorityLabel: "Critical",
    icon: "🚦",
    instructions: [
      "🚗 Reduce speed as you approach",
      "🚦 Be prepared to stop at the red signal",
      "👀 Watch the signal from a distance",
      "🚫 Never jump the signal",
    ],
  },

  /* ── Prohibitory signs ─────────────────────────────────────────────────── */
  "no entry": {
    priority: 4,
    priorityLabel: "Critical",
    icon: "⛔",
    instructions: [
      "🛑 Do not enter — this road is closed to your direction",
      "🔄 Turn around immediately",
      "👀 Look for alternative route signs",
    ],
  },
  "no u turn": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🔄",
    instructions: [
      "🚫 Do not attempt a U-turn here",
      "🔦 Plan your route ahead to avoid needing to turn",
      "🚗 Continue straight or take the next available turn",
    ],
  },
  "no turn left": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚫",
    instructions: [
      "🚫 Left turn is prohibited at this junction",
      "➡️ Go straight or turn right instead",
      "🔦 Indicate your intended direction early",
    ],
  },
  "no turn right": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚫",
    instructions: [
      "🚫 Right turn is prohibited at this junction",
      "⬅️ Go straight or turn left instead",
      "🔦 Indicate your intended direction early",
    ],
  },
  "no parking": {
    priority: 1,
    priorityLabel: "Low",
    icon: "🅿️",
    instructions: [
      "🚫 Parking is strictly prohibited here",
      "🚗 Keep moving and find a designated parking area",
      "🚨 Illegally parked vehicles may be towed",
    ],
  },
  "no parking and standing": {
    priority: 1,
    priorityLabel: "Low",
    icon: "🅿️",
    instructions: [
      "🚫 Do not park or stop (even briefly) in this zone",
      "🚗 Keep traffic flowing — do not halt",
    ],
  },
  "no parking on odd days": {
    priority: 1,
    priorityLabel: "Low",
    icon: "📅",
    instructions: [
      "📅 Check today's date before parking",
      "🚫 Do not park here on odd-numbered calendar days",
      "🚗 Find alternative parking on restricted days",
    ],
  },
  "no parking on even days": {
    priority: 1,
    priorityLabel: "Low",
    icon: "📅",
    instructions: [
      "📅 Check today's date before parking",
      "🚫 Do not park here on even-numbered calendar days",
      "🚗 Find alternative parking on restricted days",
    ],
  },
  "no horning": {
    priority: 1,
    priorityLabel: "Low",
    icon: "🔕",
    instructions: [
      "🔕 Do not use the horn in this zone",
      "💡 Use hazard lights or headlights to signal if needed",
      "🚗 Drive carefully without horn use",
    ],
  },
  "no heavey vehicals allowed": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚚",
    instructions: [
      "🚚 Heavy vehicles must not proceed on this road",
      "🔄 Take the alternative designated heavy-vehicle route",
      "⚠️ Violation may result in fines",
    ],
  },
  "overtaking not allowed": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚫",
    instructions: [
      "🚫 No overtaking permitted here",
      "🚗 Maintain your lane and position",
      "👀 Wait until the restriction ends",
    ],
  },
  "overtaking goods not allowed": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚚",
    instructions: [
      "🚚 Goods vehicles must not overtake here",
      "🚗 Passenger vehicles may still overtake with care",
      "👀 Follow normal overtaking safety rules",
    ],
  },
  "overtaking allowed": {
    priority: 1,
    priorityLabel: "Low",
    icon: "✅",
    instructions: [
      "✅ Overtaking is permitted in this zone",
      "👀 Ensure the road ahead is clear before overtaking",
      "🔦 Signal and check mirrors before moving out",
      "🚗 Return to your lane promptly after overtaking",
    ],
  },

  /* ── Road closed signs ─────────────────────────────────────────────────── */
  "road close for all vehicals": {
    priority: 4,
    priorityLabel: "Critical",
    icon: "⛔",
    instructions: [
      "🛑 This road is completely closed — do not proceed",
      "🔄 Turn around and find an alternative route",
      "📍 Follow diversion signs",
    ],
  },
  "road closed for moter vehicals": {
    priority: 3,
    priorityLabel: "High",
    icon: "🚫",
    instructions: [
      "🚫 Motor vehicles are not permitted on this road",
      "🔄 Turn around and use an alternative route",
      "🚶 Road may still be open for pedestrians/cyclists",
    ],
  },
  "road closed for motercycles": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🏍️",
    instructions: [
      "🏍️ Motorcycles must not proceed on this road",
      "🔄 Take the alternative route",
      "🚗 Other vehicles may proceed normally",
    ],
  },
  "road closed for busses": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚌",
    instructions: [
      "🚌 Buses must not use this road",
      "🔄 Buses should take the alternative route",
      "🚗 Other vehicles may proceed normally",
    ],
  },

  /* ── Speed limit signs ─────────────────────────────────────────────────── */
  "speed limit 20 kmph for this area": {
    priority: 3,
    priorityLabel: "High",
    icon: "🐢",
    instructions: [
      "🐢 Reduce speed to 20 km/h immediately",
      "👀 This is likely a very sensitive zone (school, hospital, etc.)",
      "🛑 Be prepared to stop for pedestrians",
    ],
  },
  "speed limit 30 kmph for this area": {
    priority: 3,
    priorityLabel: "High",
    icon: "🚗",
    instructions: [
      "🚗 Reduce speed to 30 km/h",
      "👀 Watch for pedestrians and cyclists",
      "🛑 Slow zone — drive very carefully",
    ],
  },
  "speed limit 50 kmph for this area": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚗",
    instructions: [
      "🚗 Maintain speed at or below 50 km/h",
      "👀 Urban area — watch for pedestrians and intersections",
      "⚠️ Do not exceed the limit",
    ],
  },
  "speed limit 60 kmph for this area": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚗",
    instructions: [
      "🚗 Maintain speed at or below 60 km/h",
      "⚠️ Exceeding this limit is a traffic offence",
    ],
  },
  "speed limit 70 kmph for this area": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚗",
    instructions: [
      "🚗 Maintain speed at or below 70 km/h",
      "⚠️ Exceeding this limit is a traffic offence",
    ],
  },
  "speed limit 80 kmph for this area": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚗",
    instructions: [
      "🚗 Maintain speed at or below 80 km/h",
      "⚠️ Exceeding this limit is a traffic offence",
    ],
  },
  "speed limit 100 kmph for this area": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚗",
    instructions: [
      "🚗 Maintain speed at or below 100 km/h",
      "⚠️ Exceeding this limit is a traffic offence",
      "👀 Adjust speed for road and weather conditions",
    ],
  },
  "speed limit 120 kmph for this area": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚗",
    instructions: [
      "🚗 Maintain speed at or below 120 km/h",
      "⚠️ Exceeding this limit is a traffic offence",
      "👀 Adjust speed for road and weather conditions",
    ],
  },

  /* ── Other signs ───────────────────────────────────────────────────────── */
  "train station ahead": {
    priority: 2,
    priorityLabel: "Medium",
    icon: "🚂",
    instructions: [
      "🚂 Watch for trains and pedestrians",
      "🚗 Reduce speed near the crossing",
      "🛑 Stop for barriers when they are lowered",
      "🔕 No parking near the station entrance",
    ],
  },
  "bus lane": {
    priority: 1,
    priorityLabel: "Low",
    icon: "🚌",
    instructions: [
      "🚌 This lane is reserved for buses",
      "🚗 Other vehicles must not enter the bus lane",
      "↔️ Move to the appropriate lane immediately",
    ],
  },
};

// ── Priority colour map ───────────────────────────────────────────────────────
export const PRIORITY_COLORS = {
  4: { bg: "rgba(239,68,68,0.12)",  border: "#ef4444", text: "#ef4444",  badge: "#ef4444"  },
  3: { bg: "rgba(249,115,22,0.12)", border: "#f97316", text: "#f97316",  badge: "#f97316"  },
  2: { bg: "rgba(245,158,11,0.12)", border: "#f59e0b", text: "#f59e0b",  badge: "#f59e0b"  },
  1: { bg: "rgba(34,197,94,0.10)",  border: "#22c55e", text: "#22c55e",  badge: "#22c55e"  },
};

/**
 * Retrieve instruction data for a given class_name string.
 * Returns null if the sign is not found in the database.
 */
export function getSignInstruction(className) {
  if (!className) return null;
  // Normalise: lowercase + collapse multiple spaces + trim
  const key = className.toLowerCase().replace(/\s+/g, " ").trim();
  return SIGN_DB[key] ?? null;
}
