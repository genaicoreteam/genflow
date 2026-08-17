import { NextResponse } from "next/server";

// MSG91 Send OTP. Falls back to demo mode (code 123456) when MSG91 keys are not configured.
export async function POST(req: Request) {
  const { mobile } = await req.json();
  if (!mobile || String(mobile).length < 10)
    return NextResponse.json({ error: "Enter a valid phone number with country code." }, { status: 400 });

  const authkey = process.env.MSG91_AUTHKEY;
  const template = process.env.MSG91_OTP_TEMPLATE_ID;
  if (!authkey || !template) return NextResponse.json({ ok: true, demo: true });

  const url = `https://control.msg91.com/api/v5/otp?template_id=${template}&mobile=${mobile}`;
  const r = await fetch(url, { method: "POST", headers: { authkey } });
  const j = await r.json().catch(() => ({}));
  if (j?.type === "success") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: j?.message || "MSG91 could not send the OTP." }, { status: 502 });
}
