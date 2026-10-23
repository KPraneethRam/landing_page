import type { Experience } from "./scene/Experience";
import { iconSvg } from "./icons";

// Notification chips that pop up at the mouth of each channel's stream in the hero, so the
// particles read as what they are: comments and messages arriving from each app.

const messages = [
  { from: "WhatsApp", text: "Is the blue one still in stock?" },
  { from: "Instagram comment", text: "price? 😍" },
  { from: "Messenger", text: "Do you ship to Pune?" },
  { from: "Telegram", text: "Any discount if I buy two?" },
  { from: "SMS", text: "What time do you open today?" },
  { from: "X", text: "is this still on sale?" },
  { from: "Discord", text: "drop the link pls 🙏" },
  { from: "Incoming call", text: "Customer calling about an order" },
  { from: "Website chat", text: "Can I talk to someone?" },
];

const STREAM_POINT = 0.5; // how far along the stream (0 = emitter, 1 = core) the chip sits
const CYCLE = 9; // seconds per chip on/off cycle
const ON_FOR = 6.5;

export function mountNotifications(experience: Experience, colors: string[]) {
  const layer = document.createElement("div");
  layer.className = "notifs";
  layer.setAttribute("aria-hidden", "true");

  const chips = messages.map((m, i) => {
    const el = document.createElement("div");
    el.className = "notif";
    el.style.setProperty("--c", colors[i]);
    el.innerHTML = `<span class="notif-icon">${iconSvg(i, 14)}</span><span><b>${m.from}</b>${m.text}</span>`;
    layer.append(el);
    return { el, on: false, offset: (i * CYCLE) / messages.length + (i % 2) * 1.3 };
  });
  document.body.append(layer);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pt = { x: 0, y: 0 };
  let time = 0;

  experience.onAfterFrame = (dt) => {
    time += dt;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const narrow = w < 760;
    const heroVisible = window.scrollY < h * 0.55;
    layer.style.visibility = heroVisible ? "visible" : "hidden";
    if (!heroVisible) return;

    let shown = 0;
    chips.forEach((chip, i) => {
      const inFront = experience.projectStream(i, STREAM_POINT, pt);
      // Keep chips clear of the headline (right half on desktop, top band on phones), and pull
      // streams that leave the screen slightly back inside it rather than dropping their chip.
      const clear = narrow
        ? pt.y > -40 && pt.y < h * 0.4
        : pt.x > w * 0.5 && pt.y > -80 && pt.y < h + 120;
      const x = Math.min(Math.max(pt.x, 32), w - (narrow ? 230 : 270));
      const y = Math.min(Math.max(pt.y, 100), narrow ? h * 0.4 : h - 70);
      const cycleOn = reduced.matches || ((time + chip.offset) % CYCLE) < ON_FOR;
      // Phones get at most two chips at once so the core stays visible.
      const on = inFront && clear && cycleOn && (!narrow || shown < 2);
      if (on) shown++;
      if (on !== chip.on) {
        chip.on = on;
        chip.el.classList.toggle("is-on", on);
      }
      chip.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    });
  };
}
