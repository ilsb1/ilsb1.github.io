import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./desk.css";
import "./workspace.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
