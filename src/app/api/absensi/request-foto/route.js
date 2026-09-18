import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req) {
  try {
    const { base64Data, nik, nama } = await req.json();
    
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });
    
    // Folder ID dari GAS lama: 1co5k5ihO-C4oawOIbCSUKC3v-S4gZHiD
    const folderId = "1co5k5ihO-C4oawOIbCSUKC3v-S4gZHiD";
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    const fileMetadata = {
      name: `REQUEST_${nik}_${nama}.jpg`,
      parents: [folderId]
    };
    
    const media = {
      mimeType: 'image/jpeg',
      body: buffer
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink'
    });

    return NextResponse.json({ success: true, url: file.data.webViewLink });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}