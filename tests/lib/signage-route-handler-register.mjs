import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const loader = fileURLToPath(
  new URL("./signage-route-handler-loader.mjs", import.meta.url)
);
register(loader, pathToFileURL(import.meta.url));
