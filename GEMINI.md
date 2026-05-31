# F1 Dashboard Project Instructions

## Architecture & Conventions
- **Timezone:** All time-related logic and UI displays MUST use **Indian Standard Time (IST)**.
- **Resilience:** Prefer CSS-based technical patterns over unreliable external image assets for UI decoration.
- **Assets:** Use the `TeamLogo` component for all driver/constructor logos to ensure proper error handling and fallback acronyms.
- **Styling:** Follow the MKBHD "Studio" aesthetic: matte blacks (`#0a0a0a`), vibrant reds (`#cc0000`), and clean typography (Inter). Use CSS grids for data rows to prevent text merging.
- **Backend:** FastAPI serves as a proxy to OpenF1 and Jolpica APIs with historical data fallbacks for accuracy.
- **Frontend:** React with TypeScript and Framer Motion for high-fidelity animations.

## Workflows
- **Running the App:** Use `./run-dashboard.sh start` to launch both services.
- **Mock Data:** Use the "Toggle Simulation" (Zap icon) in the UI to test live session components.
- **Circuit Analysis:** Access technical circuit data via the archive's "Play" buttons.
