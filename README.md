# Morgan Autos — Listing Agent (Deployment Pack)

Your car advert generator as a real website: no Claude login needed, works on
phone/iPad/laptop, saves your webhook permanently, and the Approve button
actually confirms delivery to Make.com.

## What you need (one-time, ~20 minutes)

1. A free GitHub account — https://github.com
2. A free Vercel account — https://vercel.com (sign up WITH your GitHub account)
3. An Anthropic API key — https://console.anthropic.com
   - Sign up, add a payment method, create an API key, copy it somewhere safe.
   - This powers the AI writing. You pay per use — a full set of adverts for
     one car costs pennies. See https://docs.claude.com for current pricing.

## Deploy it

1. On GitHub: New repository -> name it `listing-agent` -> create.
2. Upload ALL the files/folders from this pack to the repository
   (drag and drop works: `package.json`, `vite.config.js`, `index.html`,
   the `src` folder, the `api` folder).
3. On Vercel: Add New -> Project -> Import your `listing-agent` repo.
4. Before clicking Deploy, open "Environment Variables" and add:
   - Name:  ANTHROPIC_API_KEY
   - Value: (paste your API key)
5. Click Deploy. After ~1 minute you get a link like
   `https://listing-agent-xxxx.vercel.app` — that's your app.
6. On your phone: open the link in Safari -> Share -> "Add to Home Screen".

## Custom domain (optional)

In Vercel: Project -> Settings -> Domains -> add
`listings.morganautosascot.co.uk`, then add the DNS record it shows you at
your domain provider (same as you did for MADI).

## Connect Make.com

1. In Make: scenario -> Webhooks -> Custom webhook -> copy the URL.
2. In the app: Auto-post -> Setup -> paste -> Save webhook (saved permanently).
3. In Make, click "Redetermine data structure" so it's listening, then in the
   app generate a listing and tap "Approve & auto-post". Make should say
   "Successfully determined".
4. Add the Facebook Pages "Create a Post" module after the webhook, connect
   your Facebook account, pick your page, map `posts -> facebook` into the
   Message field. Turn the scenario ON.

## What the buttons do

- Generate all listings — writes FB Marketplace, Instagram, AutoTrader,
  Gumtree and Story adverts from your photos + details.
- Copy / Share to app — for Marketplace and AutoTrader (no API allowed there).
- Approve & auto-post — sends details, captions and the first 6 photos to your
  Make webhook, which posts to your FB Page (and Instagram once added).

## If something breaks

- "ANTHROPIC_API_KEY is not set" — add the environment variable in Vercel
  (step 4) and redeploy.
- Adverts not posting — check the Make scenario toggle is ON and look at its
  History tab to see what arrived.
