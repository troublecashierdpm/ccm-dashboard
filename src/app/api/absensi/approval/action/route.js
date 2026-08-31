// src/app/api/absensi/approval/action/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hitungJamKerja, hitungLateEarlyDurasi, getRemarks } from '@/lib/absensiHelpers';

export async function POST(req) {
  try {
    const { reqId, actionStatus, adminMessage } = await req.json();
    if (!reqId || !actionStatus) {
      return NextResponse.json({ success: false, message: "Data tidak lengkap." });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: reqRows, error: findErr } = await supabase
      .from("absensi_request").select("*").eq("req_id", reqId).limit(1);
    if (findErr) throw new Error(findErr.message);
    const reqData = reqRows && reqRows[0];
    if (!reqData) return NextResponse.json({ success: false, message: "Request tidak ditemukan!" });

    const nowStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date());

    // 1. Update status request
    const { error: updReqErr } = await supabase.from("absensi_request").update({
      status: actionStatus,
      tanggal_action: nowStr,
      catatan_admin: adminMessage || "-"
    }).eq("req_id", reqId);
    if (updReqErr) throw new Error(updReqErr.message);

    // 2. Kalau Approved: cascading update ke master_schedule & log
    if (actionStatus === "Approved") {
      const nik = reqData.nik;
      const tanggal = reqData.tanggal_absen;
      const shiftReq = (reqData.shift_baru && reqData.shift_baru !== "-") ? reqData.shift_baru : "";
      const inBaru = (reqData.jam_in_baru && reqData.jam_in_baru !== "-") ? reqData.jam_in_baru : "";
      const outBaru = (reqData.jam_out_baru && reqData.jam_out_baru !== "-") ? reqData.jam_out_baru : "";

      let finalShiftCode = "XX";
      if (shiftReq) {
        finalShiftCode = shiftReq;
        const { data: existingSchedule } = await supabase
          .from("absensi_master_schedule").select("id").eq("nik", nik).eq("tanggal", tanggal).limit(1);
        if (existingSchedule && existingSchedule[0]) {
          await supabase.from("absensi_master_schedule").update({ shift_code: shiftReq }).eq("id", existingSchedule[0].id);
        } else {
          await supabase.from("absensi_master_schedule").insert({ nik, tanggal, shift_code: shiftReq });
        }
      } else {
        const { data: jadwalRows } = await supabase
          .from("absensi_master_schedule").select("shift_code").eq("nik", nik).eq("tanggal", tanggal).limit(1);
        if (jadwalRows && jadwalRows[0] && jadwalRows[0].shift_code) finalShiftCode = jadwalRows[0].shift_code;
      }

      const { data: logRows } = await supabase
        .from("absensi_log").select("*").eq("nik", nik).eq("tanggal", tanggal).limit(1);
      const existingLog = logRows && logRows[0];

      const finalIn = inBaru || (existingLog ? existingLog.clock_in : null);
      const finalOut = outBaru || (existingLog ? existingLog.clock_out : null);
      const shiftDetails = hitungJamKerja(finalShiftCode);
      const calculated = hitungLateEarlyDurasi(finalIn, finalOut, shiftDetails.jam);
      const remarks = getRemarks(finalIn, finalOut, shiftDetails.isOff, calculated.late, calculated.early);

      if (existingLog) {
        await supabase.from("absensi_log").update({
          shift: finalShiftCode, clock_in: finalIn, clock_out: finalOut, remarks,
          late_in: calculated.late, early_out: calculated.early, durasi_kerja: calculated.durasi
        }).eq("id", existingLog.id);
      } else if (finalIn || finalOut) {
        await supabase.from("absensi_log").insert({
          tanggal, nik, nama: reqData.nama, shift: finalShiftCode, remarks,
          clock_in: finalIn, clock_out: finalOut,
          late_in: calculated.late, early_out: calculated.early, durasi_kerja: calculated.durasi
        });
      }
    }

    // 3. Email notifikasi (best-effort — kalau gagal, tidak menggagalkan approval)
    try {
      if (process.env.RESEND_API_KEY) {
        const { data: nikRows } = await supabase.from("absensi_nik").select("email").eq("nik", reqData.nik).limit(1);
        const email = nikRows && nikRows[0] && nikRows[0].email;
        if (email) {
          const reqType = reqData.alasan.indexOf("[CHANGE SHIFT]") !== -1 ? "Change Shift" : "Attendance";
          const subject = `[Absensi DPM] Pengajuan ${reqType} Anda ${actionStatus === "Approved" ? "DISETUJUI ✅" : "DITOLAK ❌"}`;
          const color = actionStatus === "Approved" ? "#16a34a" : "#ef4444";
          let html = `<div style="font-family:sans-serif;padding:20px;color:#1a1a1a;max-width:500px;border:1px solid #e5e7eb;border-radius:12px;">`;
          html += `<h2 style="color:${color};margin-top:0;">Status Pengajuan: ${actionStatus.toUpperCase()}</h2>`;
          html += `<p>Halo <b>${reqData.nama}</b>,</p><p>Berikut update status pengajuan Anda:</p>`;
          html += `<table style="border-collapse:collapse;width:100%;font-size:14px;">`;
          html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;width:130px;color:#6b7280;"><b>Jenis</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;"><b>${reqType}</b></td></tr>`;
          html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;color:#6b7280;"><b>Tanggal Absen</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;">${reqData.tanggal_absen}</td></tr>`;
          if (adminMessage) {
            const lbl = actionStatus === "Approved" ? "Catatan Admin" : "Alasan Penolakan";
            html += `<tr><td style="padding:8px 0;color:#6b7280;"><b>${lbl}</b></td><td style="padding:8px 0;color:${color};"><i>"${adminMessage}"</i></td></tr>`;
          }
          html += `</table></div>`;

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || "Admin Absensi DPM <onboarding@resend.dev>",
              to: email, subject, html
            })
          });
        }
      }
    } catch (mailErr) {
      console.error("Gagal kirim email:", mailErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
