export const palette = {
  lacquer: 0x12080b,
  burgundy: 0x790a32,
  amber: 0xc9762f,
  gold: 0xf1c07a,
  parchment: 0xf1e4d0,
};

// Order matters: the index is the channel id shared by the DOM list (data-channel)
// and the particle streams.
export const channels = [
  { id: "whatsapp", color: 0x25d366 },
  { id: "instagram", color: 0xe1306c },
  { id: "messenger", color: 0x2e8bff },
  { id: "telegram", color: 0x2aabee },
  { id: "sms", color: 0xf1e4d0 },
  { id: "x", color: 0xd9dde3 },
  { id: "discord", color: 0x7983f5 },
  { id: "voice", color: 0xf0990e },
  { id: "web", color: 0x34d399 },
] as const;
