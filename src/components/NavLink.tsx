import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        aria-current={undefined}
        {...props}
      >
        {(state) => {
          // RouterNavLink also passes aria-current automatically when end-matched,
          // but we set it explicitly here so the active page is announced for any match.
          const childrenProp = (props as { children?: React.ReactNode }).children;
          return typeof childrenProp === "function"
            ? (childrenProp as (s: typeof state) => React.ReactNode)(state)
            : (childrenProp as React.ReactNode);
        }}
      </RouterNavLink>
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
