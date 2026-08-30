// src/app/api/absensi/submit/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hitungJamKerja, hitungLateEarlyDurasi, getRemarks } from '@/lib/absensiHelpers';

function jakartaIsoDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function jakartaTimeHHMM() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

export async function POST(req) {
  try {
    const { nik, nama, tipeAbsen, shiftCode, base64Photo } = await req.json();
    if (!nik || !tipeAbsen) {
      return NextResponse.json({ success: false, message: "Data tidak lengkap." });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const todayStr = jakartaIsoDate(0);
    const yesterdayStr = jakartaIsoDate(-1);
    const timeStr = jakartaTimeHHMM();

    // 1. Upload foto ke Supabase Storage (kalau gagal, absen tetap lanjut tanpa foto)
    let photoUrl = "";
    if (base64Photo && base64Photo.indexOf(",") !== -1) {
      try {
        const buffer = Buffer.from(base64Photo.split(",")[1], "base64");
        const fileName = `${nik}_${String(tipeAbsen).replace(/\s+/g, "")}_${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("absensi-photos")
          .upload(fileName, buffer, { contentType: "image/jpeg" });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("absensi-photos").getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
        }
      } catch (e) { /* abaikan */ }
    }

    // 2. Cari baris log yang relevan
    let targetRow = null;

    if (tipeAbsen === "Clock Out") {
      // KECERDASAN LINTAS HARI: cari baris menggantung (sudah In, belum Out) dari hari ini atau kemarin
      const { data: candidates } = await supabase
        .from("absensi_log")
        .select("*")
        .eq("nik", nik)
        .in("tanggal", [todayStr, yesterdayStr])
        .order("tanggal", { ascending: false });
      targetRow = (candidates || []).find(
        r => r.clock_in && r.clock_in !== "-" && (!r.clock_out || r.clock_out === "-")
      ) || null;
    }

    if (!targetRow) {
      const { data: todayRows } = await supabase
        .from("absensi_log")
        .select("*")
        .eq("nik", nik)
        .eq("tanggal", todayStr)
        .limit(1);
      targetRow = (todayRows && todayRows[0]) || null;
    }

    // 3. Tentukan kode shift final
    const sc = (targetRow && targetRow.shift && targetRow.shift !== "-") ? targetRow.shift : (shiftCode || "XX");
    const shiftDetails = hitungJamKerja(sc);

    if (targetRow) {
      // ANTI DOUBLE-ABSEN
      if (tipeAbsen === "Clock In" && targetRow.clock_in && targetRow.clock_in !== "-") {
        return NextResponse.json({
          success: false,
          message: `Anda SUDAH melakukan Clock In pada jam ${targetRow.clock_in}.\n\nJika ini error, silakan ajukan 'Request Attendance'.`
        });
      }
      if (tipeAbsen === "Clock Out" && targetRow.clock_out && targetRow.clock_out !== "-") {
        return NextResponse.json({
          success: false,
          message: `Anda SUDAH melakukan Clock Out pada jam ${targetRow.clock_out}.\n\nJika ini error, silakan ajukan 'Request Attendance'.`
        });
      }

      const newIn = tipeAbsen === "Clock In" ? timeStr : targetRow.clock_in;
      const newOut = tipeAbsen === "Clock Out" ? timeStr : targetRow.clock_out;
      const calculated = hitungLateEarlyDurasi(newIn, newOut, shiftDetails.jam);
      const remarks = getRemarks(newIn, newOut, shiftDetails.isOff, calculated.late, calculated.early);

      const updatePayload = {
        shift: sc,
        remarks,
        late_in: calculated.late,
        early_out: calculated.early,
        durasi_kerja: calculated.durasi
      };
      if (tipeAbsen === "Clock In") {
        updatePayload.clock_in = timeStr;
        if (photoUrl) updatePayload.foto_in = photoUrl;
      } else {
        updatePayload.clock_out = timeStr;
        if (photoUrl) updatePayload.foto_out = photoUrl;
      }

      const { error: updErr } = await supabase.from("absensi_log").update(updatePayload).eq("id", targetRow.id);
      if (updErr) throw new Error(updErr.message);
    } else {
      const cIn = tipeAbsen === "Clock In" ? timeStr : null;
      const cOut = tipeAbsen === "Clock Out" ? timeStr : null;
      const calculated = hitungLateEarlyDurasi(cIn, cOut, shiftDetails.jam);
      const remarks = getRemarks(cIn, cOut, shiftDetails.isOff, calculated.late, calculated.early);

      const { error: insErr } = await supabase.from("absensi_log").insert({
        tanggal: todayStr,
        nik, nama,
        shift: sc,
        remarks,
        clock_in: cIn,
        clock_out: cOut,
        late_in: calculated.late,
        early_out: calculated.early,
        durasi_kerja: calculated.durasi,
        foto_in: tipeAbsen === "Clock In" ? photoUrl : null,
        foto_out: tipeAbsen === "Clock Out" ? photoUrl : null
      });
      if (insErr) throw new Error(insErr.message);
    }

    return NextResponse.json({ success: true, waktu: timeStr, tanggal: todayStr, tipe: tipeAbsen });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
