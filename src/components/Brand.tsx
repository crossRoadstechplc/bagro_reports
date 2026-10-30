import Image from 'next/image';
import Link from 'next/link';

/** B-Agro Coffee logo (from bagrocoffee.com) with the app name. */
export default function Brand() {
  return (
    <Link href="/" className="brand" aria-label="B-Agro Coffee - Field Reports home">
      <Image src="/logo.png" alt="B-Agro Coffee" width={106} height={44} priority />
      <span className="brand-name">Field Reports<small>የመስክ ሪፖርት</small></span>
    </Link>
  );
}
