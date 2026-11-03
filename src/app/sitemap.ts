import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** The public pages, for search engines and AI assistants. Accounts, strategies and reports stay out. */
const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/questions", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tarifs", priority: 0.8, changeFrequency: "monthly" },
  { path: "/apprendre", priority: 0.7, changeFrequency: "monthly" },
  { path: "/nouveautes", priority: 0.5, changeFrequency: "weekly" },
  { path: "/mentions-legales", priority: 0.2, changeFrequency: "yearly" },
  { path: "/confidentialite", priority: 0.2, changeFrequency: "yearly" },
  { path: "/conditions", priority: 0.2, changeFrequency: "yearly" },
];

/** Each page in French (its usual address) and in English (/en), each pointing to the other. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((p) => {
    const languages = { fr: `${SITE_URL}${p.path}`, en: `${SITE_URL}/en${p.path}` };
    return [
      { url: languages.fr, priority: p.priority, changeFrequency: p.changeFrequency, alternates: { languages } },
      { url: languages.en, priority: p.priority, changeFrequency: p.changeFrequency, alternates: { languages } },
    ];
  });
}
