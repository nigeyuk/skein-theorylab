export const instrumentGainRange = { min: -12, max: 12, default: 0 } as const

export function isInstrumentGainDb(value: unknown): value is number {
  return typeof value === 'number' && value >= instrumentGainRange.min && value <= instrumentGainRange.max
}

export function gainFromDb(decibels: number): number {
  return 10 ** (decibels / 20)
}
