import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// English namespaces
import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enAnalysis from "./locales/en/analysis.json";
import enResults from "./locales/en/results.json";
import enHelp from "./locales/en/help.json";
import enEnterprise from "./locales/en/enterprise.json";
import enApiKeys from "./locales/en/apiKeys.json";

// Arabic namespaces
import arCommon from "./locales/ar/common.json";
import arAuth from "./locales/ar/auth.json";
import arAnalysis from "./locales/ar/analysis.json";
import arResults from "./locales/ar/results.json";
import arHelp from "./locales/ar/help.json";
import arEnterprise from "./locales/ar/enterprise.json";
import arApiKeys from "./locales/ar/apiKeys.json";

export const defaultNS = "common";
export const namespaces = [
  "common",
  "auth",
  "analysis",
  "results",
  "help",
  "enterprise",
  "apiKeys",
] as const;

export type AppNamespace = (typeof namespaces)[number];

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    analysis: enAnalysis,
    results: enResults,
    help: enHelp,
    enterprise: enEnterprise,
    apiKeys: enApiKeys,
  },
  ar: {
    common: arCommon,
    auth: arAuth,
    analysis: arAnalysis,
    results: arResults,
    help: arHelp,
    enterprise: arEnterprise,
    apiKeys: arApiKeys,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS,
    ns: [...namespaces],

    interpolation: {
      escapeValue: false, // React already handles escaping
    },

    detection: {
      // Check localStorage first (matching the existing LanguageContext key),
      // then browser navigator language
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "codesimilar.language",
      caches: ["localStorage"],
    },

    react: {
      useSuspense: false,
    },
  });

export default i18n;
