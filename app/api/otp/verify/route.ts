import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { mobile, otp } = await req.json();
  const authkey = process.env.MSG91_AUTHKEY;
  if (!authkey) {
    // Demo mode: fixed code so the flow can be tested before MSG91 is configured.
    return NextResponse.json({ verified: otp === "123456", error: otp === "123456" ? undefined : "Incorrect OTP (demo code is 123456)." });
  }
  const url = `https://control.msg91.com/api/v5/otp/verify?mobile=${mobile}&otp=${otp}`;
  const r = await fetch(url, { method: "GET", headers: { authkey } });
  const j = await r.json().catch(() => ({}));
  if (j?.type === "success") return NextResponse.json({ verified: true });
  return NextResponse.json({ verified: false, error: j?.message || "Incorrect OTP." });
}
