// Фильтр расшифровок голосовых сообщений (Groq Whisper).
/**
 * Whisper на тишине или шуме «слышит» повторы («Oh, oh, oh…») и титры из обучающих видео.
 * Такое не отправляем агенту — просим повторить.
 */
export function looksLikeHallucination(text: string) {
  const t = text.toLowerCase();
  if (/субтитр|продолжение следует|спасибо за просмотр|подпишитесь|dimatorzok|amara\.org|thanks for watching/.test(t)) return true;
  const words = t.match(/[\p{L}\d]+/gu) ?? [];
  if (words.length >= 4 && new Set(words).size / words.length <= 0.35) return true; // одно слово по кругу
  return false;
}
