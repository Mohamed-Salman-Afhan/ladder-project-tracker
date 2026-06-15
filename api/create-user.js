import { createUserCore } from "./_createUser.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { email, role } = req.body ?? {};
  const { status, body } = await createUserCore({ token, email, role });
  res.status(status).json(body);
}
