import type { MetadataRoute } from "next";

// The app is private: nothing to index (the public pages live on the sales site).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
