'use server';

import { logClaudeUsage } from '@/lib/utils/claude-usage';

// KTP (e-KTP Indonesia) AI extract — ADDITIVE, khusus fitur Khasanah.
// Pola sama dengan passport.js (Claude Vision) supaya konsisten.
// Path: lib/actions/ktp.js

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-opus-4-7';

const EXTRACTION_PROMPT = `You are an Indonesian e-KTP (Kartu Tanda Penduduk) data extraction AI. Analyze this KTP photo and extract the data into JSON.

Return ONLY a valid JSON object (no markdown, no explanation) with these exact keys:
{
  "nik": "16-digit NIK number (digits only)",
  "nama": "full name in CAPS exactly as shown",
  "tempat_lahir": "place of birth (city)",
  "tgl_lahir": "YYYY-MM-DD format (date of birth)",
  "jenis_kelamin": "LAKI-LAKI or PEREMPUAN",
  "alamat": "street address line (Alamat)",
  "rt_rw": "RT/RW (e.g. 001/002)",
  "kel_desa": "Kelurahan/Desa",
  "kecamatan": "Kecamatan",
  "agama": "religion",
  "status_perkawinan": "marital status (e.g. KAWIN, BELUM KAWIN)",
  "pekerjaan": "occupation",
  "kewarganegaraan": "citizenship (e.g. WNI)",
  "berlaku_hingga": "validity (e.g. SEUMUR HIDUP or YYYY-MM-DD)",
  "provinsi": "Provinsi (top header)",
  "kota_kabupaten": "KOTA / KABUPATEN (second header)"
}

IMPORTANT RULES:
- If a field is unclear/unreadable, set it to null (not empty string)
- NIK must be 16 digits, digits only (remove spaces)
- For dates use YYYY-MM-DD format
- Names/addresses in CAPITAL LETTERS exactly as shown
- If you cannot read the KTP at all, return: {"error": "Cannot read KTP image"}
- Do NOT include any text outside the JSON object`;

export async function extractKtpData(imageUrl) {
  if (!imageUrl) return { error: 'Image URL wajib' };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY belum di-set di Vercel env vars.' };

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              (/\.pdf(\?|$)/i.test(String(imageUrl))
                ? { type: 'document', source: { type: 'url', url: imageUrl } }
                : { type: 'image', source: { type: 'url', url: imageUrl } }),
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: `Claude API error (${response.status}): ${errText.substring(0, 300)}` };
    }

    const data = await response.json();
    try { await logClaudeUsage({ feature: 'ktp', model: CLAUDE_MODEL, usage: data.usage }); } catch {}
    const rawText = data?.content?.[0]?.text || '';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) { return { error: 'AI response bukan JSON valid: ' + cleaned.substring(0, 200) }; }
    if (parsed.error) return { error: parsed.error };

    if (parsed.nik) parsed.nik = String(parsed.nik).replace(/\D/g, '');
    return { ok: true, data: parsed };
  } catch (e) {
    return { error: 'Extract error: ' + (e?.message || 'unknown') };
  }
}
