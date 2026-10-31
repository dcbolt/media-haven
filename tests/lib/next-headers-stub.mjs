/** Minimal stub for route smokes that transitively import next/headers. */
export async function cookies() {
  return {
    get: () => undefined,
    set: () => {},
    delete: () => {},
  };
}

export async function headers() {
  return new Headers();
}
