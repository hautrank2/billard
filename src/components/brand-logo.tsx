import Image from "next/image";

import styles from "./brand-logo.module.css";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <span className={`${styles.logo}${compact ? ` ${styles.compact}` : ""}`}>
    <Image src="/brand/rollnine-3d.png" width={2172} height={724} alt="RollNine" priority
      sizes={compact ? "108px" : "(max-width: 760px) 144px, 198px"} />
  </span>;
}
