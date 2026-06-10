import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import axios from "axios";

const Tab = ({ active, onClick, children, testId }) => (
  <button
    data-testid={testId}
    type="button"
    onClick={onClick}
    className={`flex-1 py-2.5 text-sm font-medium rounded-full transition-all ${
      active
        ? "bg-white text-neutral-900 shadow-sm"
        : "text-neutral-500 hover:text-neutral-800"
    }`}
  >
    {children}
  </button>
);

export default function Login() {
  const navigate = useNavigate();
  const { signInAs, refreshMe } = useAuth();
  const [tab, setTab] = useState("trainee");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Enter username and password");
      return;
    }
    setBusy(true);
    try {
      const { error } = await signInAs({
        username,
        password,
        roleHint: tab,
      });
      if (error) {
        // If admin login fails, attempt to initialize and retry.
        if (tab === "admin") {
          await axios
            .post(`${process.env.REACT_APP_BACKEND_URL}/api/setup/init`)
            .catch(() => {});
          const retry = await signInAs({
            username,
            password,
            roleHint: tab,
          });
          if (retry.error) {
            toast.error(retry.error.message || "Login failed");
            setBusy(false);
            return;
          }
        } else {
          toast.error(error.message || "Login failed");
          setBusy(false);
          return;
        }
      }
      const { data: s } = await supabase.auth.getSession();
      await refreshMe(s.session?.access_token);
      const { data } = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/me`,
        { headers: { Authorization: `Bearer ${s.session?.access_token}` } }
      );
      toast.success("Welcome back");
      navigate(data.role === "admin" ? "/admin" : "/trainee", { replace: true });
    } catch (err) {
      toast.error(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="login-page"
      className="min-h-screen bg-white flex items-center justify-center px-6"
      style={{
        backgroundImage:
          "radial-gradient(1100px 500px at 90% -10%, rgba(224,90,43,0.08), transparent 60%), radial-gradient(700px 400px at -10% 110%, rgba(224,90,43,0.06), transparent 60%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div
            className="h-10 w-10 rounded-2xl grid place-items-center text-white text-sm font-semibold"
            style={{ backgroundColor: "#E05A2B" }}
          >
            OD
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
              Okie Dokie Solutions
            </p>
            <h1 className="text-lg font-semibold text-neutral-900 -mt-0.5">
              Training Tracker
            </h1>
          </div>
        </div>

        <Card className="border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.06)] rounded-2xl p-7">
          <div className="bg-neutral-100 rounded-full p-1 flex mb-6">
            <Tab
              testId="tab-trainee"
              active={tab === "trainee"}
              onClick={() => setTab("trainee")}
            >
              <span className="inline-flex items-center gap-2 justify-center">
                <GraduationCap className="h-4 w-4" /> Trainee
              </span>
            </Tab>
            <Tab
              testId="tab-admin"
              active={tab === "admin"}
              onClick={() => setTab("admin")}
            >
              <span className="inline-flex items-center gap-2 justify-center">
                <KeyRound className="h-4 w-4" /> Admin / HR
              </span>
            </Tab>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs text-neutral-600">
                Username
              </Label>
              <Input
                data-testid="login-username-input"
                id="username"
                autoComplete="username"
                placeholder={tab === "admin" ? "admin" : "your.username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-neutral-600">
                Password
              </Label>
              <Input
                data-testid="login-password-input"
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <Button
              data-testid="login-submit-button"
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-xl text-white"
              style={{ backgroundColor: "#E05A2B" }}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-neutral-400 mt-6">
          Need access? Contact your HR or training manager.
        </p>
      </div>
    </div>
  );
}
