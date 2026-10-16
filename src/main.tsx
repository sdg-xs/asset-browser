import { createRoot } from "react-dom/client";
import "./design-system-fonts.css";
import "./styles.css";
import { App } from "./App.js";
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root.");
createRoot(root).render(<App />);
