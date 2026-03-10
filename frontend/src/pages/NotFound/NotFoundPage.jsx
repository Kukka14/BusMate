import React from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div style={{ textAlign: "center", padding: "4rem" }}>
      <h1>404 — Page Not Found</h1>
      <Button onClick={() => navigate("/")}>Go Home</Button>
    </div>
  );
}
