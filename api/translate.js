// =============================================================
//  /api/translate.js  —  Vercel Serverless Function
//
//  This file runs ON VERCEL'S SERVER, never in the user's browser.
//  It reads the secret API key from a Vercel Environment Variable
//  named GEMINI_API_KEY. The key is NEVER written in this file and
//  is NEVER sent to the website. Users never see it.
//
//  The website sends:    { text, srcLang, tgtLang }
//  This function returns: { translation }   (or { error })
// =============================================================

export default async function handler(req, res) {
  // --- Only allow POST requests ---
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 허용됩니다." });
  }

  // --- Read the secret key from the Vercel environment ---
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "서버에 API 키가 설정되어 있지 않습니다. (GEMINI_API_KEY)",
    });
  }

  // --- Read the request body sent by the website ---
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "잘못된 요청 형식입니다." });
    }
  }

  const text = body && body.text;
  const srcLang = (body && body.srcLang) || "auto";
  const tgtLang = body && body.tgtLang;

  if (!text || !tgtLang) {
    return res
      .status(400)
      .json({ error: "번역할 텍스트와 대상 언어가 필요합니다." });
  }

  // --- Build the translation instruction for the model ---
  const sourcePart =
    srcLang === "auto"
      ? "Detect the source language automatically"
      : `The source language is ${srcLang}`;

  const prompt =
    `${sourcePart}. Translate the following text into ${tgtLang}. ` +
    `Preserve the original meaning, tone, line breaks, and paragraph ` +
    `structure as closely as possible. Return ONLY the translated text, ` +
    `with no explanations, no notes, and no quotation marks around it.\n\n` +
    `Text to translate:\n${text}`;

  // --- Call the Google Gemini API ---
  const model = "gemini-2.5-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:generateContent?key=${apiKey}`;

  try {
    const gResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!gResp.ok) {
      const errText = await gResp.text();
      // Pass a clear status back to the website
      if (gResp.status === 429) {
        return res.status(429).json({
          error:
            "번역 요청이 너무 많습니다. 잠시 후 다시 시도해주세요. " +
            "(무료 사용량이 초과되었을 수 있으며, 약 24시간 후 초기화됩니다.)",
        });
      }
      if (gResp.status === 400) {
        return res
          .status(400)
          .json({ error: "서버의 API 키가 유효하지 않거나 요청이 잘못되었습니다." });
      }
      return res.status(gResp.status).json({
        error: `번역 서버 오류 (${gResp.status}).`,
        detail: errText.slice(0, 300),
      });
    }

    const data = await gResp.json();
    const translation =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!translation) {
      return res
        .status(502)
        .json({ error: "번역 결과를 받지 못했습니다. 다시 시도해주세요." });
    }

    return res.status(200).json({ translation: translation });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "번역 중 오류가 발생했습니다: " + (err.message || err) });
  }
}
