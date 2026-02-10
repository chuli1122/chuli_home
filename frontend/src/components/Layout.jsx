import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookText, MessageCircle, Settings, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import LayeredBackground from "./LayeredBackground";

const dockItems = [
  { label: "Chat", icon: MessageCircle, path: null },
  { label: "记忆", icon: BookText, path: null },
  { label: "美化", icon: Palette, path: "/theme" },
  { label: "设置", icon: Settings, path: "/settings" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const hideDock = location.pathname === '/countdown' || location.pathname.startsWith('/theme') || location.pathname.startsWith('/settings');
  const isHome = location.pathname === '/';
  const [wallpaper, setWallpaper] = useState(null);
  const [dockStyle, setDockStyle] = useState({ opacity: 30, material: 'glass', color: '#ffffff', backgroundImage: null, iconOpacity: 100 });
  const [customIcons, setCustomIcons] = useState({});

  // Reset iOS residual scroll offset on route change
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);

  useEffect(() => {
    const loadSettings = () => {
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

      try {
        const savedStyles = JSON.parse(localStorage.getItem("component-styles"));
        if (savedStyles && savedStyles.dock) {
          setDockStyle(savedStyles.dock);
        }
      } catch (e) {
        console.error("Failed to load dock style", e);
      }
      
      try {
        const savedIcons = JSON.parse(localStorage.getItem("custom-icons") || "{}");
        setCustomIcons(savedIcons);
      } catch (e) {
        console.error("Failed to load custom icons", e);
      }
    };

    loadSettings();

    window.addEventListener('storage', loadSettings);
    window.addEventListener('component-style-updated', loadSettings);
    window.addEventListener('custom-icons-updated', loadSettings);
    
    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('component-style-updated', loadSettings);
      window.removeEventListener('custom-icons-updated', loadSettings);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("active-wallpaper"));
      if (saved && saved.scope === 'all') {
        setWallpaper(saved.url);
      } else {
        setWallpaper(null);
      }
    } catch (e) {}
  }, [location]);

  return (
    <div className="fixed inset-0 overflow-hidden text-text">
      {wallpaper && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${wallpaper})` }}
        />
      )}
      
      {!wallpaper && (
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/30 blur-3xl" />
      )}

      <div 
        className={`relative z-10 mx-auto h-full w-full ${
          hideDock 
            ? 'p-0' 
            : isHome 
              ? 'max-w-[420px] pt-[calc(2rem+env(safe-area-inset-top))]' 
              : 'max-w-[420px] px-5 pt-[calc(2rem+env(safe-area-inset-top))]'
        }`}
      >
        <Outlet />
      </div>

      {!hideDock && (
        <nav className="fixed bottom-10 left-1/2 z-20 w-[90%] max-w-[380px] -translate-x-1/2 rounded-[36px] px-8 py-4 shadow-2xl shadow-black/10">
          <LayeredBackground style={dockStyle} rounded="rounded-[36px]" />
          
          <div className="relative z-10 flex items-center justify-between">
            {dockItems.map((item) => {
              // Determine icon ID based on label for custom mapping
              let iconId = '';
              if (item.label === 'Chat') iconId = 'dock_chat';
              if (item.label === '记忆') iconId = 'dock_memory';
              if (item.label === '美化') iconId = 'dock_theme';
              if (item.label === '设置') iconId = 'dock_settings';
              
              const Icon = item.icon;
              const customUrl = customIcons[iconId];

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.path && navigate(item.path, { replace: true })}
                  className="flex flex-col items-center transition active:scale-95"
                >
                  <div className="relative h-14 w-14 rounded-[18px] shadow-lg shadow-black/10 overflow-hidden">
                    {/* Background Layer with Separate Opacity */}
                    <div 
                      className="absolute inset-0 bg-white/60 backdrop-blur-md transition-opacity duration-300"
                      style={{ opacity: (dockStyle.iconOpacity !== undefined ? dockStyle.iconOpacity : 100) / 100 }}
                    />
                    
                    {/* Content Layer */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {customUrl ? (
                        <img 
                          src={customUrl} 
                          alt={item.label} 
                          className="h-full w-full object-cover transition-opacity duration-300"
                          style={{ opacity: (dockStyle.iconOpacity !== undefined ? dockStyle.iconOpacity : 100) / 100 }}
                        />
                      ) : (
                        <Icon size={28} className="text-black relative z-10" />
                      )}
                    </div>
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
