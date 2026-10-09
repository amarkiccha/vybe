import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { storage } from "@/src/utils/storage";
import en from "@/src/locales/en.json";
import kn from "@/src/locales/kn.json";
import hi from "@/src/locales/hi.json";
import te from "@/src/locales/te.json";
import ta from "@/src/locales/ta.json";
import ml from "@/src/locales/ml.json";
import mr from "@/src/locales/mr.json";
import bn from "@/src/locales/bn.json";

export const LANGUAGES = [
  { code: "en", native: "English", english: "English" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
] as const;
export type LangCode = (typeof LANGUAGES)[number]["code"];
const CODES = LANGUAGES.map((l) => l.code) as string[];
export const LANG_KEY = "vybe.language";

export const deviceLanguage = () => {
  const c = getLocales()[0]?.languageCode ?? "en";
  return CODES.includes(c) ? c : "en";
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, kn: { translation: kn }, hi: { translation: hi }, te: { translation: te }, ta: { translation: ta }, ml: { translation: ml }, mr: { translation: mr }, bn: { translation: bn } },
  lng: deviceLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export async function restoreLanguage() {
  const saved = (await storage.getItem(LANG_KEY, null)) as string | null;
  if (saved && CODES.includes(saved)) await i18n.changeLanguage(saved);
  return saved;
}
export async function setLanguage(code: string) {
  await i18n.changeLanguage(code);
  await storage.setItem(LANG_KEY, code);
}

const LOCALE_TAG: Record<string, string> = { en: "en-IN", kn: "kn-IN", hi: "hi-IN", te: "te-IN", ta: "ta-IN", ml: "ml-IN", mr: "mr-IN", bn: "bn-IN" };
export const localeTag = () => LOCALE_TAG[i18n.language] ?? "en-IN";

export function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  try {
    if (days <= 0) return d.toLocaleTimeString(localeTag(), { hour: "numeric", minute: "2-digit" });
    if (days === 1) return i18n.t("time.yesterday");
    if (days < 7) return d.toLocaleDateString(localeTag(), { weekday: "short" });
    return d.toLocaleDateString(localeTag(), { day: "numeric", month: "short" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
export function timeAgo(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return i18n.t("time.minutesAgo", { count: m });
  return i18n.t("time.hoursAgo", { count: Math.round(m / 60) });
}
export const formatNumber = (n: number) => {
  try { return new Intl.NumberFormat(localeTag(), { notation: "compact" }).format(n); } catch { return String(n); }
};

export default i18n;
