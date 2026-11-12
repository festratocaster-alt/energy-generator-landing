import { hydrateRoot } from "react-dom/client";
import Home from "../../app/page";
import "../../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("ENERGY root is missing");
hydrateRoot(root, <Home leadEndpoint="/api/leads.php" />, { identifierPrefix: "energy-" });
