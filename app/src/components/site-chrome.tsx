import Image from "next/image";
import Link from "next/link";

const nav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/buy/liminal-demo-1", label: "For buyers" },
  { href: "/dashboard", label: "For sellers" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-brand" aria-label="Liminal home">
          <span className="site-brand__mark">
            <Image src="/liminal-mark.jpg" alt="" width={40} height={40} priority />
          </span>
          <span>Liminal</span>
        </Link>

        <nav className="site-nav" aria-label="Primary navigation">
          {nav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>

        <div className="site-header__actions">
          <Link href="/orders" className="site-header__quiet">Track an order</Link>
          <Link href="/dashboard" className="site-header__cta">Create checkout <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </header>
  );
}
