import { useEffect } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import WorldBooks from "./pages/WorldBooks";
import WorldBookEdit from "./pages/WorldBookEdit";
import Assistants from "./pages/Assistants";
import AssistantEdit from "./pages/AssistantEdit";
import Settings from "./pages/Settings";
import ApiSettings from "./pages/ApiSettings";
import CotViewer from "./pages/CotViewer";
import Messages from "./pages/Messages";
import Memories from "./pages/Memories";
import Diary from "./pages/Diary";
import Profile from "./pages/Profile";

/* ── Viewport height sync ── */

function syncHeight() {
  const tg = window.Telegram?.WebApp;
  // Take the larger of Telegram's viewportHeight and window.innerHeight
  // to handle cases where one doesn't update during manual expansion.
  const h = Math.max(tg?.viewportHeight || 0, window.innerHeight);
  document.documentElement.style.setProperty("--tg-viewport-height", h + "px");
}

/* ── Route-aware shell: expand on non-COT pages ── */

function AppRoutes() {
  const location = useLocation();

  // Every time the user navigates to a non-COT page, ensure full screen
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg && !location.pathname.startsWith("/cot")) {
      tg.expand();
    }
    // Also sync height after navigation (expand may trigger it, but be safe)
    syncHeight();
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/world-books" element={<WorldBooks />} />
      <Route path="/world-books/new" element={<WorldBookEdit />} />
      <Route path="/world-books/:id" element={<WorldBookEdit />} />
      <Route path="/assistants" element={<Assistants />} />
      <Route path="/assistants/new" element={<AssistantEdit />} />
      <Route path="/assistants/:id" element={<AssistantEdit />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/settings/api" element={<ApiSettings />} />
      <Route path="/cot" element={<CotViewer />} />
      <Route path="/memories" element={<Memories />} />
      <Route path="/diary" element={<Diary />} />
      <Route path="/messages" element={<Messages />} />
    </Routes>
  );
}

/* ── App root ── */

export default function App() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      if (!window.location.hash.startsWith("#/cot")) {
        tg.expand();
      }
    }

    syncHeight();

    // Listen to BOTH Telegram's viewportChanged AND window resize.
    // Some WebView versions only fire one of the two.
    if (tg) tg.onEvent("viewportChanged", syncHeight);
    window.addEventListener("resize", syncHeight);

    return () => {
      if (tg) tg.offEvent("viewportChanged", syncHeight);
      window.removeEventListener("resize", syncHeight);
    };
  }, []);

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
