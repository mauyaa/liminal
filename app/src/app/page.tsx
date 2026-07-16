import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const journey = [
  ["01", "Create checkout", "The seller sets the amount and the delivery deadline."],
  ["02", "Review terms", "The buyer sees the price, protection and refund rule before connecting."],
  ["03", "Fund escrow", "USDC moves into the Liminal program—not to Liminal and not yet to the seller."],
  ["04", "Deliver", "The seller sees a funded order and completes the promised work."],
  ["05", "Confirm", "The buyer confirms receipt to release the escrowed funds."],
  ["06", "Pay or refund", "Confirmation pays the seller. After 24 hours unconfirmed, the buyer can refund."],
];

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Checkout that waits for delivery.</h1>
          <p>
            Liminal holds a buyer’s USDC in program-controlled escrow. Confirm delivery to pay
            the seller. Leave it unconfirmed for 24 hours and the buyer can refund.
          </p>
          <div className={styles.actions}>
            <Link href="/buy/liminal-demo-1" className={styles.primary}>Open the $1 demo checkout <span>↗</span></Link>
            <Link href="/dashboard" className={styles.secondary}>Create a checkout</Link>
          </div>
          <div className={styles.proof}>
            <span>Zero protocol fee</span><span>Solana escrow</span><span>24-hour protection</span>
          </div>
        </div>

        <article className={styles.demoCard}>
          <div className={styles.demoBrand}>
            <span><Image src="/liminal-mark.jpg" alt="" width={44} height={44} /></span>
            <p>Liminal checkout</p>
          </div>
          <div className={styles.demoBody}>
            <h2>Liminal Demo Checkout</h2>
            <p>Zero-fee escrowed checkout, funds refundable after 24h if unconfirmed.</p>
            <div className={styles.demoAmount}><strong>$1.00</strong><span>USDC</span></div>
            <dl className={styles.demoTerms}>
              <div><dt>Money goes to</dt><dd>Escrow first</dd></div>
              <div><dt>Seller gets paid</dt><dd>After confirmation</dd></div>
              <div><dt>If unconfirmed</dt><dd>Refundable after 24h</dd></div>
            </dl>
          </div>
          <Link href="/buy/liminal-demo-1" className={styles.demoButton}>Review and pay $1.00 <span>↗</span></Link>
          <p className={styles.demoFoot}>The demo uses test tokens on Solana devnet.</p>
        </article>
      </section>

      <section className={styles.statement}>
        <p><strong>The product is the promise.</strong> Funds cannot move to the seller before delivery is confirmed, and they do not stay trapped after the deadline.</p>
      </section>

      <section className={styles.flow} id="how-it-works">
        <div className={styles.flowIntro}>
          <h2>The complete payment journey.</h2>
          <p>One shared lifecycle for buyer and seller, matching the states enforced by the contract.</p>
        </div>
        <ol className={styles.steps}>
          {journey.map(([number, title, body]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}
        </ol>
      </section>

      <section className={styles.paths}>
        <Link href="/buy/liminal-demo-1" className={styles.pathCard}><h2>Pay $1.00 through the real flow.</h2><p>Review the exact terms, connect a wallet, fund escrow and track the result.</p><b>Open demo checkout ↗</b></Link>
        <Link href="/dashboard" className={`${styles.pathCard} ${styles.pathCardDark}`}><h2>Create protected checkout.</h2><p>Set a price and delivery window, share the link, then act on funded orders.</p><b>Open seller dashboard ↗</b></Link>
      </section>
    </main>
  );
}
