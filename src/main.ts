import "./styles.css";
import type { Experience } from "./scene/Experience";
import { iconSvg } from "./icons";

const APP_URL = (import.meta.env.VITE_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SALES_URL = import.meta.env.VITE_SALES_URL ?? "mailto:sales@example.com";

const root = document.documentElement;
root.classList.add("js");

// Links into the dashboard app and to sales are configured per environment.
document.querySelectorAll<HTMLAnchorElement>("[data-app]").forEach((a) => {
  a.href = APP_URL + a.dataset.app;
});
document.querySelectorAll<HTMLAnchorElement>("[data-sales]").forEach((a) => {
  a.href = SALES_URL;
});
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

// ---------- Scene ----------

// Mirrors scene/palette.ts `channels` order.
const channelColors = ["#25d366", "#e1306c", "#2e8bff", "#2aabee", "#f1e4d0", "#d9dde3", "#7983f5", "#f0990e", "#34d399"];

let experience: Experience | null = null;
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const coreHint = () => {
  // Cursor affordance when the pointer is over the core (checked once per frame by the scene).
  let hovering = false;
  const tick = () => {
    const now = experience?.isHoveringCore ?? false;
    if (now !== hovering) {
      hovering = now;
      root.classList.toggle("hovering-core", hovering);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// Never keep the headline hidden waiting on a slow network or GPU.
setTimeout(() => root.classList.add("scene-ready"), 2500);

// The scene is a separate chunk so the copy renders before three.js has downloaded.
Promise.all([import("./scene/Experience"), import("./notifications")])
  .then(([{ Experience }, { mountNotifications }]) => {
    experience = new Experience(canvas);
    mountNotifications(experience, channelColors);
    requestAnimationFrame(() => root.classList.add("scene-ready"));
    document.fonts?.ready.then(() => experience?.remeasure());
    window.addEventListener("load", () => experience?.remeasure());
    coreHint();
  })
  .catch((err) => {
    console.warn("WebGL unavailable, showing the static backdrop instead.", err);
    root.classList.add("no-webgl", "scene-ready");
  });

// ---------- Nav background once the hero scrolls away ----------

const nav = document.querySelector<HTMLElement>(".nav")!;
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------- Channels: what LeadConvo does on each app ----------

// Mirrors scene/palette.ts `channels` order, so a tab's index is also its particle stream.
type Service = { name: string; setup: string; customer: string; agent: string; team: string; tags: string[] };
const services: Service[] = [
  {
    name: "WhatsApp",
    setup: "QR scan or Meta's official sign-up",
    customer: "Asks about price, stock or delivery on WhatsApp.",
    agent: "Answers from your catalogue in your tone, recommends a match and sends a payment link.",
    team: "Paid orders and hot leads, flagged in one inbox.",
    tags: ["Templates", "Broadcasts", "Payment links"],
  },
  {
    name: "Instagram",
    setup: "Sign in with Instagram",
    customer: "Comments “price?” on a Reel, mentions you in a Story, or sends a DM.",
    agent: "Replies to the comment in public, sends the details by DM, and keeps selling when they answer.",
    team: "Leads scored by buying intent, plus insights for every post, Reel and Story.",
    tags: ["Comment to DM", "Story mentions", "Live comments", "Insights"],
  },
  {
    name: "Messenger",
    setup: "Sign in with Meta",
    customer: "Messages your Facebook Page.",
    agent: "Answers in your tone, with the same memory of the customer as every other app.",
    team: "The conversation in the same inbox, ready for you to take over.",
    tags: ["Page inbox", "Human takeover"],
  },
  {
    name: "Telegram",
    setup: "Bot token, under a minute",
    customer: "Writes to your Telegram bot.",
    agent: "Answers questions, recommends products and quotes your prices.",
    team: "Hot leads flagged, and scheduled posts to your channel.",
    tags: ["Bot", "Scheduled posts"],
  },
  {
    name: "SMS",
    setup: "Your Twilio number",
    customer: "Texts your number, without installing any app.",
    agent: "Replies by SMS with the same answers your chat customers get.",
    team: "Every text threaded with the customer's history.",
    tags: ["Twilio", "Scheduled messages"],
  },
  {
    name: "X",
    setup: "Connect your X account",
    customer: "Sends you a DM or mentions your account.",
    agent: "Replies to DMs and mentions with the same knowledge as every other channel.",
    team: "The mentions worth a human, flagged.",
    tags: ["DMs", "Mentions", "Scheduled posts"],
  },
  {
    name: "Discord",
    setup: "Add the bot to your server",
    customer: "Asks a question in your server or by DM.",
    agent: "Answers in the channel or in DMs, for communities that buy.",
    team: "Buyers surfaced from the community chatter.",
    tags: ["Servers", "DMs"],
  },
  {
    name: "Voice calls",
    setup: "Connect a phone number",
    customer: "Calls your business.",
    agent: "Answers and places calls with the same voice and tone as your chats.",
    team: "Each call logged with the customer's history and intent score.",
    tags: ["Inbound", "Outbound"],
  },
  {
    name: "Website chat",
    setup: "One script tag",
    customer: "Opens the chat widget on your site.",
    agent: "Answers from your site, PDFs and FAQs, and recommends the right product.",
    team: "Visitors who are ready to buy, flagged before they leave.",
    tags: ["Chat widget", "Product picks"],
  },
];

const svc = document.querySelector<HTMLElement>("[data-svc]");
if (svc) {
  const tabList = svc.querySelector<HTMLElement>("[data-svc-tabs]")!;
  const panel = svc.querySelector<HTMLElement>("[data-svc-panel]")!;
  const field = (name: string) => svc.querySelector<HTMLElement>(`[data-svc-${name}]`)!;
  let active = 0;
  let inView = false;

  tabList.innerHTML = services
    .map(
      (s, i) =>
        `<button type="button" role="tab" id="svc-tab-${i}" aria-controls="svc-panel" style="--c:${channelColors[i]}">` +
        `<span class="svc-tab-icon">${iconSvg(i, 18)}</span>${s.name}</button>`,
    )
    .join("");
  const tabs = [...tabList.querySelectorAll<HTMLButtonElement>("[role=tab]")];

  const syncScene = () => experience?.setFocus(inView ? active : null);

  const select = (i: number, fromUser = false) => {
    active = i;
    const s = services[i];
    tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(j === i));
      t.tabIndex = j === i ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", `svc-tab-${i}`);
    panel.style.setProperty("--c", channelColors[i]);
    field("icon").innerHTML = iconSvg(i, 22);
    field("name").textContent = s.name;
    field("setup").textContent = s.setup;
    field("customer").textContent = s.customer;
    field("agent").textContent = s.agent;
    field("team").textContent = s.team;
    field("tags").innerHTML = s.tags.map((t) => `<li>${t}</li>`).join("");
    // Restart the fade so the change of app is visible.
    panel.classList.remove("is-swapping");
    void panel.offsetWidth;
    panel.classList.add("is-swapping");
    // On phones the tab row scrolls sideways; keep the chosen app visible without moving the page.
    const tab = tabs[i];
    if (tabList.scrollWidth > tabList.clientWidth) {
      tabList.scrollTo({ left: tab.offsetLeft - (tabList.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
    }
    syncScene();
    if (fromUser) experience?.pulse();
  };

  tabs.forEach((tab, i) => tab.addEventListener("click", () => select(i, true)));
  tabList.addEventListener("keydown", (e) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (active === 0 ? last : active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
    tabs[next].focus();
  });

  // The matching stream lights up only while this section is on screen.
  new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      syncScene();
    },
    { threshold: 0.35 },
  ).observe(svc);

  select(0);
}

// ---------- Comment-to-DM demo plays once when it scrolls into view ----------

const reel = document.querySelector<HTMLElement>("[data-reel]");
if (reel) {
  const reelObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        reel.classList.add("is-playing");
        reelObserver.disconnect();
      }
    },
    { threshold: 0.45 },
  );
  reelObserver.observe(reel);
}

// ---------- How it works: the example chat advances with the active step ----------

const steps = [...document.querySelectorAll<HTMLElement>("[data-step]")];
const messages = [...document.querySelectorAll<HTMLElement>(".msg[data-at]")];

function showStep(active: number) {
  steps.forEach((s, i) => {
    s.classList.toggle("is-active", i === active);
    s.classList.toggle("is-done", i < active);
  });
  messages.forEach((m) => m.classList.toggle("is-hidden", Number(m.dataset.at) > active));
}

showStep(0);
const stepObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) showStep(Number((entry.target as HTMLElement).dataset.step));
    }
  },
  { rootMargin: "-45% 0px -45% 0px" },
);
steps.forEach((s) => stepObserver.observe(s));

if (import.meta.hot) {
  import.meta.hot.dispose(() => experience?.dispose());
}
