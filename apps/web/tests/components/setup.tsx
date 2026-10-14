import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const paused = new WeakMap<HTMLMediaElement, boolean>();
Object.defineProperty(HTMLMediaElement.prototype, "paused", {
  configurable: true,
  get() {
    return paused.get(this) ?? true;
  },
});
HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
  paused.set(this, false);
  this.dispatchEvent(new Event("play"));
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
  if (paused.get(this) === false) {
    paused.set(this, true);
    this.dispatchEvent(new Event("pause"));
  }
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  router.refresh.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
});
