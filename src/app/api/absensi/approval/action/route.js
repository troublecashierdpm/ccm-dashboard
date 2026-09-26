// src/app/api/absensi/approval/action/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
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

    // 1a. Fetch shift lama (sebelum di-update) untuk keperluan email
    const reqType = reqData.alasan.indexOf("[CHANGE SHIFT]") !== -1 ? "Change Shift" : "Attendance";
    const shiftLamaPromise = (async () => {
      if (reqType !== "Change Shift") return "-";
      const { data: schExisting } = await supabase
        .from("absensi_master_schedule").select("shift_code")
        .eq("nik", reqData.nik).eq("tanggal", reqData.tanggal_absen).limit(1);
      return (schExisting && schExisting[0] && schExisting[0].shift_code) || "-";
    })();

    // 1. Update status request (paralel dengan fetch shift lama)
    const updReqPromise = supabase.from("absensi_request").update({
      status: actionStatus,
      tanggal_action: nowStr,
      catatan_admin: adminMessage || "-"
    }).eq("req_id", reqId);

    const [shiftLama, updReqRes] = await Promise.all([shiftLamaPromise, updReqPromise]);
    if (updReqRes.error) throw new Error(updReqRes.error.message);

    // 2. Kalau Approved: cascading update ke master_schedule & log
    if (actionStatus === "Approved") {
      const nik = reqData.nik;
      const tanggal = reqData.tanggal_absen;
      const shiftReq = (reqData.shift_baru && reqData.shift_baru !== "-") ? reqData.shift_baru : "";
      const inBaru = (reqData.jam_in_baru && reqData.jam_in_baru !== "-") ? reqData.jam_in_baru : "";
      const outBaru = (reqData.jam_out_baru && reqData.jam_out_baru !== "-") ? reqData.jam_out_baru : "";

      // Baca jadwal + log paralel (hemat 1 RTT)
      const schedPromise = supabase
        .from("absensi_master_schedule").select("id, shift_code").eq("nik", nik).eq("tanggal", tanggal).limit(1);
      const logPromise = supabase
        .from("absensi_log").select("*").eq("nik", nik).eq("tanggal", tanggal).limit(1);
      const [{ data: schedRows }, { data: logRows }] = await Promise.all([schedPromise, logPromise]);
      const existingSchedule = schedRows && schedRows[0];
      const existingLog = logRows && logRows[0];

      let finalShiftCode = "XX";
      const writeOps = [];
      if (shiftReq) {
        finalShiftCode = shiftReq;
        if (existingSchedule) {
          writeOps.push(supabase.from("absensi_master_schedule").update({ shift_code: shiftReq }).eq("id", existingSchedule.id));
        } else {
          writeOps.push(supabase.from("absensi_master_schedule").insert({ nik, tanggal, shift_code: shiftReq }));
        }
      } else {
        if (existingSchedule && existingSchedule.shift_code) finalShiftCode = existingSchedule.shift_code;
      }

      const finalIn = inBaru || (existingLog ? existingLog.clock_in : null);
      const finalOut = outBaru || (existingLog ? existingLog.clock_out : null);
      const shiftDetails = hitungJamKerja(finalShiftCode);
      const calculated = hitungLateEarlyDurasi(finalIn, finalOut, shiftDetails.jam);
      const remarks = getRemarks(finalIn, finalOut, shiftDetails.isOff, calculated.late, calculated.early);

      if (existingLog) {
        writeOps.push(supabase.from("absensi_log").update({
          shift: finalShiftCode, clock_in: finalIn, clock_out: finalOut, remarks,
          late_in: calculated.late, early_out: calculated.early, durasi_kerja: calculated.durasi
        }).eq("id", existingLog.id));
      } else if (finalIn || finalOut) {
        writeOps.push(supabase.from("absensi_log").insert({
          tanggal, nik, nama: reqData.nama, shift: finalShiftCode, remarks,
          clock_in: finalIn, clock_out: finalOut,
          late_in: calculated.late, early_out: calculated.early, durasi_kerja: calculated.durasi
        }));
      }
      const writeResults = await Promise.all(writeOps);
      const writeErr = writeResults.find(r => r && r.error);
      if (writeErr) throw new Error(writeErr.error.message);
    }

    // 3. Email notifikasi fire-and-forget (respons tidak menunggu SMTP ±2-4 dtk)
    kirimEmailApproval(supabase, reqData, reqType, shiftLama, actionStatus, adminMessage);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// Best-effort: jalan di background, gagal kirim tidak menggagalkan approval
async function kirimEmailApproval(supabase, reqData, reqType, shiftLama, actionStatus, adminMessage) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
    const { data: nikRows } = await supabase.from("absensi_nik").select("email").eq("nik", reqData.nik).limit(1);
    const email = nikRows && nikRows[0] && nikRows[0].email;
    if (!email) return;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    const subject = `[Absensi DPM] Pengajuan ${reqType} Anda ${actionStatus === "Approved" ? "DISETUJUI ✅" : "DITOLAK ❌"}`;
    const color = actionStatus === "Approved" ? "#16a34a" : "#ef4444";
    let html = `<div style="font-family:sans-serif;padding:20px;color:#1a1a1a;max-width:500px;border:1px solid #e5e7eb;border-radius:12px;">`;
    html += `<h2 style="color:${color};margin-top:0;">Status Pengajuan: ${actionStatus.toUpperCase()}</h2>`;
    html += `<p>Halo <b>${reqData.nama}</b>,</p><p>Berikut update status pengajuan Anda:</p>`;
    html += `<table style="border-collapse:collapse;width:100%;font-size:14px;">`;
    html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;width:130px;color:#6b7280;"><b>Jenis</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;"><b>${reqType}</b></td></tr>`;
    html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;color:#6b7280;"><b>Tanggal</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;">${reqData.tanggal_absen}</td></tr>`;
    if (reqType === "Change Shift") {
      html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;color:#6b7280;"><b>Shift Lama</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;">${shiftLama}</td></tr>`;
      html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;color:#6b7280;"><b>Shift Baru</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;">${reqData.shift_baru}</td></tr>`;
    } else {
      const jamIn = reqData.jam_in_baru || "-";
      const jamOut = reqData.jam_out_baru || "-";
      html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;color:#6b7280;"><b>Clock In</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;">${jamIn}</td></tr>`;
      html += `<tr><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;color:#6b7280;"><b>Clock Out</b></td><td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;">${jamOut}</td></tr>`;
    }
    if (adminMessage) {
      const lbl = actionStatus === "Approved" ? "Catatan Admin" : "Alasan Penolakan";
      html += `<tr><td style="padding:8px 0;color:#6b7280;"><b>${lbl}</b></td><td style="padding:8px 0;color:${color};"><i>"${adminMessage}"</i></td></tr>`;
    }
    html += `</table></div>`;
    await transporter.sendMail({ from: process.env.GMAIL_USER, to: email, subject, html });
  } catch (mailErr) {
    console.error("Gagal kirim email:", mailErr);
  }
}
