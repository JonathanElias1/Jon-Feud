import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";                 // <-- important
import FamilyFeudApp from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FamilyFeudApp />
  </React.StrictMode>
);