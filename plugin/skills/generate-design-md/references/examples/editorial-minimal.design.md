---
name: Editorial Minimal
colors:
  primary: "#111111"
  secondary: "#555555"
  accent: "#C8102E"
  surface: "#FFFFFF"
  surface-tint: "#F5F5F0"
  on-surface: "#111111"
  on-surface-muted: "#777777"
typography:
  headline-display:
    fontFamily: Playfair Display
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.1
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
  body-lg:
    fontFamily: Georgia
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.8
  body-md:
    fontFamily: Georgia
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.75
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.12em
rounded:
  none: 0px
  sm: 2px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 32px
  xl: 64px
  section: 96px
  column: 720px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: 12px 24px
    typography: "{typography.label-caps}"
  tag:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.none}"
    padding: 4px 10px
  section-marker:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.none}"
    padding: 2px 8px
  body-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  caption:
    textColor: "{colors.on-surface-muted}"
---

# Editorial Minimal

## Overview

A stripped-back editorial design for a long-form publication or content-forward blog. The aesthetic is rooted in classic print typography — serif headlines, generous leading, restrained color. The experience should slow the reader down, not speed them up. Every design decision defers to the text.

## Colors

Near-monochrome with a single editorial red accent. Print-inspired.

- **Primary (#111111):** Warm near-black — softer than pure black on screen
- **Secondary (#555555):** Mid-gray for bylines, captions, dates
- **Accent (#C8102E):** Editorial red — used only for pull quotes, section markers, and key callouts. Never for interactive affordances.
- **Surface (#FFFFFF):** Pure white for reading columns
- **Surface Tint (#F5F5F0):** Warm paper tone for sidebar and interstitial zones
- **Border (#E5E5E0):** Warm hairlines for rule elements

## Typography

Serif for editorial voice. Sans-serif only for structural labels.

- **Headlines:** Playfair Display — authoritative, elegant, classic. Bold for impact.
- **Body:** Georgia — superior screen readability for long reads, 18px minimum, 1.8 line height
- **Labels/Caps:** Inter 11px all-caps with tracking — for categories, timestamps, section markers

## Layout

Single reading column, 720px max-width, centered. Wide outer margins for pull quotes and footnotes. No sidebar in article view.

Section spacing is generous (96px between content blocks) to give each piece room to breathe. Avoid cramping related content — distance creates meaning.

## Elevation & Depth

Completely flat. No shadows, no elevation. Depth comes from typography scale and whitespace hierarchy alone. Horizontal rules (1px, border color) are the only structural separator.

## Shapes

Sharp corners everywhere. Radius is 0 on all interactive elements — a deliberate rejection of the rounded-corner web default. Reinforces the print-editorial sensibility.

## Components

- **Buttons:** Full-width or inline, all-caps label, zero radius, 2px solid border. Think magazine subscription CTAs.
- **Tags / Categories:** Flat chips, no border, surface-tint background, caps label
- **Pull quotes:** Accent red left border (4px), Playfair Display italic, larger than body
- **Byline:** `label-caps` style — Author · Date · Read time, separated by interpuncts
- **Image captions:** `body-sm` in `on-surface-muted`, italic, 12px max-width from image edge

## Do's and Don'ts

- Do maintain 18px minimum body text — this is a reading experience, not a scanning experience
- Do let whitespace do the heavy lifting for hierarchy — resist filling gaps
- Don't use rounded corners anywhere, including images
- Don't use the accent red for links or buttons — it's a typographic device, not an interactive signal
- Do use the accent sparingly: one or two moments per page maximum
- Don't introduce additional font families
