export function formatConfidence(value) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatLabel(label) {
  if (!label) return "—";
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

export function formatTimestamp(ts) {
  return new Date(ts).toLocaleTimeString();
}
