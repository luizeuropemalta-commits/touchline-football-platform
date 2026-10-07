import { Logo } from "@/components/logo";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import TouchlinePageControls from "./TouchlinePageControls";
import styles from "./TouchlineBrandHeader.module.css";

type Props = Readonly<{
  href: string;
  locale: string;
  accountLocaleContext: AccountLocaleContext;
  draftLocalesEnabled?: boolean;
}>;

/** Mount once, first in an unpadded full-width page shell, outside its content
 * container. This component owns the login-reference top/side safe-area spacing
 * and wide-screen left column; do not nest it inside auth-entry-content or add
 * another brand/audio row. The caller owns the destination and trusted context.
 * This is not a replacement for ClubOwner's identity/avatar/bank section. */
export default function TouchlineBrandHeader({ href, locale, accountLocaleContext, draftLocalesEnabled = false }: Props) {
  return <header className={styles.frame} dir="ltr">
    <div className={styles.column}>
      <div className={styles.row}>
        <Logo href={href} officialArena minimalMark subtitle="TouchLine Futebol Cards" wordmarkClassName="text-[clamp(26px,3.2vw,34px)]" />
        <TouchlinePageControls locale={locale} accountLocaleContext={accountLocaleContext} draftLocalesEnabled={draftLocalesEnabled} />
      </div>
    </div>
  </header>;
}
