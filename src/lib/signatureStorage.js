import { createClient } from '@supabase/supabase-js';

export async function uploadSignatureToStorage(supabase, base64Data, role, name) {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;

  const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
  const fileName = `${role.toLowerCase()}_${name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`;

  const { error } = await supabase.storage
    .from('id-signatures')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: true });

  if (error) throw error;

  const { data: pub } = supabase.storage.from('id-signatures').getPublicUrl(fileName);
  return pub.publicUrl;
}
