import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./styles.css";
import { App } from "./App.js";
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root.");
createRoot(root).render(<App />);
