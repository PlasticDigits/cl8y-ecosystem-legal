const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

async function waitForApi(maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/update_terms`, { method: "POST" });
      if (res.ok) return;
    } catch {
      // API still starting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API not ready at ${API_BASE} after ${maxMs}ms`);
}

async function ensureTermsPublished(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${API_BASE}/api/v1/terms/latest?property=cl8y.com`);
    if (res.ok) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Terms not published for cl8y.com");
}

export default async function globalSetup() {
  await waitForApi(120_000);
  await ensureTermsPublished();
}
