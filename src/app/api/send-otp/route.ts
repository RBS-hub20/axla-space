import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: dbError } = await supabase
      .from('OtpToken')
      .upsert({ email: trimmedEmail, token: otp, expires_at: expiresAt }, { onConflict: 'email' });

    if (dbError) return NextResponse.json({ error: 'DB Error: ' + dbError.message }, { status: 500 });

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: trimmedEmail,
      subject: `${otp} is your Axla verification code`,
      html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px;text-align:center"><h1>Your Axla Code</h1><div style="background:#f1f5f9;padding:20px;border-radius:12px;font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</div><p>This code expires in 10 minutes.</p></div>`
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
