var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.get("/api/tmdb/search/multi", async (req, res) => {
    try {
      const apiKey = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "TMDB API key is missing." });
      }
      const { query } = req.query;
      const url = new URL("https://api.themoviedb.org/3/search/multi");
      url.searchParams.append("api_key", apiKey);
      url.searchParams.append("language", "es-ES");
      url.searchParams.append("query", String(query || ""));
      const response = await fetch(url.toString());
      if (!response.ok) {
        return res.status(response.status).json({ error: `TMDB API Error: ${response.status}` });
      }
      const data = await response.json();
      return res.json(data);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
  app.get("/api/tmdb/:mediaType/:id", async (req, res) => {
    try {
      const apiKey = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "TMDB API key is missing." });
      }
      const { mediaType, id } = req.params;
      if (mediaType !== "movie" && mediaType !== "tv") {
        return res.status(400).json({ error: "Invalid mediaType" });
      }
      const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${id}`);
      url.searchParams.append("api_key", apiKey);
      url.searchParams.append("language", "es-ES");
      url.searchParams.append("append_to_response", "videos,credits,watch/providers");
      const response = await fetch(url.toString());
      if (!response.ok) {
        return res.status(response.status).json({ error: `TMDB API Error: ${response.status}` });
      }
      const data = await response.json();
      return res.json(data);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
