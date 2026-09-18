import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    // 1. Ambil semua user yang punya email
    const { data: nikRows, error: nikErr } = await supabase
      .from('absensi_nik')
      .select('nik, nama, email, status');
    if (nikErr) throw new Error("Gagal baca NIK: " + nikErr.message);

    const users = (nikRows || []).filter(u => u.nik && u.email && u.email.trim() !== "");

    // 2. Tentukan rentang tanggal: 1 bulan ini s/d kemarin
    const now = new Date();
    const yesterday = new Date(now.getTime() - 1 * 24 * 3600000);
    const startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
    const yyyy = startDate.getFullYear();
    const mm = String(startDate.getMonth() + 1).padStart(2, '0');
    const strStart = `${String(startDate.getDate()).padStart(2,'0')}/${mm}/${yyyy}`;
    const strEnd = `${String(yesterday.getDate()).padStart(2,'0')}/${mm}/${yyyy}`;
    const endDay = yesterday.getDate();

    // 3. Ambil semua log bulan ini
    const allLogs = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('absensi_log')
        .select('nik, tanggal, shift, remarks, clock_in, clock_out')
        .gte('tanggal', `${yyyy}-${mm}-01`)
        .lte('tanggal', `${yyyy}-${mm}-${String(endDay).padStart(2,'0')}`)
        .order('id', { ascending: true })
        .range(from, from + step - 1);
      if (error) throw new Error("Gagal baca log: " + error.message);
      if (!data || data.length === 0) break;
      allLogs.push(...data);
      if (data.length < step) break;
      from += step;
    }

    // 4. Ambil schedule bulan ini
    const allSchedules = [];
    from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('absensi_master_schedule')
        .select('nik, tanggal, shift_code')
        .gte('tanggal', `${yyyy}-${mm}-01`)
        .lte('tanggal', `${yyyy}-${mm}-${String(endDay).padStart(2,'0')}`)
        .range(from, from + step - 1);
      if (error) throw new Error("Gagal baca schedule: " + error.message);
      if (!data || data.length === 0) break;
      allSchedules.push(...data);
      if (data.length < step) break;
      from += step;
    }

    // 5. Bangun map
    const logMap = {};
    allLogs.forEach(r => {
      const tgl = String(r.tanggal).slice(0, 10);
      logMap[r.nik + "_" + tgl] = {
        shift: r.shift || '-', in: r.clock_in || '-', out: r.clock_out || '-', remarks: r.remarks || '-'
      };
    });

    const schedMap = {};
    allSchedules.forEach(r => {
      const tgl = String(r.tanggal).slice(0, 10);
      schedMap[r.nik + "_" + tgl] = r.shift_code || '';
    });

    // 6. Kirim email ke setiap user
    let sentCount = 0;
    let failList = [];

    for (const userData of users) {
      try {
        let tableRows = '';
        for (let d = 1; d <= endDay; d++) {
          const dateObj = new Date(yyyy, startDate.getMonth(), d);
          const tglIso = `${yyyy}-${mm}-${String(d).padStart(2,'0')}`;
          const displayDate = `${String(d).padStart(2,'0')} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][dateObj.getMonth()]}`;

          const key = userData.nik + "_" + tglIso;
          const schedCode = schedMap[key] || 'XX';
          const actual = logMap[key] || {
            shift: (schedCode === 'X' || schedCode === 'OFF') ? 'DAY OFF' : schedCode,
            in: '-', out: '-',
            remarks: (schedCode === 'X' || schedCode === 'OFF') ? 'OFF' : 'Alpha'
          };

          const remColor = actual.remarks === 'Present' ? '#16a34a'
            : actual.remarks === 'Alpha' ? '#dc2626'
            : actual.remarks === 'OFF' || actual.remarks === 'Day Off' ? '#9ca3af'
            : '#f59e0b';
          const rowBg = (d % 2 === 0) ? '#f9fafb' : '#ffffff';

          tableRows += `<tr style="background:${rowBg};">
            <td style="padding:8px;border:1px solid #e5e7eb;font-size:12px;">${displayDate}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;font-size:12px;text-align:center;">${actual.shift}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;font-size:12px;text-align:center;">${actual.in}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;font-size:12px;text-align:center;">${actual.out}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;font-size:12px;text-align:center;color:${remColor};font-weight:bold;">${actual.remarks}</td>
          </tr>`;
        }

        const html = `<div style="font-family:sans-serif;padding:20px;color:#1a1a1a;max-width:600px;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="color:#e20074;margin-top:0;">Rekapan Absensi PPKK DPM</h2>
          <p>Halo <b>${userData.nama}</b>,</p>
          <p>Berikut adalah rekapan absensi Anda dari awal bulan ini hingga kemarin (<b>${strStart} s/d ${strEnd}</b>).</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:15px;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#e20074;color:white;">
              <th style="padding:10px;border:1px solid #fce7f3;">Tanggal</th>
              <th style="padding:10px;border:1px solid #fce7f3;">Shift</th>
              <th style="padding:10px;border:1px solid #fce7f3;">In</th>
              <th style="padding:10px;border:1px solid #fce7f3;">Out</th>
              <th style="padding:10px;border:1px solid #fce7f3;">Keterangan</th>
            </tr>
            ${tableRows}
          </table>
          <div style="margin-top:30px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
            <i>Email ini dikirim otomatis oleh Sistem Absensi PPKK DPM. Mohon tidak membalas email ini.</i>
          </div>
        </div>`;

        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: userData.email,
          subject: `[Absensi DPM] Rekapan Absensi ${strStart} - ${strEnd}`,
          html
        });
        sentCount++;
      } catch (e) {
        console.error("Gagal kirim ke " + userData.email + ": " + e.message);
        failList.push({ email: userData.email, error: e.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil mengirim ${sentCount} email.`,
      failed: failList
    });
  } catch (err) {
    console.error("Error sendWeeklyLogEmails:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
