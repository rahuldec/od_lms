import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { drivePreviewUrl } from "@/lib/sheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-neutral-200/70">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/webinar" className="flex items-center gap-3" data-testid="brand">
          <div
            className="h-8 w-8 rounded-xl grid place-items-center text-white text-xs font-semibold"
            style={{ backgroundColor: "#E05A2B" }}
          >
            OD
          </div>
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

export default function PublicWebinar() {
  const [webinars, setWebinars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listWebinars();
        setWebinars(Array.isArray(data) ? data : []);
      } catch (e) {
        toast.error("Could not load webinars");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openWebinar = (w) => {
    const embedUrl = drivePreviewUrl(w.drive_url);
    if (!embedUrl) {
      toast.info("This recording link isn't playable yet");
      return;
    }
    setActive({ ...w, embedUrl });
  };

  const closeWebinar = () => setActive(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <PublicHeader />
        <div className="min-h-[40vh] grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <PublicHeader />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Recordings</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">
            Webinar Library
          </h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Watch past webinar recordings. No account needed.
          </p>
        </div>

        {webinars.length === 0 ? (
          <Card className="rounded-2xl border-neutral-200/80 p-10 text-center">
            <Video className="h-6 w-6 mx-auto text-neutral-300 mb-2" />
            <p className="text-neutral-500 text-sm">No webinars published yet.</p>
          </Card>
        ) : (
          <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
            <ul className="divide-y divide-neutral-100">
              {webinars.map((w) => (
                <li
                  key={w.id}
                  className="px-5 py-4 flex items-center gap-3.5 hover:bg-neutral-50/60 cursor-pointer transition-colors"
                  onClick={() => openWebinar(w)}
                >
                  <div
                    className="h-9 w-9 rounded-full grid place-items-center flex-shrink-0"
                    style={{ backgroundColor: "#E1F5EE" }}
                  >
                    <Video className="h-4 w-4" style={{ color: "#085041" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{w.title}</p>
                    {w.description && (
                      <p className="text-xs text-neutral-500 truncate mt-0.5">{w.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>

      {active && (
        <div
          className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeWebinar}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100">
              <div className="min-w-0">
                <p className="font-semibold truncate">{active.title}</p>
                {active.description && (
                  <p className="text-xs text-neutral-500 mt-0.5 truncate">{active.description}</p>
                )}
              </div>
              <Button variant="ghost" onClick={closeWebinar} className="rounded-full">
                <X className="h-4 w-4 mr-1" />
                Close
              </Button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                title={active.title}
                src={active.embedUrl}
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
