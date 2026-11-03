// Shared by the customer account actions and forms.

export const REFERRAL_SOURCES = ["instagram", "indicacao", "google", "passou_na_frente", "whatsapp", "outro"] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

export const REFERRAL_LABEL: Record<ReferralSource, string> = {
  instagram: "Instagram",
  indicacao: "Indicação de alguém",
  google: "Google",
  passou_na_frente: "Passei em frente à loja",
  whatsapp: "WhatsApp",
  outro: "Outro",
};
