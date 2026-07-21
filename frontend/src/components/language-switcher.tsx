import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()
  const nextLanguage = language === "en" ? "zh-CN" : "en"
  const nextLabel = nextLanguage === "en" ? t("English") : t("Chinese")

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="w-14 shrink-0 justify-center px-0"
      onClick={() => setLanguage(nextLanguage)}
      aria-label={`${t("Language")}: ${nextLabel}`}
      title={`${t("Language")}: ${nextLabel}`}
    >
      <Languages />
      <span>{language === "en" ? "EN" : "中文"}</span>
    </Button>
  )
}
