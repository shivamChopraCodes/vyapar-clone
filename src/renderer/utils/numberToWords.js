const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function twoDigitWords(n) {
  if (n < 20) return ones[n];
  const t = tens[Math.floor(n / 10)];
  const o = ones[n % 10];
  return o ? `${t} ${o}` : t;
}

function integerToWords(n) {
  if (n === 0) return 'Zero';
  if (n < 0) return `Minus ${integerToWords(-n)}`;

  let result = '';

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;

  if (crore > 0) result += `${twoDigitWords(crore)} Crore `;
  if (lakh > 0) result += `${twoDigitWords(lakh)} Lakh `;
  if (thousand > 0) result += `${twoDigitWords(thousand)} Thousand `;
  if (hundred > 0) result += `${ones[hundred]} Hundred `;
  if (remainder > 0) {
    if (result) result += 'and ';
    result += twoDigitWords(remainder);
  }

  return result.trim();
}

/**
 * Convert a numeric amount to Indian English words with Rupees/Paise.
 * e.g. 7706.40 → "Seven Thousand Seven Hundred and Six Rupees and Forty Paise only"
 */
export function numberToWords(amount) {
  if (amount == null || isNaN(amount)) return '';
  const absAmount = Math.abs(amount);
  const rupees = Math.floor(absAmount);
  const paise = Math.round((absAmount - rupees) * 100);

  let result = '';
  if (amount < 0) result += 'Minus ';

  result += `${integerToWords(rupees)} Rupees`;

  if (paise > 0) {
    result += ` and ${integerToWords(paise)} Paise`;
  }

  result += ' only';
  return result;
}
