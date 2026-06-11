import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PreviewApp from "./PreviewApp";
import "./index.css";

// Окно превью грузит тот же бандл с ?window=preview (так его создаёт Rust).
const isPreview = new URLSearchParams(window.location.search).get("window") === "preview";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Корневой элемент #root не найден");
createRoot(rootElement).render(<StrictMode>{isPreview ? <PreviewApp /> : <App />}</StrictMode>);
