import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
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

export default function App() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    // Use viewportHeight (real-time) — NOT viewportStableHeight which
    // lags behind during expand/collapse animations.
    const syncHeight = () => {
      const h = tg?.viewportHeight || window.innerHeight;
      document.documentElement.style.setProperty("--tg-viewport-height", h + "px");
    };

    if (tg) {
      tg.ready();
      if (!window.location.hash.startsWith("#/cot")) {
        tg.expand();
      }
      syncHeight();
      tg.onEvent("viewportChanged", syncHeight);
      return () => tg.offEvent("viewportChanged", syncHeight);
    }

    syncHeight();
    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, []);

  return (
    <HashRouter>
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
    </HashRouter>
  );
}
