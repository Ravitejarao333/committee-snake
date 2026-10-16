import { createAudio } from "./audio";
import { createDriver } from "./game";
import { attachInput } from "./input";
import { createLcd } from "./render/lcd";
import { createPhone } from "./render/phone";

/** Entry: narrow the one DOM lookup, wire the pieces, start the rAF loop. */
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("missing #app");

const phone = createPhone(app);
const lcd = createLcd(phone.canvas, phone.slot);
const audio = createAudio();
phone.setMuted(audio.muted);

const driver = createDriver(lcd, phone, audio);
attachInput({ keypad: phone.keypad, canvas: phone.canvas, light: phone.light }, driver.handlers);

const loop = (now: number): void => {
  driver.frame(now);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
