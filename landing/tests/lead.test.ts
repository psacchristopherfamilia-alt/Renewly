import { describe, expect, it } from "vitest";
import { LEADS_PER_IP_PER_HOUR, escapeHtml, hashIp, isRateLimited, leadEmailHtml, leadSchema } from "@/lib/lead";

const valid = {
  name: "Ana Smith",
  email: "Ana@Example.com ",
  properties: "12",
  plan: "manager",
  consent: true,
  locale: "en",
};

describe("leadSchema", () => {
  it("accepts a valid lead and normalises it", () => {
    const r = leadSchema.parse(valid);
    expect(r.email).toBe("ana@example.com");
    expect(r.properties).toBe(12);
    expect(r.plan).toBe("manager");
    expect(r.phone).toBe("");
  });

  it("requires consent", () => {
    expect(leadSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it("rejects a filled honeypot", () => {
    expect(leadSchema.safeParse({ ...valid, website: "http://spam" }).success).toBe(false);
  });

  it.each([
    ["bad email", { email: "nope" }],
    ["zero properties", { properties: 0 }],
    ["unknown plan", { plan: "enterprise" }],
    ["unknown locale", { locale: "fr" }],
    ["letters in phone", { phone: "call me" }],
    ["too long message", { message: "x".repeat(2001) }],
  ])("rejects %s", (_label, patch) => {
    expect(leadSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks at the hourly limit", () => {
    expect(isRateLimited(LEADS_PER_IP_PER_HOUR - 1)).toBe(false);
    expect(isRateLimited(LEADS_PER_IP_PER_HOUR)).toBe(true);
  });

  it("hashes IPs deterministically without exposing them", async () => {
    const a = await hashIp("1.2.3.4", "salt");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(await hashIp("1.2.3.4", "salt"));
    expect(a).not.toBe(await hashIp("1.2.3.4", "other"));
    expect(a).not.toContain("1.2.3.4");
  });
});

describe("owner email", () => {
  it("escapes user input", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
    const html = leadEmailHtml(leadSchema.parse({ ...valid, name: "<b>Eve</b>", message: "hi\n<img src=x>" }));
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  });
});
