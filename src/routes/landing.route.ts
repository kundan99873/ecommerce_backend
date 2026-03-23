import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ecommerce API</title>
    <style>
      :root {
        --bg: #f4efe6;
        --ink: #1f2937;
        --muted: #6b7280;
        --accent: #0f766e;
        --accent-2: #b45309;
        --card: #fffdf8;
        --border: #e7dcc7;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Georgia", "Times New Roman", serif;
        background: radial-gradient(circle at 20% 10%, #fdf8ee 0%, var(--bg) 55%);
        color: var(--ink);
      }

      .shell {
        max-width: 980px;
        margin: 0 auto;
        padding: 40px 20px 80px;
      }

      .hero {
        background: linear-gradient(120deg, #0f766e, #115e59 55%, #0b3f3b);
        color: #f3fffd;
        border-radius: 18px;
        padding: 34px 28px;
        box-shadow: 0 18px 40px rgba(17, 24, 39, 0.16);
      }

      .badge {
        display: inline-block;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        margin-bottom: 16px;
      }

      h1 {
        margin: 0;
        font-size: clamp(30px, 5vw, 50px);
        line-height: 1.1;
      }

      .subtitle {
        margin: 14px 0 0;
        color: #dcfce7;
        max-width: 680px;
        line-height: 1.6;
      }

      .cards {
        margin-top: 24px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 18px;
      }

      .card h2 {
        margin: 0 0 8px;
        font-size: 18px;
      }

      .card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
        font-size: 14px;
      }

      .footer {
        margin-top: 26px;
        color: var(--muted);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <span class="badge">Backend Service</span>
        <h1>Ecommerce API is live</h1>
        <p class="subtitle">
          Authentication, products, categories, coupons, carts, wishlist, and orders are available from this server.
          Use your frontend app to connect with this backend service.
        </p>
      </section>

      <section class="cards">
        <article class="card">
          <h2>Auth</h2>
          <p>Secure authentication with account verification, password reset, and session control.</p>
        </article>
        <article class="card">
          <h2>Catalog</h2>
          <p>Product, category, and content management support for storefront experiences.</p>
        </article>
        <article class="card">
          <h2>Commerce</h2>
          <p>Cart, wishlist, coupon, and order flow to power the full shopping journey.</p>
        </article>
      </section>

      <p class="footer">Backend service is running successfully.</p>
    </main>
  </body>
</html>`;

  return res.status(200).type("html").send(html);
});

export default router;
