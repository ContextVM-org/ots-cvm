export function isHex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}
