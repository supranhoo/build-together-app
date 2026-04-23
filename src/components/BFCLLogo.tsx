import { cn } from "@/lib/utils";

interface BFCLLogoProps {
  className?: string;
  theme?: "light" | "dark";
  iconOnly?: boolean;
}

export function BFCLLogo({ className = "w-40", theme = "light", iconOnly = false }: BFCLLogoProps) {
  const textColor = theme === "dark" ? "#FFFFFF" : "#232E64";

  const cx = 65;
  const cy = 60;
  const Ri = 32;
  const Ro = 46;
  const Rt = 58;

  const pt = (r: number, a: number) => {
    const rad = (a - 90) * Math.PI / 180;
    return `${cx + r * Math.cos(rad)} ${cy + r * Math.sin(rad)}`;
  };

  const getQuadrantPath = () => `
    M ${pt(Ri, 3)}
    A ${Ri} ${Ri} 0 0 1 ${pt(Ri, 87)}
    L ${pt(Rt, 87)}
    A ${Rt} ${Rt} 0 0 0 ${pt(Rt, 79)}
    L ${pt(Ro, 72)}
    A ${Ro} ${Ro} 0 0 0 ${pt(Ro, 63)}
    L ${pt(Rt, 56)}
    A ${Rt} ${Rt} 0 0 0 ${pt(Rt, 34)}
    L ${pt(Ro, 27)}
    A ${Ro} ${Ro} 0 0 0 ${pt(Ro, 18)}
    L ${pt(Rt, 11)}
    A ${Rt} ${Rt} 0 0 0 ${pt(Rt, 3)}
    Z
  `;

  const pathD = getQuadrantPath();

  const gearPaths = (
    <g>
      <path d={pathD} fill="#F4A911" />
      <path d={pathD} fill="#149B49" transform={`rotate(90 ${cx} ${cy})`} />
      <path d={pathD} fill="#0F82C6" transform={`rotate(180 ${cx} ${cy})`} />
      <path d={pathD} fill="#E0262B" transform={`rotate(270 ${cx} ${cy})`} />
    </g>
  );

  if (iconOnly) {
    return (
      <svg viewBox="2 2 126 116" className={cn(className)} xmlns="http://www.w3.org/2000/svg" aria-label="BFCL logo">
        {gearPaths}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 300 120" className={cn(className)} xmlns="http://www.w3.org/2000/svg" aria-label="BFCL logo">
      {gearPaths}
      <text x="68" y="76" fontFamily="Arial, Helvetica, sans-serif" fontSize="70" fontWeight="900" fill={textColor}>BFCL</text>
      <text x="254" y="36" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="bold" fill={textColor}>®</text>
      <text x="145" y="96" fontFamily="Georgia, serif" fontStyle="italic" fontSize="15" fontWeight="bold" fill={textColor}>Driven by Quality</text>
      <text x="145" y="112" fontFamily="Georgia, serif" fontStyle="italic" fontSize="15" fontWeight="bold" fill={textColor}>with Commitment</text>
    </svg>
  );
}
