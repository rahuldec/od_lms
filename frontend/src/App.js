import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Protected from "@/components/Protected"; 
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/admin/Dashboard";
import Trainees from "@/pages/admin/Trainees";
import TraineeDetail from "@/pages/admin/TraineeDetail";
import Batches from "@/pages/admin/Batches";
import BatchDetail from "@/pages/admin/BatchDetail";
import Resources from "@/pages/admin/Resources";
import TraineeHome from "@/pages/trainee/Home";
function RootRedirect() {
  const { session, role, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Login />;
  if (role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/trainee" replace />;
}
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          richColors
          position="top-center"
          toastOptions={{
            style: { borderRadius: 12 },
          }}
        />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route
            path="/admin"
            element={
              <Protected requireRole="admin">
                <AdminDashboard />
              </Protected>
            }
          />
          <Route
            path="/admin/trainees"
            element={
              <Protected requireRole="admin">
                <Trainees />
              </Protected>
            }
          />
          <Route
            path="/admin/trainees/:id"
            element={
              <Protected requireRole="admin">
                <TraineeDetail />
              </Protected>
            }
          />
          <Route
            path="/admin/batches"
            element={
              <Protected requireRole="admin">
                <Batches />
              </Protected>
            }
          />
          <Route
            path="/admin/batches/:id"
            element={
              <Protected requireRole="admin">
                <BatchDetail />
              </Protected>
            }
          />
          <Route
            path="/admin/resources"
            element={
              <Protected requireRole="admin">
                <Resources />
              </Protected>
            }
          />
          <Route
            path="/trainee"
            element={
              <Protected requireRole="trainee">
                <TraineeHome />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
