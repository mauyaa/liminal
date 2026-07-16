import Link from "next/link";
import styles from "./page.module.css";

const journey = [
  ["01", "Seller sets the promise", "Price, product and delivery deadline become the checkout terms."],
  ["02", "Buyer reviews", "The seller, total, delivery window and refund rule are clear before connection."],
  ["03", "Buyer protects payment", "One wallet approval moves the exact amount into neutral escrow."],
  ["04", "Seller delivers", "A funded order appears as a clear delivery task in the seller dashboard."],
  ["05", "Buyer confirms receipt", "When the order arrives, one action releases payment to the seller."],
  ["06", "The promise resolves", "Confirmation pays the seller. A missed deadline makes the buyer refundable."],
];

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Money moves when the work does.</h1>
          <p>
            Liminal is checkout with a built-in promise: payment waits in neutral escrow until
            delivery is confirmed—or returns when the deadline passes.
          </p>
          <div className={styles.actions}>
            <Link href="/buy/liminal-demo-1" className={styles.primary}>Try the buyer journey <span>↗</span></Link>
            <Link href="/dashboard" className={styles.secondary}>Create a checkout</Link>
          </div>
        </div>

        <div className={styles.productMoment} aria-label="Protected payment interface preview">
          <div className={styles.momentTop}><span>Payment 8J4…Q2A</span><span className={styles.status}><i /> Protected</span></div>
          <div className={styles.amountRow}><div><small>Amount in escrow</small><strong>$1,240.00</strong></div><span>USDC</span></div>
          <div className={styles.routeLine}><i /><b /><i /><b /><i /></div>
          <div className={styles.routeLabels}><span>Buyer paid<small>10:42</small></span><span>Funds protected<small>Now</small></span><span>Seller paid<small>On delivery</small></span></div>
          <div className={styles.momentNote}><span>Nothing to arbitrate.</span><p>The rules are agreed before money moves.</p></div>
        </div>
      </section>

      <section className={styles.promise}>
        <p><strong>Buyers keep leverage.</strong> Sellers get proof of funds. Platforms never hold customer money.</p>
      </section>

      <section className={styles.flow} id="how-it-works">
        <div className={styles.flowIntro}>
          <div><h2>One promise. Six clear steps.</h2></div>
          <p>The buyer and seller share one timeline. Every screen shows where the money is and who acts next.</p>
        </div>
        <ol className={styles.steps}>
          {journey.map(([number, title, body]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}
        </ol>
      </section>

      <section className={styles.paths}>
        <Link href="/buy/liminal-demo-1" className={styles.pathCard}><h2>I’m paying.</h2><p>Review the terms, protect your payment, then track delivery from one place.</p><b>Open buyer journey ↗</b></Link>
        <Link href="/dashboard" className={`${styles.pathCard} ${styles.pathCardDark}`}><h2>I’m selling.</h2><p>Create the promise, share checkout, deliver paid orders and receive the payout.</p><b>Open seller journey ↗</b></Link>
      </section>
    </main>
  );
}
