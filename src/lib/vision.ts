// Фото от клиента → короткое описание и есть ли видимый дефект (Gemini; у Groq нет моделей со зрением).
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];

export type PhotoInfo = { defect: boolean; description: string };

export async function describePhoto(dataUrl: string, caption: string): Promise<PhotoInfo | null> {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m || !process.env.GEMINI_API_KEY) return null;
  const prompt =
    "Клиент интернет-магазина прислал в поддержку фото товара" + (caption ? ` с подписью: «${caption}»` : "") + ". " +
    'Верни только JSON: {"defect": true|false, "description": "одно короткое предложение по-русски: что за товар и что видно на фото"}. ' +
    "defect = true, только если на фото явно видно повреждение (разрыв, пятно, трещина, брак шва и т.п.).";
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inlineData: { mimeType: m[1], data: m[2] } }, { text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue; // квота/перегрузка — следующая модель
      const text: string = (await res.json()).candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
      const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "");
      if (typeof json.description === "string") return { defect: json.defect === true, description: json.description.trim() };
    } catch {
      // таймаут или не-JSON — пробуем следующую модель
    }
  }
  return null;
}

/** Текст для агента: подпись клиента + что видно на фото. Слово «брак» — чтобы и правила без LLM поняли дефект. */
export function photoNote(caption: string, info: PhotoInfo | null) {
  const base = caption || "Клиент прислал фото товара";
  if (!info) return `${base}\n[Фото от клиента — распознать не удалось, нужна проверка оператором]`;
  return `${base}\n[Фото от клиента: ${info.description}${info.defect ? " — виден дефект, брак" : ""}]`;
}
