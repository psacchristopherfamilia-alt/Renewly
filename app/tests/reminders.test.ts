import { describe, expect, it } from "vitest";
import { buildReminderEmail, type DueReminder } from "@/lib/reminders";

const base: DueReminder = {
  tenant_id: "t", organization: "Island <Villas>", license_id: "l", property_name: "Villa <b>Coral</b>", license_type: "accommodation",
  deadline: "2026-12-02", expires_on: "2026-12-31", days_left: 7, kind: "d7", required_items: 6, required_done: 4,
  recipients: [{ email: "a@b.tc", name: "A", locale: "es" }],
};

describe("buildReminderEmail", () => {
  it("writes the deadline, days left and checklist progress in Spanish", () => {
    const m = buildReminderEmail(base, "es", "https://app.renewly.example/");
    expect(m.subject).toBe("Villa <b>Coral</b>: solicitar renovación antes del 2 de diciembre de 2026");
    expect(m.text).toContain("en 7 días");
    expect(m.text).toContain("4 de 6");
    expect(m.text).toContain("https://app.renewly.example/dashboard");
  });
  it("escapes names in the HTML", () => {
    const m = buildReminderEmail(base, "es", "https://x");
    expect(m.html).not.toContain("<b>Coral</b>");
    expect(m.html).toContain("Island &lt;Villas&gt;");
  });
  it("says tomorrow, today and overdue in English", () => {
    expect(buildReminderEmail({ ...base, days_left: 1 }, "en", "https://x").text).toContain("tomorrow");
    expect(buildReminderEmail({ ...base, days_left: 0 }, "en", "https://x").text).toContain("today");
    const late = buildReminderEmail({ ...base, days_left: -3, kind: "overdue" }, "en", "https://x");
    expect(late.subject).toContain("has passed");
    expect(late.text).toContain("$50,000");
  });
});
