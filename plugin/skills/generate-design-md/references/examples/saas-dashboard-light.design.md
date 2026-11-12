---
name: SaaS Dashboard Light
colors:
  primary: "#2563EB"
  primary-hover: "#1D4ED8"
  secondary: "#64748B"
  surface: "#F8FAFC"
  surface-raised: "#FFFFFF"
  on-surface: "#0F172A"
  on-surface-muted: "#64748B"
  success: "#166534"
  error: "#991B1B"
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.05em
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  section: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: 10px 16px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  badge-success:
    backgroundColor: "#DCFCE7"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: 2px 8px
  badge-error:
    backgroundColor: "#FEE2E2"
    textColor: "{colors.error}"
    rounded: "{rounded.full}"
    padding: 2px 8px
  sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  nav-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
  text-muted:
    textColor: "{colors.on-surface-muted}"
---

# SaaS Dashboard

## Overview

A clean, professional light-mode dashboard for a B2B analytics platform. Designed for extended daily use — calm, information-dense, zero visual noise. Trust and clarity are the primary emotional targets.

## Colors

Blue is the single action color. Everything else is neutral.

- **Primary (#2563EB):** All CTAs, links, active nav states. Used sparingly.
- **Secondary (#64748B):** Captions, metadata, secondary labels.
- **Surface (#F8FAFC):** Page background — slightly off-white to reduce eye strain.
- **Surface Raised (#FFFFFF):** Cards and panels sit one level above the page.
- **On-surface (#0F172A):** Primary text. Near-black, not pure black.
- **Border (#E2E8F0):** Dividers and input borders.

## Typography

Inter throughout. Weight carries hierarchy — not size alone.

- **Headlines:** Semi-bold to bold, tight tracking for dashboard titles
- **Body:** 14px regular for table data and descriptions
- **Labels:** 12px medium, slightly spaced, for column headers and tags

## Layout

12-column grid, 24px gutters, 1280px max-width container. Sidebar fixed at 240px. Content area scrolls independently.

Spacing scale is 4px-based. Use `md` (16px) as the default component padding unit.

## Elevation & Depth

Flat design. Depth through background contrast: `surface` (#F8FAFC) under `surface-raised` (#FFFFFF) cards with a 1px `border` (#E2E8F0). No drop shadows on primary surfaces. Subtle `box-shadow: 0 1px 3px rgba(0,0,0,0.06)` on modals and dropdowns only.

## Shapes

Consistent 8px radius on interactive elements. 12px on cards. Full-pill on status badges and avatar chips.

## Components

- **Buttons:** Primary is solid blue fill; secondary is white with border. No ghost buttons in data-dense contexts.
- **Cards:** White panels with 1px border and 12px radius. 24px internal padding.
- **Tables:** No outer border. Row dividers only. Alternating row tints optional.
- **Badges:** Pill-shaped, color-coded background tints for status (success green, error red, neutral gray).
- **Inputs:** 1px border, 8px radius, 10px vertical padding.

## Do's and Don'ts

- Do use primary blue for one action per screen — the most important one
- Do maintain 14px minimum for body text in data tables
- Don't use color alone to convey status — always pair with a label or icon
- Don't exceed 3 levels of visual hierarchy per card
- Do use `on-surface-muted` for secondary metadata, never drop below 4.5:1 contrast
