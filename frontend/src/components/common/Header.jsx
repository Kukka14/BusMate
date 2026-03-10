import React from "react";
import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header className="header">
      <Link to="/" className="header-logo">EmotionDetect</Link>
      <nav className="header-nav">
        <Link to="/">Home</Link>
        <Link to="/live">Live Monitor</Link>
      </nav>
    </header>
  );
}
