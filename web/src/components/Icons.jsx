// Vizual belgilar — o'zimiz chizgan SVG ikonkalar (tashqi kutubxona yo'q).
// Barcha ikonkalar bir xil uslubda: 24px viewBox, 1.8 qalinlik, currentColor.
import React from 'react';

const make = (...paths) => {
  const Icon = ({ size = 20, ...props }) => (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {paths}
    </svg>
  );
  return Icon;
};

export const IconHome = make(
  <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /></>
);
export const IconHeart = make(
  <path d="M12 20.5S4 15 4 9.6C4 6.9 6 5 8.4 5c1.5 0 2.9.8 3.6 2 .7-1.2 2.1-2 3.6-2C18 5 20 6.9 20 9.6c0 5.4-8 10.9-8 10.9Z" />
);
export const IconCart = make(
  <>
    <path d="M3 4h2.2l2.1 11.2A2 2 0 0 0 9.3 17h8.4a2 2 0 0 0 2-1.6L21 8H6" />
    <circle cx="10" cy="20.2" r="1.3" /><circle cx="17.5" cy="20.2" r="1.3" />
  </>
);
export const IconReceipt = make(
  <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>
);
export const IconUser = make(
  <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c1.3-3.2 4.1-4.8 7.5-4.8s6.2 1.6 7.5 4.8" /></>
);
export const IconSearch = make(
  <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></>
);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconMinus = make(<path d="M5 12h14" />);
export const IconTrash = make(
  <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7 7.4 20h9.2l.9-13" /></>
);
export const IconPin = make(
  <><path d="M12 21s-6.5-5.4-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.6-6.5 10-6.5 10Z" /><circle cx="12" cy="11" r="2.3" /></>
);
export const IconStore = make(
  <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0" /><path d="M5.5 12v8h13v-8" /></>
);
export const IconClock = make(
  <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>
);
export const IconPhone = make(
  <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />
);
export const IconDownload = make(
  <><path d="M12 4v10" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" /></>
);
export const IconPencil = make(
  <><path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z" /><path d="m12.5 7.5 4 4" /></>
);
export const IconX = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IconChevronRight = make(<path d="m9 5 7 7-7 7" />);
export const IconChevronLeft = make(<path d="m15 5-7 7 7 7" />);
export const IconBox = make(
  <><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" /><path d="M4 7l8 4 8-4" /><path d="M12 11v10" /></>
);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7" />);
export const IconBike = make(
  <>
    <circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" />
    <path d="M6 17 9 8h3" /><path d="m9 8 5 9h-2" /><path d="M14 8h4l-2 4" />
  </>
);
export const IconTag = make(
  <><path d="m3.5 12.5 8-8.5H20v8.5l-8.5 8a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8Z" /><circle cx="16" cy="8" r="1.4" /></>
);
export const IconChart = make(
  <><path d="M4 20h16" /><path d="M7 20v-7" /><path d="M12 20V6" /><path d="M17 20v-10" /></>
);
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
  </>
);

// Brend logotipi (shokolad plitasi)
export const Logo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--color-primary-600)" />
    <g fill="var(--color-primary-100)">
      <rect x="8" y="7" width="7" height="7" rx="2" />
      <rect x="17" y="7" width="7" height="7" rx="2" />
      <rect x="8" y="16" width="7" height="7" rx="2" />
      <rect x="17" y="16" width="7" height="7" rx="2" />
    </g>
  </svg>
);
