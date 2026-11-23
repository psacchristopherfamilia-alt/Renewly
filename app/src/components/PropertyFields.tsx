import type { Dictionary } from "@/i18n/es";
import { input, label } from "./ui";

const ISLANDS = ["providenciales", "grand_turk", "north_caicos", "middle_caicos", "south_caicos", "salt_cay", "other"];

type Values = { name?: string; island?: string; area?: string; address?: string; owner_name?: string; has_pool?: boolean; notes?: string };

/** Shared fields of the property form (create and edit). */
export function PropertyFields({ p, v = {}, disabled }: { p: Dictionary["portfolio"]; v?: Values; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <label className={label}>{p.name}<input name="name" required minLength={2} maxLength={120} defaultValue={v.name} className={input} /></label>
      <label className={label}>
        {p.island}
        <select name="island" defaultValue={v.island ?? "providenciales"} className={input}>
          {ISLANDS.map((i) => <option key={i} value={i}>{p.islands[i]}</option>)}
        </select>
      </label>
      <label className={label}>{p.area}<input name="area" maxLength={80} defaultValue={v.area} className={input} /></label>
      <label className={label}>{p.owner}<input name="owner_name" maxLength={120} defaultValue={v.owner_name} className={input} /></label>
      <label className={`${label} sm:col-span-2`}>{p.address}<input name="address" maxLength={200} defaultValue={v.address} className={input} /></label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input name="has_pool" type="checkbox" defaultChecked={v.has_pool} className="h-4 w-4 accent-[var(--brand)]" /> {p.pool}
      </label>
      <label className={`${label} sm:col-span-2`}>{p.notes}<textarea name="notes" rows={2} maxLength={2000} defaultValue={v.notes} className={input} /></label>
    </fieldset>
  );
}
