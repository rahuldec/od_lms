import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ChevronDown } from "lucide-react";

const NavLink = ({ to, label, testId }) => {
  const loc = useLocation();
  const active = loc.pathname === to || loc.pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      data-testid={testId}
      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-600 hover:text-neutral-900"
      }`}
    >
      {label}
    </Link>
  );
};

const NavGroup = ({ label, items, testId }) => {
  const loc = useLocation();
  const active = items.some(
    (n) => loc.pathname === n.to || loc.pathname.startsWith(n.to + "/")
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid={testId}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
            active
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {items.map((n) => {
          const itemActive =
            loc.pathname === n.to || loc.pathname.startsWith(n.to + "/");
          return (
            <DropdownMenuItem key={n.to} asChild>
              <Link
                to={n.to}
                data-testid={n.testId}
                className={itemActive ? "font-medium text-neutral-900" : ""}
              >
                {n.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Groups consecutive nav items by their `group` field, preserving order.
// Items without a `group` render as plain links; items sharing a `group`
// are collapsed into a single dropdown labeled with that group name.
function buildNavGroups(navItems) {
  const groups = [];
  for (const item of navItems) {
    if (item.group) {
      const last = groups[groups.length - 1];
      if (last && last.group === item.group) {
        last.items.push(item);
      } else {
        groups.push({ group: item.group, items: [item] });
      }
    } else {
      groups.push({ group: null, items: [item] });
    }
  }
  return groups;
}

export default function AppShell({ children, navItems = [], subtitle }) {
  const { signOut, trainee, role } = useAuth();
  const navigate = useNavigate();
  const navGroups = buildNavGroups(navItems);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-neutral-200/70">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="brand">
            <img
              src="https://okiedokie-erp-images.s3.ap-south-1.amazonaws.com/Okie%20Dokie/2025/12/sourceURL/26aebcbe10f4ac5a3e8b-611ed1b9032568edd4f3-Okie_Dokie_App_icon__2___2_-removebg-preview.png"
              alt="Okie Dokie"
              className="h-8 w-8 rounded-xl object-contain"
            />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                Okie Dokie
              </p>
              <p className="text-sm font-semibold -mt-0.5">{subtitle || "Training Tracker"}</p>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navGroups.map((g, i) =>
              g.group ? (
                <NavGroup
                  key={g.group}
                  label={g.group}
                  items={g.items}
                  testId={`nav-group-${g.group.toLowerCase().replace(/\s+/g, "-")}`}
                />
              ) : (
                <NavLink key={g.items[0].to} {...g.items[0]} />
              )
            )}
          </nav>
          <div className="flex items-center gap-3">
            {role === "trainee" && trainee && (
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium leading-none">{trainee.name}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Level {trainee.current_level ?? 0}
                </p>
              </div>
            )}
            {role === "admin" && (
              <span className="text-xs text-neutral-500 hidden sm:block">
                Admin
              </span>
            )}
            <Button
              data-testid="signout-button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/", { replace: true });
              }}
              className="rounded-full"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
