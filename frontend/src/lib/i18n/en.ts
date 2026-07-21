import { type TranslationKey, zhCN } from "./zh-CN"

export const en = Object.fromEntries(Object.keys(zhCN).map((key) => [key, key])) as Record<TranslationKey, string>
