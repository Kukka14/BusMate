import React from "react";

export default function PageShell({ title, children }) {
  return (
    <div className="page-shell">
      {title && <h1 className="page-title">{title}</h1>}
      <div className="page-body">{children}</div>
    </div>
  );
}
