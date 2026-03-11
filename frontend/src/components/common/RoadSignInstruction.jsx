import { getSignInstruction, PRIORITY_COLORS } from "../../utils/roadSignInstructions";
import "./RoadSignInstruction.css";

/**
 * RoadSignInstructionPanel
 * ─────────────────────────────────────────────────────────────────
 * Props:
 *   className  {string}  – detected sign class_name from the model
 *   compact    {bool}    – smaller variant for use inside frame cards
 */
export default function RoadSignInstructionPanel({ className, compact = false }) {
  const data = getSignInstruction(className);
  if (!data) return null;

  const clr = PRIORITY_COLORS[data.priority];

  return (
    <div
      className={`rsi-panel${compact ? " rsi-compact" : ""}`}
      style={{
        background: clr.bg,
        borderColor: clr.border,
      }}
    >
      {/* Header row */}
      <div className="rsi-header">
        <span className="rsi-alert-icon">🚨</span>
        <span className="rsi-title">Road Sign Detected</span>
        <span
          className="rsi-priority-badge"
          style={{ background: clr.badge }}
        >
          Priority {data.priority} — {data.priorityLabel}
        </span>
      </div>

      {/* Sign name */}
      <div className="rsi-sign-row">
        <span className="rsi-sign-icon">{data.icon}</span>
        <div>
          <span className="rsi-sign-label">Sign</span>
          <span
            className="rsi-sign-name"
            style={{ color: clr.text }}
          >
            {className?.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="rsi-divider" style={{ background: clr.border }} />

      {/* Instructions */}
      <div className="rsi-instructions-label">Driver Instructions</div>
      <ul className="rsi-instructions">
        {data.instructions.map((line, i) => (
          <li key={i} className="rsi-instruction-item">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
