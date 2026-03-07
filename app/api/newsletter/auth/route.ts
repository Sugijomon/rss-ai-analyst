import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.REVIEW_PASSWORD;
  if (!correct) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: password === correct });
}
