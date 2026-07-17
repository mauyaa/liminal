import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const panels = [
  ["🔒", "Buyer pays the link", "Money locks on-chain. Neither of you can touch it."],
  ["📦", "You deliver", "The system detects it — no screenshots, no proof-sending."],
  ["✅", "Money lands in your wallet", "Automatically. No account, no balance to cash out."],
];

const journey = [
  ["01", "Create a link", "Title, price, delivery deadline. About 15 seconds."],
  ["02", "Buyer pays", "USDC moves into the Liminal program—not to Liminal and not yet to the seller."],
  ["03", "You deliver", "The buyer sees a funded order and you complete the promised work."],
  ["04", "Buyer confirms", "One tap releases the escrowed funds to you."],
  ["05", "Or it auto-refunds", "Unconfirmed past the deadline? The buyer gets refunded automatically."],
  ["06", "Either way, it's tracked", "A shareable timeline page replaces \"did you send it?\" messages."],
];

const faq = [
  ["What if the buyer never confirms?", "The payment auto-refunds to them after the delivery deadline if you never marked it delivered, and auto-releases to you if you did — nobody has to remember to act."],
  ["What if I never deliver?", "The buyer's money was never sent to you — it sits in the escrow program. Past your delivery deadline, they can refund it any time, or it's refunded to them automatically."],
  ["Who decides if something goes wrong?", "Most orders never need a person: the buyer confirms, or the deadline decides it automatically. If a buyer flags a delivery, it goes to manual review — someone reads both sides and issues a split, published with the reasoning. No AI verdicts yet, and we won't claim otherwise."],
  ["What does it cost?", "Nothing right now. Liminal charges $0.00 on every escrow — it's free while we build out the product."],
  ["Why crypto?", "Because a buyer who already has a wallet can pay a stranger in seconds, with the money provably locked instead of just promised."],
];

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Get paid by strangers. Nobody gets scammed.</h1>
          <p>
            Create a payment link. The money locks until delivery is proven — then it
            releases itself.
          </p>
          <div className={styles.actions}>
            <Link href="/new" className={styles.primary}>Create your payment link <span>↗</span></Link>
            <Link href="#how-it-works" className={styles.secondary}>See how it works</Link>
          </div>
          <div className={styles.proof}>
            <span>Zero protocol fee</span><span>Solana escrow</span><span>Auto-refund on timeout</span>
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
          <Link href="/pay/liminal-demo" className={styles.demoButton}>Review and pay $1.00 <span>↗</span></Link>
          <p className={styles.demoFoot}>The demo uses test tokens on Solana devnet.</p>
        </article>
      </section>

      <section className={styles.panels}>
        {panels.map(([icon, title, body]) => (
          <div key={title} className={styles.panelCard}>
            <span className={styles.panelIcon}>{icon}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </section>

      <section className={styles.statement}>
        <p><strong>Binance moves your money.</strong> We make sure you don&apos;t lose it.</p>
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

      <section className={styles.faq}>
        <h2>Questions worth answering before you send money.</h2>
        {faq.map(([q, a]) => (
          <details key={q} className={styles.faqItem}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section className={styles.paths}>
        <Link href="/pay/liminal-demo" className={styles.pathCard}><h2>Pay $1.00 through the real flow.</h2><p>Review the exact terms, connect a wallet, fund escrow and track the result.</p><b>Open demo checkout ↗</b></Link>
        <Link href="/new" className={`${styles.pathCard} ${styles.pathCardDark}`}><h2>Create your payment link.</h2><p>Title, price, deadline — about 15 seconds. Share it anywhere a deal happens.</p><b>Create a link ↗</b></Link>
      </section>
    </main>
  );
}
