import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initChatTheme } from "./utils/chatTheme";

// Disable browser's scroll restoration to prevent interference with our scroll logic
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

initChatTheme();

const root = createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
