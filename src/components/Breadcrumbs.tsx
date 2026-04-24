import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbCrumb {
  label: string;
  href?: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  portal: "Portal",
  admin: "Admin",
  inventory: "Inventory",
  receipts: "Receipts",
  ledger: "Ledger",
  production: "Production",
  reports: "Reports",
  workspaces: "Workspaces",
  modules: "Modules",
  access: "Access",
  settings: "Settings",
  audit: "Audit",
  furnaces: "Furnaces",
  shifts: "Shifts",
  materials: "Materials",
  "stock-locations": "Stock Locations",
  kpis: "KPIs",
  "report-deliveries": "Report Deliveries",
  roles: "Roles & Permissions",
};

function humanize(segment: string) {
  return segment
    .split("-")
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/**
 * Build crumb objects from a pathname. The last segment is returned without
 * an href so callers render it as the current page.
 */
export function buildBreadcrumbs(
  pathname: string,
  labelOverrides: Record<string, string> = {},
): BreadcrumbCrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const lookup = { ...DEFAULT_LABELS, ...labelOverrides };
  return segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const isLast = index === segments.length - 1;
    const label = lookup[segment] ?? humanize(segment);
    return isLast ? { label } : { label, href };
  });
}

interface BreadcrumbsProps {
  pathname: string;
  labelOverrides?: Record<string, string>;
  className?: string;
}

export function Breadcrumbs({ pathname, labelOverrides, className }: BreadcrumbsProps) {
  const crumbs = buildBreadcrumbs(pathname, labelOverrides);
  if (crumbs.length === 0) return null;
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {crumbs.map((crumb, idx) => (
          <Fragment key={`${crumb.label}-${idx}`}>
            <BreadcrumbItem>
              {crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link to={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {idx < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
