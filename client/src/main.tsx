import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeAdMob } from "./components/ads/AdMob";

// Initialize Google AdMob SDK
initializeAdMob();

createRoot(document.getElementById("root")!).render(<App />);
