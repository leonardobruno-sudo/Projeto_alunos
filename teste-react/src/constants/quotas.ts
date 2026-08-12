/** Defines the quota modalities shared by student registration and statistics filters. */

export const QUOTA_OPTIONS = [
  { value: 'AC', label: 'Ampla concorrência' },
  { value: 'PCD_AC', label: 'Pessoa com deficiência — ampla concorrência' },
  { value: 'L1', label: 'Escola pública, baixa renda, PPI' },
  { value: 'L2', label: 'Escola pública, baixa renda, quilombola' },
  { value: 'L5', label: 'Escola pública, baixa renda, PCD' },
  { value: 'L6', label: 'Escola pública, baixa renda' },
  { value: 'L9', label: 'Escola pública, renda independente, PPI' },
  { value: 'L10', label: 'Escola pública, renda independente, quilombola' },
  { value: 'L13', label: 'Escola pública, renda independente, PCD' },
  { value: 'L14', label: 'Escola pública, renda independente' },
] as const

export type QuotaCode = typeof QUOTA_OPTIONS[number]['value']

export function quotaLabel(value?: string | null): string {
  return QUOTA_OPTIONS.find((option) => option.value === value)?.label ?? value?.trim() ?? ''
}
