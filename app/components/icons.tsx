const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

function svgProps(className?: string, size = 20) {
  return {
    ...base,
    className,
    width: size,
    height: size,
    "aria-hidden": true as const,
  };
}

export function IconHome({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function IconFolder({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

export function IconDoc({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

export function IconCard({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 15h4" />
    </svg>
  );
}

export function IconWallet({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
      <path d="M16 14h2" />
    </svg>
  );
}

export function IconUsers({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6" />
      <path d="M17.5 15.2c1.8.7 3 2.3 3.3 4.8" />
    </svg>
  );
}

export function IconChart({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M21 20H3" />
    </svg>
  );
}

export function IconSettings({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.7 4.7l1.7 1.7M17.6 17.6l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.7 19.3l1.7-1.7M17.6 6.4l1.7-1.7" />
    </svg>
  );
}

export function IconPlus({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconCalendar({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconChevron({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconLeaf({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M5 19c0-8 5-13 14-14-1 9-5 14-14 14Z" />
      <path d="M5 19c3-4 6-6 10-7.5" />
    </svg>
  );
}

export function IconMenu({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconX({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function IconLogout({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h9" />
    </svg>
  );
}

export function IconSun({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function IconMoon({ className, size }: { className?: string; size?: number }) {
  return (
    <svg {...svgProps(className, size)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
