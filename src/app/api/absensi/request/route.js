// src/app/api/absensi/request/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { nik, nama, tanggal, shiftCodeReq, jamIn, jamOut, alasan, base64Photo } = await req.json();
    if (!nik || !nama || !tanggal || !alasan) {
      return NextResponse.json({ success: false, message: "Data wajib tidak lengkap." });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Upload lampiran foto (opsional)
    let photoUrl = "";
    if (base64Photo && base64Photo.indexOf(",") !== -1) {
      try {
        const buffer = Buffer.from(base64Photo.split(",")[1], "base64");
        const fileName = `REQ_${nik}_${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("absensi-photos")
          .upload(fileName, buffer, { contentType: "image/jpeg" });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("absensi-photos").getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
        }
      } catch (e) { /* abaikan, request tetap lanjut tanpa lampiran */ }
    }

    const reqId = "REQ-" + Date.now();
    const nowStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date());

    const { error: insErr } = await supabase.from("absensi_request").insert({
      req_id: reqId,
      waktu_submit: nowStr,
      nik,
      nama,
      tanggal_absen: tanggal,
      shift_baru: shiftCodeReq || "-",
      jam_in_baru: jamIn || "-",
      jam_out_baru: jamOut || "-",
      alasan,
      status: "Pending",
      tanggal_action: "-",
      foto_lampiran: photoUrl,
      catatan_admin: "-"
    });
    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({ success: true, reqId });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
