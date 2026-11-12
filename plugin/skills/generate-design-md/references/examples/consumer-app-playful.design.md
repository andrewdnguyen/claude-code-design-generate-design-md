---
name: Playful Consumer App
colors:
  primary: "#7C3AED"
  primary-light: "#EDE9FE"
  secondary: "#F59E0B"
  surface: "#FAFAF9"
  surface-raised: "#FFFFFF"
  on-surface: "#1C1917"
  on-surface-muted: "#78716C"
  success: "#047857"
  error: "#E11D48"
typography:
  display:
    fontFamily: Poppins
    fontSize: 40px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Poppins
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.25
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1
rounded:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  section: 80px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: 14px 28px
    typography: "{typography.label-md}"
  button-secondary:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 14px 28px
  chip:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 6px 14px
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 20px
  screen-background:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  reward-badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  text-secondary:
    textColor: "{colors.on-surface-muted}"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: 6px 14px
  status-error:
    backgroundColor: "{colors.error}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: 6px 14px
---

# Playful Consumer App

## Overview

A vibrant, energetic consumer app for a social hobby-tracking platform. The design should feel encouraging and fun — celebrating user progress, not overwhelming them. Bold typography, generous whitespace, and a purple-led palette create a distinctive, memorable identity.

Target audience: casual users aged 18–35 on mobile.

## Colors

Purple as the hero color, amber as the accent, warm neutrals for backgrounds.

- **Primary (#7C3AED):** Deep violet — brand identity, CTAs, active states
- **Primary Light (#EDE9FE):** Tinted lavender for chips, secondary buttons, highlights
- **Secondary (#F59E0B):** Warm amber for rewards, streaks, celebratory moments
- **Surface (#FAFAF9):** Warm off-white — friendlier than cold gray
- **On-surface (#1C1917):** Warm near-black for primary text

## Typography

Poppins for personality in headlines. Inter for readable body copy.

- **Display:** 40px extra-bold with tight tracking — hero screens and onboarding
- **Headlines:** 22px bold Poppins for section titles and card headers
- **Body:** 16px Inter regular — comfortable reading at arm's length on mobile
- **Labels:** 13px Inter semi-bold for buttons and tags

## Layout

Mobile-first, single-column. 16px horizontal screen margin. 80px vertical section spacing. Generous 24px padding inside cards. Bottom navigation bar.

## Elevation & Depth

Soft, playful shadows. Cards use `box-shadow: 0 4px 16px rgba(124,58,237,0.08)` — a subtle purple tint that reinforces brand color rather than generic gray shadows.

## Shapes

Fully rounded language throughout. Pill buttons, 24px card corners, full-circle avatars. Rounded shapes signal friendliness; sharp corners are never used.

## Components

- **Buttons:** Full pill shape, solid primary for main actions, light-tinted secondary for alternatives
- **Cards:** 24px radius, soft violet-tinted shadow. No border.
- **Chips:** Pill tags in primary-light for categories and filters
- **Progress bars:** Full-pill track, primary-filled, animated on load
- **Avatars:** Circle only, 40px default, 56px in profile contexts

## Do's and Don'ts

- Do use the amber secondary for streaks, rewards, and achievement moments only
- Do include motion/animation on progress updates — celebration is part of the UX
- Don't use sharp corners anywhere — breaks the rounded visual language
- Don't use more than two font families (Poppins + Inter)
- Do maintain generous touch targets — 48px minimum height for interactive elements
- Don't crowd screens; whitespace is intentional and generous
