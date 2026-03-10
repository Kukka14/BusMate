import React, { useState } from "react";

export default function Tabs({ tabs = [] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="tabs">
      <div className="tabs-header">
        {tabs.map((t, i) => (
          <button
            key={i}
            className={`tab-btn ${i === active ? "active" : ""}`}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tabs-body">{tabs[active]?.content}</div>
    </div>
  );
}
