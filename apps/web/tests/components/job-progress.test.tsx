import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobProgress, type JobView } from "@/components/dashboard/job-progress";

const queued: JobView = { id: "job-1", status: "queued", stage: null, progress: null, error: null };

function job(patch: Partial<JobView>): { job: JobView } {
  return { job: { ...queued, ...patch } };
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function tick(ms = 2000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("JobProgress", () => {
  it("polls until the job finishes, refreshes the page once, then stops", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => reply(job({ status: "processing", stage: "separating", progress: 40 })))
      .mockImplementation(async () => reply(job({ status: "completed", progress: 100 })));
    render(<JobProgress initial={queued} />);
    await tick();
    expect(screen.getByText("Separating vocals")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    await tick();
    expect(screen.getByText("Your karaoke track is ready.")).toBeTruthy();
    const calls = fetchMock.mock.calls.length;
    await tick(10_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(useRouter().refresh).toHaveBeenCalledTimes(1);
  });

  it("does not poll a job that is already finished", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<JobProgress initial={{ ...queued, status: "completed" }} />);
    await tick(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops when the job no longer exists", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply({ error: { code: "not_found", message: "Job not found" } }, 404));
    render(<JobProgress initial={queued} />);
    await tick();
    expect(screen.getByText("This job no longer exists.")).toBeTruthy();
    await tick(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("warns after repeated network failures and clears the warning on recovery", async () => {
    let healthy = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (!healthy) throw new TypeError("offline");
      return reply(job({ status: "processing", progress: 10 }));
    });
    render(<JobProgress initial={queued} />);
    await tick(2000 * 5);
    expect(screen.getByText("Lost connection to the server. Retrying...")).toBeTruthy();
    healthy = true;
    await tick();
    expect(screen.queryByText("Lost connection to the server. Retrying...")).toBeNull();
  });

  it("gives up after a long outage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    render(<JobProgress initial={queued} />);
    await tick(2000 * 31);
    expect(screen.getByText(/Reload the page/)).toBeTruthy();
    const calls = fetchMock.mock.calls.length;
    await tick(20_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("cancels a running job", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply(job({ status: "canceled", error: "Canceled by you" })));
    render(<JobProgress initial={{ ...queued, status: "processing", stage: "separating", progress: 30 }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/jobs/job-1/cancel");
    expect(init.method).toBe("POST");
    expect(screen.getByText("This job was canceled.")).toBeTruthy();
  });

  it("shows why a job failed and lets you retry it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply(job({ id: "job-2", status: "queued" })));
    render(<JobProgress initial={{ ...queued, status: "failed", error: "That file is not a readable audio file." }} />);
    expect(screen.getByText("That file is not a readable audio file.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByText("Waiting in the queue")).toBeTruthy();
  });

  it("reports an action that could not reach the server and re-enables the button", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    render(<JobProgress initial={{ ...queued, status: "failed", error: "boom" }} />);
    const button = screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    expect(button.disabled).toBe(false);
  });
});
