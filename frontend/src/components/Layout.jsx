import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookText, MessageCircle, Settings, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import LayeredBackground from "./LayeredBackground";

const dockItems = [
  { label: "Chat", icon: MessageCircle, path: "/chat" },
  { label: "记忆", icon: BookText, path: "/" },
  { label: "美化", icon: Palette, path: "/theme" },
  { label: "设置", icon: Settings, path: "/settings" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const hideDock = location.pathname === '/countdown' || location.pathname.startsWith('/theme');
  const [wallpaper, setWallpaper] = useState(null);
  const [dockStyle, setDockStyle] = useState({ opacity: 30, material: 'glass', color: '#ffffff', backgroundImage: null });

  useEffect(() => {
    window.scrollTo(0, 0);
    
    const loadSettings = () => {
      // Load wallpaper
      try {
        const saved = JSON.parse(localStorage.getItem("active-wallpaper"));
        if (saved && saved.scope === 'all') {
          setWallpaper(saved.url);
        } else {
          setWallpaper(null);
        }
      } catch (e) {
        console.error("Failed to load wallpaper", e);
      }

      // Load dock style
      try {
        const savedStyles = JSON.parse(localStorage.getItem("component-styles"));
        if (savedStyles && savedStyles.dock) {
          setDockStyle(savedStyles.dock);
        }
      } catch (e) {
        console.error("Failed to load dock style", e);
      }
    };

    loadSettings();

    window.addEventListener('storage', loadSettings);
    window.addEventListener('component-style-updated', loadSettings);
    
    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('component-style-updated', loadSettings);
    };
  }, []);

  // Re-check wallpaper on location change (e.g. returning from settings)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("active-wallpaper"));
      if (saved && saved.scope === 'all') {
        setWallpaper(saved.url);
      } else {
        setWallpaper(null);
      }
    } catch (e) {
      // ignore
    }
  }, [location]);

  return (
    <div className="relative h-screen min-h-[-webkit-fill-available] overflow-hidden text-text">
      {/* Global Wallpaper Background */}
      {wallpaper && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${wallpaper})` }}
        />
      )}
      
      {/* Background blobs (only show if no wallpaper) */}
      {!wallpaper && (
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/30 blur-3xl" />
      )}

      <div 
        className={`relative z-10 mx-auto h-full w-full overflow-hidden ${
          hideDock ? 'p-0' : 'max-w-[420px] px-5 pt-[calc(2rem+env(safe-area-inset-top))]'
        }`}
      >
        <Outlet />
      </div>

      {!hideDock && (
        <nav className="fixed bottom-10 left-1/2 z-20 w-[90%] max-w-[380px] -translate-x-1/2 rounded-[36px] px-8 py-4 shadow-2xl shadow-black/10">
          <LayeredBackground style={dockStyle} rounded="rounded-[36px]" />
          
          <div className="relative z-10 flex items-center justify-between">
            {dockItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="flex flex-col items-center transition active:scale-95"
                >
                  <div className={`flex h-14 w-14 items-center justify-center rounded-[18px] shadow-lg shadow-black/10 backdrop-blur-md transition-colors ${
                    isActive ? 'bg-white text-black' : 'bg-white/60 text-black/70'
                  }`}>
                    <Icon size={28} />
                  </div>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
