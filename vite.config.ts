import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    proxy: {
      "/api": {
        target: process.env.PLANNER_API_PROXY ?? "http://127.0.0.1:8787",
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, request) => {
            if (request.headers.host) proxyRequest.setHeader("x-forwarded-host", request.headers.host);
          });
        },
      },
    },
  },
  plugins: [
    {
      name: "embed-readme",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.startsWith("/share/data/")) request.url = request.url.replace(/^\/share/, "");
          else if (request.url === "/share/README.md") request.url = "/README.md";
          else if (request.url === "/share/docs/USER_GUIDE.md") request.url = "/docs/USER_GUIDE.md";
          if (request.url === "/data/new-event-map.json") request.url = "/New%20event/new-event-map.json";
          next();
        });
      },
      generateBundle() {
        const assets: Array<[string, string]> = [
          ["README.md", "README.md"],
          ["docs/USER_GUIDE.md", "docs/USER_GUIDE.md"],
          ["data/gene-clash-map.json", "data/gene-clash-map.json"],
          ["data/game-config.json", "data/game-config.json"],
          ["data/map-manifest.json", "data/map-manifest.json"],
          ["data/map-catalog.json", "data/map-catalog.json"],
          ["data/winter-map.json", "data/winter-map.json"],
          ["New event/new-event-map.json", "data/new-event-map.json"],
        ];
        for (const [sourceName, fileName] of assets) {
          this.emitFile({ type: "asset", fileName, source: readFileSync(sourceName) });
        }
      },
    },
  ],
  build: { target: "es2022", sourcemap: true },
});
