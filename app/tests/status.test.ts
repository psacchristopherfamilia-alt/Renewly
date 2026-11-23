import { describe, expect, it } from "vitest";
import { daysBetween, licenceStatus, todayTci } from "@/lib/status";

const row = (filing: string | null, expires = "2026-12-31", items = 5, done = 5) => ({ expires_on: expires, filing_deadline: filing, required_items: items, required_done: done });

describe("licenceStatus", () => {
  it("counts days across months", () => {
    expect(daysBetween("2026-11-23", "2026-12-02")).toBe(9);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
  it("is urgent within 7 days of the filing deadline or once expired", () => {
    expect(licenceStatus(row("2026-12-02"), "2026-11-25")).toBe("bad");
    expect(licenceStatus(row("2026-12-02"), "2026-12-03")).toBe("bad");
    expect(licenceStatus(row(null, "2026-11-20"), "2026-11-23")).toBe("bad");
  });
  it("is urgent within 14 days when required items are pending", () => {
    expect(licenceStatus(row("2026-12-02", "2026-12-31", 6, 1), "2026-11-22")).toBe("bad");
    expect(licenceStatus(row("2026-12-02", "2026-12-31", 6, 6), "2026-11-22")).toBe("warn");
  });
  it("needs attention within 30 days or with pending required items", () => {
    expect(licenceStatus(row("2026-12-02"), "2026-11-20")).toBe("warn");
    expect(licenceStatus(row("2027-04-30", "2027-03-31", 3, 2), "2026-11-23")).toBe("warn");
  });
  it("is fine far from the deadline with the checklist complete", () => {
    expect(licenceStatus(row("2027-04-30", "2027-03-31", 3, 3), "2026-11-23")).toBe("ok");
  });
  it("uses Turks and Caicos time", () => {
    expect(todayTci(new Date("2026-11-24T03:00:00Z"))).toBe("2026-11-23");
  });
});
