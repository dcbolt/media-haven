import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function aliasToFile(specifier) {
  if (!specifier.startsWith("@/")) return null;
  return fileURLToPath(
    new URL(`../../${specifier.slice(2)}.ts`, import.meta.url)
  );
}

const hostAuthMock = `
export async function isHostAuthenticated() { return true; }
export async function isCustomAccessCode() { return false; }
export async function verifyAccessCode() { return false; }
export async function hostIdentity() { return null; }
export async function signInWithAccessCode() { return false; }
export async function signOutHost() {}
`;

const nextServerMock = `
export class NextResponse {
  static json(data, init = {}) {
    const status = init.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => data,
    };
  }
}
export class NextRequest {
  json() { return {}; }
}
`;

function supabaseMockSource() {
  const huge = Number(process.env.SIGNAGE_PROBE_HUGE ?? "157286442");
  return `
export function supabaseAdmin() {
  return {
    from() {
      return {
        select() {
          const bulkRows = () =>
            globalThis.__signageProbeBulkRows ?? [
              {
                id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
                settings: {},
              },
            ];
          const rowSettings = () =>
            globalThis.__signageProbeSettings ?? {};
          const bulkPromise = Promise.resolve({
            data: bulkRows(),
            error: null,
          });
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { settings: rowSettings() },
                  error: null,
                }),
              };
            },
            then(onFulfilled, onRejected) {
              return bulkPromise.then(onFulfilled, onRejected);
            },
          };
        },
        update(payload) {
          globalThis.__signageCapturedSettings = payload.settings;
          globalThis.__signageCapturedBulk =
            globalThis.__signageCapturedBulk ?? [];
          globalThis.__signageCapturedBulk.push(payload.settings);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    storage: {
      from() {
        return {
          list: async (_folder, opts) => {
            const name = opts?.search ?? "clip.mp4";
            const size = name === "big.mp4" || name.includes("big") ? ${huge} : 1000;
            return {
              data: [{ name, id: "1", metadata: { size, mimetype: "video/mp4" } }],
              error: null,
            };
          },
        };
      },
    },
  };
}
`;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes("next/server")) {
    return {
      url: `data:text/javascript,${encodeURIComponent(nextServerMock)}`,
      format: "module",
      shortCircuit: true,
    };
  }

  const aliasFile = aliasToFile(specifier);
  if (aliasFile) {
    if (aliasFile.includes("host-auth")) {
      return {
        url: `data:text/javascript,${encodeURIComponent(hostAuthMock)}`,
        format: "module",
        shortCircuit: true,
      };
    }
    if (aliasFile.endsWith("/lib/supabase.ts")) {
      return {
        url: `data:text/javascript,${encodeURIComponent(supabaseMockSource())}`,
        format: "module",
        shortCircuit: true,
      };
    }
    return nextResolve(pathToFileURL(aliasFile).href, context);
  }

  if (specifier.startsWith(".") && context.parentURL) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
      const candidate = `${parentDir}/${specifier.replace(/^\.\//, "")}${ext}`;
      if (existsSync(candidate)) {
        if (candidate.endsWith("/lib/supabase.ts")) {
          return {
            url: `data:text/javascript,${encodeURIComponent(supabaseMockSource())}`,
            format: "module",
            shortCircuit: true,
          };
        }
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  const resolved = await nextResolve(specifier, context);
  if (resolved.url.includes("/lib/supabase.ts")) {
    return {
      url: `data:text/javascript,${encodeURIComponent(supabaseMockSource())}`,
      format: "module",
      shortCircuit: true,
    };
  }
  return resolved;
}
