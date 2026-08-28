import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EnglishGuardApp } from "@/components/english-guard-app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <EnglishGuardApp localMode />
  </StrictMode>,
);
