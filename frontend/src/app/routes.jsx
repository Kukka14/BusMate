import React from "react";
import { createBrowserRouter } from "react-router-dom";
import MainLayout from "./layout/MainLayout";
import { HomePage } from "../pages/Home";
import { LoginPage } from "../pages/Login";
import { SignUpPage } from "../pages/SignUp";
import { LiveMonitorPage } from "../pages/LiveMonitor";
import { NotFoundPage } from "../pages/NotFound";
import AdminDashboard from "../pages/AdminDashboard/AdminDashboard";
import DriverDashboard from "../pages/DriverDashboard/DriverDashboard";
import { DrivingMonitorPage } from "../pages/DrivingMonitor";
import MonitorHubPage from "../pages/MonitorHub/MonitorHubPage";
import DriverProfilePage from "../pages/DriverProfile/DriverProfilePage";
import { Road_sign_UploadPage } from "../pages/Road_sign_Upload";
import { Road_sign_LivePage } from "../pages/Road_sign_Live";
import { Road_sign_ResultsPage } from "../pages/Road_sign_Results";
import { Road_sign_VideoResultsPage } from "../pages/Road_sign_VideoResults";
import { RoadSceneUploadPage } from "../pages/Road_scene_Upload";
import { RoadSceneResultsPage } from "../pages/Road_scene_Results";
import { RoadSceneVideoResultsPage } from "../pages/Road_scene_VideoResults";
import HazardAnalyserPage from "../pages/HazardAnalyser";
import DriverStatsPage from "../pages/DriverStats/DriverStatsPage";
import DrowsinessMonitorPage from "../pages/DrowsinessMonitor/DrowsinessMonitorPage";
import SchedulePage from "../pages/Schedule/SchedulePage";
import ActiveShiftPage from "../pages/ActiveShift/ActiveShiftPage";
import AdminDriversPage from "../pages/AdminDrivers/AdminDriversPage";
import AdminSchedulePage from "../pages/AdminSchedule/AdminSchedulePage";

export const router = createBrowserRouter([
  // Standalone full-page routes (own layout)
  { path: "/",                  element: <HomePage />           },
  { path: "/login",             element: <LoginPage />          },
  { path: "/signup",            element: <SignUpPage />         },
  { path: "/admin/dashboard",   element: <AdminDashboard />     },
  { path: "/admin/drivers",     element: <AdminDriversPage />   },
  { path: "/admin/schedules",   element: <AdminSchedulePage />  },
  { path: "/driver/dashboard",        element: <DriverDashboard />    },
  { path: "/driver/monitor",           element: <MonitorHubPage />     },
  { path: "/driver/monitor/emotion",   element: <DrivingMonitorPage /> },
  { path: "/driver/profile",    element: <DriverProfilePage />  },
  { path: "/driver/drowsiness", element: <DrowsinessMonitorPage /> },
  { path: "/driver/stats",      element: <DriverStatsPage />    },
  { path: "/driver/schedule",   element: <SchedulePage />       },
  { path: "/driver/active-shift", element: <ActiveShiftPage />  },

  // Road Sign Detection pages
  { path: "/road-sign",                element: <Road_sign_UploadPage />       },
  { path: "/road-sign/live",           element: <Road_sign_LivePage />         },
  { path: "/road-sign/results",        element: <Road_sign_ResultsPage />      },
  { path: "/road-sign/video-results",  element: <Road_sign_VideoResultsPage /> },

  // Road Scene Analysis & Hazard Assessment
  { path: "/road-scene",               element: <RoadSceneUploadPage />       },
  { path: "/road-scene/results",       element: <RoadSceneResultsPage />      },
  { path: "/road-scene/video-results", element: <RoadSceneVideoResultsPage /> },
  { path: "/road-scene/hazard",        element: <HazardAnalyserPage />        },

  // Inner app — shared MainLayout
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { path: "live", element: <LiveMonitorPage /> },
      { path: "*",    element: <NotFoundPage />    },
    ],
  },
]);
