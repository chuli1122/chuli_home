import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import Countdown from "./pages/Countdown";
import ThemeSettings from "./pages/ThemeSettings";
import BackgroundSettings from "./pages/BackgroundSettings";
import ComponentSettings from "./pages/ComponentSettings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/theme" element={<ThemeSettings />} />
          <Route path="/theme/background" element={<BackgroundSettings />} />
          <Route path="/theme/components" element={<ComponentSettings />} />
          <Route path="/countdown" element={<Countdown />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
