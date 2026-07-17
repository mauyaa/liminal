import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <Link href="/" className="site-brand">
            <span className="site-brand__mark"><Image src="/liminal-mark.jpg" alt="" width={40} height={40} /></span>
            <span>Liminal</span>
          </Link>
          <p>Protected stablecoin payments for work delivered.</p>
        </div>
        <div className="site-footer__links">
          <div><span>Product</span><Link href="/new">Create a link</Link><Link href="/pay/liminal-demo">Demo checkout</Link></div>
          <div><span>Build</span><Link href="/docs">Documentation</Link><Link href="/security">Security</Link><a href="https://github.com/mauyaa/liminal" target="_blank" rel="noreferrer">GitHub ↗</a></div>
        </div>
      </div>
      <div className="site-footer__base"><span>© 2026 Liminal</span></div>
    </footer>
  );
}
