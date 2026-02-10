import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Countdown from "./pages/Countdown";
import ThemeSettings from "./pages/ThemeSettings";
import BackgroundSettings from "./pages/BackgroundSettings";
import ComponentSettings from "./pages/ComponentSettings";
import IconSettings from "./pages/IconSettings";
import FontSettings from "./pages/FontSettings";
import AppSettings from "./pages/AppSettings";
import ApiSettings from "./pages/ApiSettings";
import { useEffect } from "react";
import { getAllFonts } from "./utils/db";

// Component to handle global style injection
const GlobalStyleInjector = () => {
  useEffect(() => {
    // 1. Wallpaper
    try {
      const saved = JSON.parse(localStorage.getItem("active-wallpaper"));
      if (saved && saved.scope === 'global') {
        const root = document.getElementById('root');
        if (root) {
          root.style.backgroundImage = `url(${saved.url})`;
          root.style.backgroundSize = 'cover';
          root.style.backgroundPosition = 'center';
          root.style.backgroundRepeat = 'no-repeat';
        }
      }
    } catch (e) {
      console.error("Failed to load wallpaper", e);
    }

    // 2. Fonts
    const loadFontSettings = async () => {
      try {
        // Inject Custom Fonts from DB
        const fonts = await getAllFonts();
        fonts.forEach(font => {
          const styleId = `font-face-${font.id}`;
          if (document.getElementById(styleId)) return;

          const style = document.createElement('style');
          style.id = styleId;
          
          let src = '';
          if (font.type === 'url') {
            src = `url('${font.source}')`;
          } else if (font.type === 'file') {
            const blob = new Blob([font.source], { type: font.mimeType });
            const url = URL.createObjectURL(blob);
            src = `url('${url}')`;
          }

          style.textContent = `
            @font-face {
              font-family: '${font.name}';
              src: ${src};
              font-display: swap;
            }
          `;
          document.head.appendChild(style);
        });

        // Apply Global Settings
        const savedSettings = JSON.parse(localStorage.getItem("font-settings"));
        if (savedSettings) {
          const root = document.documentElement;
          
          // Font Family
          let fontFamily = 'system-ui, -apple-system, sans-serif';
          if (savedSettings.activeFontId !== 'system-ui') {
            const customFont = fonts.find(f => f.id === savedSettings.activeFontId);
            // Check system fonts mapping
            if (customFont) fontFamily = customFont.name;
            else if (savedSettings.activeFontId === 'serif') fontFamily = 'serif';
            else if (savedSettings.activeFontId === 'mono') fontFamily = 'monospace';
            else if (savedSettings.activeFontId === 'cursive') fontFamily = 'cursive';
          }
          root.style.setProperty('--app-font-family', fontFamily);
          
          // Font Size
          root.style.setProperty('--app-font-size-scale', `${savedSettings.fontSizeScale / 100}`);
        }
      } catch (e) {
        console.error("Failed to load font settings", e);
      }
    };

    loadFontSettings();
    window.addEventListener('font-settings-updated', loadFontSettings);
    return () => window.removeEventListener('font-settings-updated', loadFontSettings);
  }, []);

  return null;
};

export default function App() {
  return (
    <BrowserRouter>
      <GlobalStyleInjector />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/theme" element={<ThemeSettings />} />
          <Route path="/theme/background" element={<BackgroundSettings />} />
          <Route path="/theme/components" element={<ComponentSettings />} />
          <Route path="/theme/icons" element={<IconSettings />} />
          <Route path="/theme/font" element={<FontSettings />} />
          <Route path="/settings" element={<AppSettings />} />
          <Route path="/settings/api" element={<ApiSettings />} />
          <Route path="/countdown" element={<Countdown />} />
          {/* Redirect unknown routes to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
