export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = process.env.GOOGLE_SHEETS_URL;
  const secret = process.env.GOOGLE_SHEETS_SECRET;

  if (!url || !secret) {
    res
      .status(500)
      .json({
        ok: false,
        error: "Sheets integration not configured. Contact your administrator.",
      });
    return;
  }

  const { projects, project, action } = req.body ?? {};
  if (!Array.isArray(projects) && !project && action !== "delete") {
    res.status(400).json({ ok: false, error: "Invalid request." });
    return;
  }

  try {
    // Forward the incoming payload to the Apps Script worker, attaching the secret.
    const payload = { secret, ...(req.body || {}) };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
