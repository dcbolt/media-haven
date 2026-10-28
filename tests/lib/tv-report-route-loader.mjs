import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function aliasToFile(specifier) {
  if (!specifier.startsWith("@/")) return null;
  return fileURLToPath(
    new URL(`../../${specifier.slice(2)}.ts`, import.meta.url)
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  const aliasFile = aliasToFile(specifier);
  if (aliasFile) {
    return nextResolve(pathToFileURL(aliasFile).href, context);
  }

  if (specifier.startsWith(".") && context.parentURL) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
      const candidate = `${parentDir}/${specifier.replace(/^\.\//, "")}${ext}`;
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
