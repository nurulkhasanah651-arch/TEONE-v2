'use server';

import { logClaudeUsage } from '@/lib/utils/claude-usage';

// Round 134 HOTFIX: Passport AI extract — pakai claude-opus-4-7 (sesuai akun user)
// Path: lib/actions/passport.js

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-opus-4-7';

const EXTRACTION_PROMPT = `You are a passport data extraction AI. Analyze this passport photo and extract the following data into JSON.

Return ONLY a valid JSON object (no markdown, no explanation) with these exact keys:
{
  "surname": "family name / last name in CAPS",
  "given_names": "first name + middle names in CAPS",
  "passport_number": "alphanumeric passport number",
  "nationality": "3-letter country code (e.g. IDN, USA, GBR)",
  "nationality_full": "full country name (e.g. INDONESIA)",
  "dob": "YYYY-MM-DD format (date of birth)",
  "expiry": "YYYY-MM-DD format (date of expiry)",
  "issue_date": "YYYY-MM-DD format (date of issue, if visible)",
  "sex": "M or F",
  "place_of_birth": "city/region of birth",
  "place_of_issue": "passport issuing authority/city",
  "mrz_line1": "MRZ line 1 if visible (the machine-readable zone at bottom)",
  "mrz_line2": "MRZ line 2 if visible"
}

IMPORTANT RULES:
- If a field is unclear/unreadable, set it to null (not empty string)
- For dates, ALWAYS use YYYY-MM-DD format
- For names, use CAPITAL LETTERS exactly as shown on passport
- For Indonesian passports, surname might be empty (use the full name as given_names)
- If you cannot read the passport at all, return: {"error": "Cannot read passport image"}
- Do NOT include any text outside the JSON object`;

export async function extractPassportData(imageUrl) {
  if (!imageUrl) return { error: 'Image URL wajib' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error: 'ANTHROPIC_API_KEY belum di-set di Vercel env vars. Set dulu di Vercel Settings → Environment Variables.',
    };
  }

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
              {
                type: 'image',
                source: { type: 'url', url: imageUrl },
              },
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
    try { await logClaudeUsage({ feature: 'passport', model: CLAUDE_MODEL, usage: data.usage }); } catch {}
    const rawText = data?.content?.[0]?.text || '';

    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { error: 'AI response bukan JSON valid: ' + cleaned.substring(0, 200) };
    }

    if (parsed.error) return { error: parsed.error };

    if (!parsed.surname && parsed.given_names) {
      const parts = parsed.given_names.trim().split(/\s+/);
      if (parts.length >= 2) {
        parsed.surname = parts[parts.length - 1];
        parsed.given_names = parts.slice(0, -1).join(' ');
      }
    }

    return {
      ok: true,
      data: parsed,
      mrz_raw: [parsed.mrz_line1, parsed.mrz_line2].filter(Boolean).join('\n'),
    };
  } catch (e) {
    return { error: 'Extract error: ' + (e?.message || 'unknown') };
  }
}
