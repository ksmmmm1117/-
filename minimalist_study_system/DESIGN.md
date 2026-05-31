---
name: Minimalist Study System
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#4c4546'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e3e2e2'
  on-secondary-container: '#646464'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1a1c1c'
  on-tertiary-container: '#838484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  border-subtle: '#E5E5E5'
  border-strong: '#000000'
  surface-muted: '#FAFAFA'
  text-caption: '#666666'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

This design system is built on the principles of **Minimalism** and **Modern Professionalism**. It is designed to remove cognitive load for users engaged in deep study or complex task management. The aesthetic is "monastic digital"—striking a balance between the void of a fresh sheet of paper and the precision of a high-end editorial layout.

The target audience consists of students and professionals who require a distraction-free environment. By utilizing a strictly monochrome palette and significant negative space, the system directs the user's focus entirely toward their goals and progress data. The emotional response is one of clarity, intentionality, and calm authority.

## Colors

The color strategy is defined by extreme high contrast and the absence of hue. 

- **Primary Background:** Absolute White (`#FFFFFF`) is used for all main surfaces to create a sense of infinite space and cleanliness.
- **Primary Action/Text:** Pure Black (`#000000`) is reserved for high-level headings, primary buttons, and critical UI elements.
- **Secondary/Neutral:** A scale of neutral grays handles non-critical information. `#E5E5E5` serves as the standard border color to define boundaries without adding visual noise.
- **Functional Use:** Secondary actions use a subtle gray background (`#F5F5F5`) to remain distinct from the primary white canvas while maintaining a low profile.

## Typography

This design system utilizes **Inter** exclusively to achieve a systematic, utilitarian, and highly legible interface. The typographic hierarchy is strict, using font weight and scale rather than color to denote importance.

- **Headlines:** Use tighter letter spacing and bold weights to command attention against the white background.
- **Body Text:** Set with generous line height to ensure readability during long study sessions.
- **Labels:** Small caps or medium weights are used for metadata and utility labels to differentiate them from prose.
- **Mobile Adaptation:** Large display titles scale down significantly on mobile to prevent excessive scrolling, while body text remains consistent for accessibility.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy on desktop to preserve the "serene" whitespace that defines the brand. Content is centered within a 1200px max-width container, preventing lines of text from becoming too wide to read comfortably.

- **Rhythm:** An 8px linear scale governs all padding and margins.
- **Desktop:** 12-column grid with 24px gutters. Large 40px outer margins create a "frame" effect around the content.
- **Mobile:** 4-column fluid grid. Gutters shrink to 16px to maximize horizontal space for task lists and timers.
- **Vertical Spacing:** Generous section spacing (64px+) is encouraged to separate different mental contexts (e.g., separating the "Timer" from "Statistics").

## Elevation & Depth

To maintain the minimalist aesthetic, this design system eschews traditional shadows in favor of **Low-Contrast Outlines** and **Tonal Layering**.

- **Surface Levels:** 
  - Level 0 (Background): `#FFFFFF`
  - Level 1 (Cards/Containers): `#FFFFFF` with a 1px border of `#E5E5E5`.
  - Level 2 (Active/Hover): `#FFFFFF` with a 1px border of `#000000`.
- **Shadows:** Use only for temporary overlays (modals or dropdowns). These should be "Ambient Shadows"—extremely diffused, light gray, with no harsh edges (e.g., `0 10px 30px rgba(0,0,0,0.05)`).
- **Depth through Contrast:** Depth is primarily communicated by placing solid black elements (buttons) on the white background, creating a visual "pop" without physical 3D effects.

## Shapes

The shape language is **Soft**, utilizing a consistent 4px (0.25rem) corner radius. 

- **Rationale:** Sharp 90-degree corners are too aggressive for a "calm" system, while pill-shaped buttons are too playful. The 4px radius provides a professional, "tailored" look that feels modern but grounded.
- **Consistency:** This radius applies to buttons, input fields, and cards. 
- **Icons:** Should be stroke-based (outline) with a 1.5px or 2px weight to match the precision of the typography.

## Components

### Buttons
- **Primary:** Solid black background with white text. No border. Sharp 4px corners. 
- **Secondary:** White background with a 1px border of `#E5E5E5`. Text is black.
- **States:** On hover, primary buttons shift to a very dark gray (`#262626`). Secondary buttons shift to a light gray background (`#F5F5F5`).

### Input Fields
- **Default:** White background with a 1px border of `#E5E5E5`. 
- **Focus:** Border changes to `#000000`. No "glow" or outer shadow.
- **Placeholder:** Text in `#A3A3A3` for a muted appearance.

### Cards
- Standard containers for study tasks or statistics. White background, 1px border of `#E5E5E5`. 
- Internal padding should be a minimum of 24px to maintain the clean aesthetic.

### Chips/Tags
- Used for categories (e.g., "Math", "Reading").
- Light gray background (`#F5F5F5`) with `#666666` text. Small 4px radius.

### Timer Display
- Massive, centered typography (`headline-xl`) in pure black.
- High visual priority. All other UI elements should recede when the timer is active.

### Progress Bars
- Background track: `#F5F5F5`.
- Fill: Solid `#000000`. 
- Height should be thin (4px or 8px) to remain elegant and non-intrusive.