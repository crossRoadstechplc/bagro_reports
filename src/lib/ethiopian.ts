// Ethiopian (Amete Mihret) calendar conversions. Used by both server and browser.

export const ETH_MONTHS_EN = ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Genbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'];
export const ETH_MONTHS_AM = ['መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'];

const EPOCH = 1723856;
const pad = (n: number) => (n < 10 ? '0' : '') + n;
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function gregToJdn(y: number, m: number, d: number) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
function jdnToGreg(j: number) {
  const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor((1461 * d) / 4), m = Math.floor((5 * e + 2) / 153);
  return { y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 };
}
function jdnToEth(j: number) {
  const r = (((j - EPOCH) % 1461) + 1461) % 1461, n = (r % 365) + 365 * Math.floor(r / 1460);
  return { y: 4 * Math.floor((j - EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460), m: Math.floor(n / 30) + 1, d: (n % 30) + 1 };
}
const ethToJdn = (y: number, m: number, d: number) => EPOCH + 365 + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d - 1;

export function isoToEth(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return jdnToEth(gregToJdn(y, m, d));
}
export function ethToIso(y: number, m: number, d: number) {
  const g = jdnToGreg(ethToJdn(y, m, d));
  return isoOf(g.y, g.m, g.d);
}
export const ethMonthLength = (y: number, m: number) => (m < 13 ? 30 : y % 4 === 3 ? 6 : 5);

export function ethLabel(iso: string) {
  if (!iso) return '';
  const e = isoToEth(iso);
  return `${ETH_MONTHS_EN[e.m - 1]} ${e.d}, ${e.y}`;
}
export function ethLabelAm(iso: string) {
  if (!iso) return '';
  const e = isoToEth(iso);
  return `${ETH_MONTHS_AM[e.m - 1]} ${e.d} ቀን ${e.y} ዓ.ም`;
}

/** First and last Gregorian day of an Ethiopian month. */
export function ethMonthRange(y: number, m: number) {
  return { from: ethToIso(y, m, 1), to: ethToIso(y, m, ethMonthLength(y, m)) };
}

/** Today's date in Addis Ababa as YYYY-MM-DD (server side). */
export function todayAddis() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Today's date on this device as YYYY-MM-DD (browser side). */
export function todayLocal() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
