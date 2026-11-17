const PATHS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  sales: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  accounts: 'M6 4h12M6 9h12M9 4c5 0 5 10 0 10H6l8 7',
  operations: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  hr: 'M4 4h16v16H4zM9 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0M7 18c1-2 3-3 5-3s4 1 5 3',
  marketing: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8',
  rnd: 'M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-10V3',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
  staff: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  check: 'M5 12l5 5L20 7',
  plus: 'M12 5v14M5 12h14',
  shop: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
  food: 'M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11M17 2c-2 0-3 3-3 6s1 4 3 4v10',
  salon: 'M6 6a3 3 0 1 0 0 .01M6 18a3 3 0 1 0 0 .01M8.5 7.5L20 19M8.5 16.5L20 5',
  clinic: 'M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11zM12 9v5M9.5 11.5h5',
  services: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z',
  wholesale: 'M1 3h13v13H1zM14 8h4l3 3v5h-7M5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  factory: 'M2 20V9l6 4V9l6 4V4h4l2 16zM2 20h20',
  education: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6',
  others: 'M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M5 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M19 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.9 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name] || PATHS.others} />
    </svg>
  );
}
