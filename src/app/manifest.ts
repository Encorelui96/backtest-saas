import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Backtest Lab",
    short_name: "Backtest Lab",
    description: "Backtests et suivi en direct de stratégies de trading crypto.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e14",
    theme_color: "#121722",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
