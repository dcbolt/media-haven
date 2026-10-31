import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const loader = fileURLToPath(
  new URL("./tv-report-route-loader.mjs", import.meta.url)
);
register(loader, pathToFileURL(import.meta.url));
