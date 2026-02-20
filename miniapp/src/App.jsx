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

    if (tg) {
      tg.ready();
      // COT page stays half-screen; all other pages expand
      if (!window.location.hash.startsWith("#/cot")) {
        tg.expand();
      }
      // The Telegram SDK automatically manages --tg-viewport-height
      // on the <html> element. Do NOT override it — our old code was
      // setting it to viewportStableHeight which lags behind during
      // expand animation, causing the bottom of pages to be cut off.
      return;
    }

    // Non-Telegram fallback: manually set viewport height
    const setHeight = () => {
      document.documentElement.style.setProperty(
        "--tg-viewport-height",
        window.innerHeight + "px",
      );
    };
    setHeight();
    window.addEventListener("resize", setHeight);
    return () => window.removeEventListener("resize", setHeight);
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
