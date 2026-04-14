# Design System Document

## 1. Overview & Creative North Star: "The Digital Archivist"

This design system is a digital translation of the high-end, academic editorial tradition. It moves beyond standard "minimalism" into the realm of **The Digital Archivist**. The goal is not just to display information, but to curate it with an air of prestigious authority and timeless clarity.

The system rejects the "boxed-in" nature of traditional web design. Instead of rigid grids and heavy containers, we utilize **intentional asymmetry** and **expansive negative space** to guide the eye. This is a system of "Atmospheric Precision"—where the silence between elements is as important as the elements themselves. By leveraging the contrast between a classical Serif (Newsreader) and a functional Sans-serif (Manrope), we create a dialogue between tradition and progress.

---

## 2. Colors: The Ivory & Ink Palette

The palette is rooted in the physical world: aged paper and deep, archival ink.

### Core Tones
*   **Surface (#FBF9F4):** Our "Off-white" foundation. It is softer than pure white, reducing eye strain and providing a premium, vellum-like feel. This maps to `neutral_color_hex`.
*   **Primary Container (#002147):** A deep, institutional navy. Used for high-impact accents and foundational UI elements. This maps to `primary_color_hex`.
*   **On-Surface (#1A1A1A):** Our "Charcoal" ink. High contrast for readability, but softer than absolute black to maintain the editorial warmth. This maps to `secondary_color_hex`.
*   **Tertiary Accent (#7c6559):** An additional accent color for highlights, badges, or decorative elements, providing a subtle, rich contrast. This maps to `tertiary_color_hex`.

### The "No-Line" Rule
To maintain the "Harvard CV" prestige, **1px solid borders are strictly prohibited** for sectioning content. Boundaries must be defined through:
1.  **Tonal Shifts:** Placing a `surface-container-low` section against the `surface` background.
2.  **Negative Space:** Using the spacing scale (set to `2` for normal density) to create mental boundaries rather than physical ones.

### Surface Hierarchy & Nesting
Treat the interface as layered sheets of heavy cardstock.
*   **Level 0 (Foundation):** `surface` (#fbf9f4)
*   **Level 1 (Subtle Inset):** `surface-container-low` (#f5f3ee) for large secondary background areas.
*   **Level 2 (Active/Lifted):** `surface-container-highest` (#e4e2dd) for small UI elements that need to pop.

### Signature Textures
While the request specifies "no heavy gradients," a **Micro-Gradient** is permitted for primary CTAs. Transition from `primary` (#000a1e) to `primary_container` (#002147) at a 45-degree angle. This provides a "latte" sheen—a subtle depth that feels expensive rather than digital.

---

## 3. Typography: The Academic Dialogue

The typography is a study in hierarchy, balancing the "Voice of Authority" (Serif) with the "Voice of Utility" (Sans-serif).

### The Editorial Scale (Newsreader)
*   **Display (LG/MD/SM):** Set with tight letter-spacing (-0.02em). Use for hero statements and major section headers. This corresponds to `headline_font`.
*   **Headline (LG/MD/SM):** The core of the academic feel. These should always sit on their own line with generous `margin-bottom`.

### The Utility Scale (Manrope)
*   **Title (LG/MD/SM):** Used for functional areas (Card titles, Modal headers). This bridges the gap between the display serif and the body text.
*   **Body (LG/MD/SM):** Optimised for long-form reading. Line height should be generous (1.6x for `body-lg`). This corresponds to `body_font`.
*   **Label (MD/SM):** Always uppercase with +0.05em letter-spacing for a clean, architectural look. This corresponds to `label_font`.

---

## 4. Elevation & Depth: Tonal Layering

This system rejects shadows in favor of **Tonal Layering**. We communicate "up" and "down" through color temperature rather than light projection.

*   **The Layering Principle:** To "lift" a card, do not add a shadow. Instead, shift the background color. Place a `surface-container-lowest` (#ffffff) card on a `surface-container` (#f0eee9) background.
*   **The "Ghost Border" Fallback:** In rare cases where a container needs a hard edge (e.g., an image in a light-colored gallery), use the `outline_variant` (#c4c6cf) at **20% opacity**. It should be felt, not seen.
*   **Glassmorphism:** For floating navigation bars or "hovering" menus, use `surface` (#fbf9f4) at 80% opacity with a `backdrop-filter: blur(12px)`. This keeps the "paper" feel while allowing content to flow underneath.

---

## 5. Components: Precision Primitive Styling

### Buttons
*   **Primary:** Background `primary_container` (`#002147`), text `on_primary`. **Sharp 0px corners.** Padding: `12px 32px`.
*   **Secondary:** Background `transparent`, border `outline_variant` (20% opacity), text `primary`.
*   **Tertiary:** Text `primary` with a 1px underline that appears only on hover.

### Input Fields
*   **Style:** No background fill. Only a bottom border (1px, `outline_variant`). 
*   **Focus State:** Bottom border thickens to 2px and changes to `primary_container` (`#002147`). Label moves above the field in `label-sm` (Manrope).

### Cards & Lists
*   **The Divider Rule:** Strictly no horizontal rules (`<hr>`). Use `32px` or `48px` of vertical white space to separate list items, leveraging the `spacing` scale (currently `2` for normal).
*   **Hover State:** Cards should not "pop" or grow. On hover, the background should shift subtly to `surface-container-high`.

### Specialized Component: The "Academic Sidebar"
For complex layouts, use a sticky sidebar in `surface-container-low`. It should house the `label-sm` navigation elements, acting as a "table of contents" for the page.

---

## 6. Do’s and Don’ts

### Do
*   **Do** embrace extreme white space, guided by a `spacing` scale of `2`. If a layout feels "empty," it is likely correct.
*   **Do** use "Optical Alignment." Because we lack borders, text must be perfectly aligned to the same vertical axis.
*   **Do** use `primary_container` (`#002147`) sparingly as a "spot color" to draw attention to the most important action on a page.

### Don't
*   **Don't** use border-radius. Every corner in this system must be a sharp **0px**. Rounded corners break the "Academic/Professional" atmosphere.
*   **Don't** use standard "Grey" (#808080). Use the `secondary` (`#1A1A1A`) or `on_surface_variant` (#44474e) tokens to maintain the charcoal/warm-grey tonal consistency.
*   **Don't** stack more than three levels of surface containers. It leads to visual "muddiness." Keep it flat, keep it clear.