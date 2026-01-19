import { Outlet } from "react-router-dom";
import { BookText, MessageCircle, Settings, Palette } from "lucide-react";

const dockItems = [
  { label: "Chat", icon: MessageCircle },
  { label: "记忆", icon: BookText },
  { label: "美化", icon: Palette },
  { label: "设置", icon: Settings },
];

export default function Layout() {
  return (
    <div className="relative min-h-screen overflow-hidden text-text">
      {/* Background blobs can remain, but remove bg-app to show body gradient */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-white/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/30 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[420px] px-5 pb-32 pt-8">
        <Outlet />
      </div>

      <nav className="fixed bottom-8 left-1/2 z-20 w-[90%] max-w-[380px] -translate-x-1/2 rounded-[36px] bg-white/30 px-8 py-4 shadow-2xl shadow-black/10 backdrop-blur-2xl border border-white/20">
        <div className="flex items-center justify-between">
          {dockItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className="flex flex-col items-center gap-1.5 transition active:scale-95"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/60 text-black shadow-lg shadow-black/10 backdrop-blur-md">
                  <Icon size={28} />
                </div>
                <span className="text-[13px] font-medium text-text/80">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
