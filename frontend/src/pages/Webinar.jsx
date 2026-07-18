import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader2, Play, ExternalLink, X } from "lucide-react";

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-neutral-200/70">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/webinar" className="flex items-center gap-3" data-testid="brand">
          <img
            src="https://okiedokie-erp-images.s3.ap-south-1.amazonaws.com/Okie%20Dokie/2025/12/sourceURL/26aebcbe10f4ac5a3e8b-611ed1b9032568edd4f3-Okie_Dokie_App_icon__2___2_-removebg-preview.png"
            alt="Okie Dokie"
            className="h-8 w-8 rounded-xl object-contain"
          />
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              Okie Dokie
            </p>
            <p className="text-sm font-semibold -mt-0.5">Webinars</p>
          </div>
        </Link>
        <span className="text-xs text-neutral-500 hidden sm:block">
          Open access &middot; no login required
        </span>
      </div>
    </header>
  );
}

function getEmbedUrl(driveUrl) {
  const match = (driveUrl || "").match(/\/d\/([a-zA-Z0-9_-]+)/);
  const fileId = match ? match[1] : null;
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
}

function WebinarCard({ webinar, onPlay }) {
  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden flex flex-col transition-shadow hover:shadow-md">
      <div className="aspect-video bg-black relative overflow-hidden group">
        <button
          onClick={() => onPlay(webinar)}
          className="w-full h-full flex items-center justify-center gap-2 text-white text-sm font-medium"
        >
          <span
            className="h-9 w-9 rounded-full grid place-items-center transition-transform duration-200 group-hover:scale-110"
            style={{ backgroundColor: "#E05A2B" }}
          >
            <Play className="h-4 w-4 text-white ml-0.5" />
          </span>
          Play video
        </button>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <p className="text-sm font-medium text-neutral-900">{webinar.title}</p>
        {webinar.description && (
          <p className="text-xs text-neutral-500 mt-1 flex-1">{webinar.description}</p>
        )}
        <a
          href={webinar.drive_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-3 self-start"
        >
          <ExternalLink className="h-3 w-3" /> Open in Drive
        </a>
      </div>
    </div>
  );
}

export default function Webinar() {
  const [webinars, setWebinars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Animated player overlay state.
  // activeWebinar mounts the overlay; `visible` is flipped a tick later so
  // the CSS transition (opacity + scale) actually has a "from" state to
  // animate away from. Closing reverses the same way before unmounting.
  const [activeWebinar, setActiveWebinar] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listWebinars();
        setWebinars(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openPlayer = (webinar) => {
    setActiveWebinar(webinar);
    // Next frame, so the browser registers the initial (hidden) state
    // before flipping to visible - that's what makes it transition.
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  };

  const closePlayer = () => {
    setVisible(false);
    setTimeout(() => setActiveWebinar(null), 250);
  };

  useEffect(() => {
    if (!activeWebinar) return;
    const onKey = (e) => e.key === "Escape" && closePlayer();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeWebinar]);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <PublicHeader />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Recordings</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Webinars</h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Recorded sessions for training and reference.
          </p>
        </div>

        {loading ? (
          <div className="min-h-[30vh] grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : error ? (
          <p className="text-neutral-500 text-sm">Could not load webinars right now.</p>
        ) : webinars.length === 0 ? (
          <p className="text-neutral-500 text-sm">No webinars added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {webinars.map((w) => (
              <WebinarCard key={w.id} webinar={w} onPlay={openPlayer} />
            ))}
          </div>
        )}
      </main>

      {activeWebinar && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ease-out ${
            visible ? "opacity-100 bg-neutral-900/80 backdrop-blur-sm" : "opacity-0 bg-neutral-900/0"
          }`}
          onClick={closePlayer}
        >
          <div
            className={`bg-black rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl transition-all duration-300 ease-out ${
              visible ? "opacity-100 scale-100" : "opacity-0 scale-90"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 flex items-center justify-between bg-neutral-900">
              <p className="text-sm font-medium text-white truncate pr-4">{activeWebinar.title}</p>
              <button
                onClick={closePlayer}
                className="h-8 w-8 rounded-full grid place-items-center text-neutral-300 hover:text-white hover:bg-white/10 flex-shrink-0 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                src={getEmbedUrl(activeWebinar.drive_url)}
                title={activeWebinar.title}
                width="100%"
                height="100%"
                allow="autoplay"
                allowFullScreen
                style={{ border: "none" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
