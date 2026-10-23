import "./styles.css";
import type { Experience } from "./scene/Experience";

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
import("./scene/Experience")
  .then(({ Experience }) => {
    experience = new Experience(canvas);
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

// ---------- Channels: pointing at a name follows that stream into the core ----------

const channelNotes: Record<string, string> = {
  "0": "WhatsApp connects with a QR scan or Meta's official sign-up, and supports templates, broadcasts and payments.",
  "1": "Instagram DMs and comment replies, connected through your Instagram Business account.",
  "2": "Messenger conversations from your Facebook Page, in the same inbox.",
  "3": "Telegram connects with a bot token in under a minute.",
  "4": "SMS through Twilio, for customers who never install an app.",
  "5": "X direct messages, answered with the same knowledge as every other channel.",
  "6": "Discord servers and DMs, for communities that buy.",
  "7": "Voice calls, answered and placed by the same agent, in the same tone.",
  "8": "A chat widget for your website, installed with one script tag.",
};
const defaultNote =
  "WhatsApp connects with a QR scan or Meta's official sign-up. The rest connect in a few clicks.";
const note = document.querySelector<HTMLElement>("[data-channel-note]")!;
const channelColors = ["#25d366", "#e1306c", "#2e8bff", "#2aabee", "#f1e4d0", "#d9dde3", "#7983f5", "#f0990e", "#34d399"];

document.querySelectorAll<HTMLButtonElement>("[data-channel]").forEach((btn) => {
  const id = btn.dataset.channel!;
  btn.style.setProperty("--c", channelColors[Number(id)]);
  btn.setAttribute("aria-pressed", "false");

  const enter = () => {
    experience?.setFocus(Number(id));
    note.textContent = channelNotes[id];
  };
  const leave = () => {
    if (btn.getAttribute("aria-pressed") === "true") return;
    experience?.setFocus(null);
    note.textContent = defaultNote;
  };

  btn.addEventListener("pointerenter", enter);
  btn.addEventListener("pointerleave", leave);
  btn.addEventListener("focus", enter);
  btn.addEventListener("blur", leave);
  // Tap/click pins the channel so touch users get the same view.
  btn.addEventListener("click", () => {
    const pinned = btn.getAttribute("aria-pressed") === "true";
    document.querySelectorAll("[data-channel]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    if (pinned) {
      leave();
    } else {
      btn.setAttribute("aria-pressed", "true");
      enter();
      experience?.pulse();
    }
  });
});

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
