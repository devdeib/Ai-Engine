import type { Metadata } from "next";
import { DEMO_PROPERTIES } from "@/modules/dashboard/demo-catalog";

export const metadata: Metadata = { title: "Properties" };

export default function PropertiesPage() {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="py-3 pr-4 font-medium">Listing</th>
              <th className="py-3 pr-4 font-medium">Community</th>
              <th className="py-3 pr-4 font-medium">Price</th>
              <th className="py-3 pr-4 font-medium">Beds / Baths</th>
              <th className="py-3 pr-4 font-medium">Size</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 font-medium">Matched lead</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_PROPERTIES.map((property) => (
              <tr
                key={property.id}
                className="border-b border-border/70 last:border-0 hover:bg-zeus-blue/10"
              >
                <td className="py-3.5 pr-4 font-medium text-foreground">
                  {property.title}
                </td>
                <td className="py-3.5 pr-4 text-muted-foreground">
                  {property.community}
                </td>
                <td className="py-3.5 pr-4 tabular-nums text-foreground">
                  {property.price}
                </td>
                <td className="py-3.5 pr-4 text-muted-foreground">
                  {property.beds} / {property.baths}
                </td>
                <td className="py-3.5 pr-4 tabular-nums text-muted-foreground">
                  {property.area}
                </td>
                <td className="py-3.5 pr-4">
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-zeus-blue/12 text-zeus-blue">
                    {property.status}
                  </span>
                </td>
                <td className="py-3.5 text-muted-foreground">
                  {property.matchedLead}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
