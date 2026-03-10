import React from "react";

export default function Badge({ text, color = "blue" }) {
  return <span className={`badge badge--${color}`}>{text}</span>;
}
