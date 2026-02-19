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
import Profile from "./pages/Profile";

export default function App() {
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
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
      </Routes>
    </HashRouter>
  );
}
