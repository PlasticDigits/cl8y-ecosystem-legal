/** Format API date (YYYY-MM-DD) as "Month D, YYYY" to match server-side acceptance text. */
export function formatEffectiveDate(effectiveDate: string): string {
  const [y, m, d] = effectiveDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildAcceptanceMessage(params: {
  versionLabel: string;
  effectiveDate: string;
  property: string;
  network: string;
  accountId: string;
  clientTimestamp: Date;
}): string {
  const effective = formatEffectiveDate(params.effectiveDate);
  const iso = params.clientTimestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    `I have read, understood, and accepted the CL8Y Ecosystem Terms and Conditions, Version ${params.versionLabel}, effective ${effective}. ` +
    `I understand that CL8Y ecosystem activity is experimental, non-custodial, provided as-is, and not an investment. ` +
    `I confirm that I am not an investment-type entity, politically exposed person, or acting for or on behalf of either.\n\n` +
    `Property: ${params.property}\n` +
    `Network: ${params.network}\n` +
    `Account: ${params.accountId}\n` +
    `Accepted at (UTC): ${iso}`
  );
}

/** @deprecated Use buildAcceptanceMessage */
export function buildWalletMessage(params: Parameters<typeof buildAcceptanceMessage>[0]): string {
  return buildAcceptanceMessage(params);
}
