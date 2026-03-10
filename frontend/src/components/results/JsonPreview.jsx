import React, { useState } from "react";

export default function JsonPreview({ data }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="json-preview">
      <button onClick={() => setOpen((v) => !v)}>
        {open ? "Hide" : "Show"} Raw JSON
      </button>
      {open && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
