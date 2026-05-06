import React from "react";
import { Outlet } from "react-router-dom";
import Header from "../../components/common/Header";
import Footer from "../../components/common/Footer";
import Sidebar from "../../components/common/Sidebar";

export default function MainLayout() {
  return (
    <div className="app-shell">
      <Header />
      <div className="dd-root">
        <Sidebar />
        <main className="main-content dd-page-main">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
