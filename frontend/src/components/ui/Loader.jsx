import React from "react";

export default function Loader({ size = 32 }) {
  return (
    <div className="loader" style={{ width: size, height: size }}>
      <div className="loader-spinner" />
    </div>
  );
}
