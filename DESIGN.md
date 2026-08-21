---
name: Vocabulary Voice Tutor
description: A paper-and-cobalt specimen cabinet for focused English-German voice and spelling practice.
colors:
  cobalt: "#1747d1"
  cobalt-dark: "#102454"
  cobalt-light: "#dce6ff"
  paper: "#f4f0e7"
  paper-light: "#fffdf7"
  ink: "#172038"
  muted: "#626a78"
  rule: "#c9c3b5"
  yellow: "#f9d651"
  coral: "#e54b2b"
  coral-action: "#b3311d"
  green: "#197353"
  green-light: "#dcefe7"
  red-light: "#f8dfda"
typography:
  display:
    fontFamily: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 12vw, 5.4rem)"
    lineHeight: 0.95
    letterSpacing: "-0.05em"
    fontVariation: "'wght' 780"
  headline:
    fontFamily: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, sans-serif"
    fontSize: "clamp(2rem, 7vw, 3.5rem)"
    lineHeight: 0.98
    letterSpacing: "-0.045em"
    fontVariation: "'wght' 720"
  title:
    fontFamily: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, sans-serif"
    fontSize: "1.45rem"
    lineHeight: 1.08
    letterSpacing: "-0.025em"
    fontVariation: "'wght' 720"
  body:
    fontFamily: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "normal"
    letterSpacing: "normal"
  field-label:
    fontFamily: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 680
    lineHeight: "normal"
    letterSpacing: "normal"
  specimen-meta:
    fontFamily: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, sans-serif"
    fontSize: "0.73rem"
    lineHeight: "normal"
    letterSpacing: "0.1em"
    fontVariation: "'wght' 800"
  action:
    fontFamily: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: "normal"
    letterSpacing: "normal"
    fontVariation: "'wght' 700"
rounded:
  structural: "0px"
  control: "8px"
spacing:
  tight: "0.45rem"
  small: "0.7rem"
  medium: "0.8rem"
  base: "1rem"
  large: "1.2rem"
  xlarge: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "#ffffff"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0.7rem 1rem"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.cobalt-dark}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0.7rem 1rem"
    height: "48px"
  field:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.72rem 0.85rem"
    height: "52px"
  cabinet-header:
    backgroundColor: "{colors.cobalt}"
    textColor: "#ffffff"
    rounded: "{rounded.structural}"
    padding: "0.9rem 1rem"
    height: "78px"
  card-drawer:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.structural}"
    padding: "1.3rem"
  choice-card:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.structural}"
    padding: "0.85rem"
    height: "88px"
  choice-card-selected:
    backgroundColor: "{colors.cobalt-light}"
    textColor: "{colors.cobalt-dark}"
  practice-specimen:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.structural}"
    padding: "1.2rem"
  record-button:
    backgroundColor: "{colors.coral-action}"
    textColor: "#ffffff"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0.7rem 1rem"
    height: "76px"
  feedback-panel:
    backgroundColor: "{colors.cobalt-light}"
    textColor: "{colors.cobalt-dark}"
    rounded: "{rounded.structural}"
    padding: "0.9rem"
---

# Design System: Vocabulary Voice Tutor

## Overview

**Creative North Star: "Language Specimen Cabinet"**

Vocabulary Voice Tutor realizes the Creative North Star as a working language specimen cabinet: a warm paper field is ruled at 48px intervals, cobalt frames the application, and word lists become thick-bordered drawers with coral index tabs, measurement ticks, and numbered entries. The shipped PWA icon repeats the same cabinet silhouette in cobalt, yellow, ink navy, and coral, so the world survives from home screen to practice flow.

The system is tactile and archival rather than playful or gamified. Atkinson Hyperlegible Next carries every role; oversized vocabulary specimens, compact index labels, and calm plain-language feedback keep a 9-13-year-old learner oriented without talking down to them. Structural surfaces stay square and substantial, controls soften to 8px, and cobalt-cast shadows make cards feel like physical trays rather than floating glass panels.

Mobile-first safe areas, 44-76px controls, visible coral focus rings, and a reduced-motion override are part of the visual identity, not add-ons. Color marks action and state but never carries correctness alone; every feedback panel includes an icon and explicit copy.

**Key Characteristics:**
- Warm paper stock with a faint 48px vertical ruling.
- Cobalt cabinet framing with ink-navy structure and coral index tabs.
- One hyperlegible variable sans across display, reading, labels, and controls.
- Square specimen trays paired with gently rounded interactive controls.
- Measurement ticks, numbered rows, ledgers, and stamps used as functional cabinet details.
- Calm, explicit feedback without points, streaks, or celebratory game chrome.

## Colors

The palette behaves like printed school-lab stock: warm paper and navy ink carry the structure, cobalt identifies the cabinet and primary action, and coral, yellow, and green are reserved for specific signals.

### Primary
- **Cabinet Cobalt** (`#1747d1`): The header, primary actions, selected borders, progress accents, and language metadata.
- **Cabinet Navy** (`#102454`): Heavy 2-3px structural borders, headline color, and the base for every cast shadow.
- **Selection Blue** (`#dce6ff`): Selected choice cards, processing panels, and neutral speech feedback.

### Secondary
- **Coral Index** (`#e54b2b`): Cabinet tabs, the progress fill, visible focus outlines, and error borders.
- **Recording Coral** (`#b3311d`): The large microphone action only; its deeper value keeps white action text legible.

### Tertiary
- **Specimen Yellow** (`#f9d651`): Offline and storage notices, the stop control, the empty drawer, and the result stamp.
- **Correct Green** (`#197353`) with **Correct Wash** (`#dcefe7`): Correct speech and spelling feedback.
- **Error Wash** (`#f8dfda`): Error and incorrect-result backgrounds, always paired with dark red copy and a coral border.

### Neutral
- **Warm Stock** (`#f4f0e7`): The page and app-shell ground.
- **Clean Stock** (`#fffdf7`): Inputs, drawers, sheets, ledgers, and specimen surfaces.
- **Ink Navy** (`#172038`): Primary body copy and control content.
- **Annotation Grey** (`#626a78`): Supporting copy, hints, counters, and concealed-answer text.
- **Ruler Grey** (`#c9c3b5`): Input strokes, dividers, ruled ticks, and low-emphasis panel borders.

### Named Rules
**The Cabinet Palette Rule.** Warm Stock is the field, Clean Stock is the object, Cabinet Navy supplies structure, and Cabinet Cobalt identifies action or selection. Do not flatten those four jobs into one generic white-and-blue surface.

**The Feedback Has a Job Rule.** Coral marks focus, failure, or a physical index tab; yellow marks attention; green marks correctness. These hues are never free decoration, and state always includes an icon plus words.

## Typography

**Display Font:** Atkinson Hyperlegible Next Variable, with Atkinson Hyperlegible, system-ui, and sans-serif fallback.
**Body Font:** Atkinson Hyperlegible Next Variable, with Atkinson Hyperlegible, system-ui, and sans-serif fallback.
**Label/Mono Font:** Atkinson Hyperlegible Next Variable; the build has no monospace role.

**Character:** One highly legible variable face gives the learner continuity from an oversized word specimen down to compact measurement labels. Weight and tracking create hierarchy without introducing a decorative display face.

### Hierarchy
- **Display** (`'wght' 780`, `clamp(2.5rem, 12vw, 5.4rem)`, line-height `0.95`, tracking `-0.05em`): The current source word inside the practice specimen only.
- **Headline** (`'wght' 720`, `clamp(2rem, 7vw, 3.5rem)`, line-height `0.98`, tracking `-0.045em`): Page-level `h1` titles.
- **Title** (`'wght' 720`, `1.45rem`, line-height `1.08`, tracking `-0.025em`): Drawer names and section-level `h2` titles.
- **Body** (`400`, `1rem`, normal line-height): Default reading and explanatory copy; selected ledes lengthen to line-height `1.5`.
- **Field Label** (`680`, `1rem`): Form labels and direct instructions.
- **Specimen Meta** (`'wght' 800`, about `0.72-0.76rem`, tracking `0.08-0.1em`): Language codes, row numbers, table headings, and practice mode/direction metadata.
- **Action** (`'wght' 700`, `1rem`): Button text; large controls rise slightly to `1.04-1.08rem`.

### Named Rules
**The One-Face Rule.** Keep every role in Atkinson Hyperlegible Next. Hierarchy comes from the shipped variable weights, scale, and tracking, not from adding a display or monospace family.

**The Specimen Scale Rule.** The live vocabulary word owns the largest type. Page headlines stop at the smaller headline tier so the learner's current word remains the visual specimen.

**The Index Label Rule.** Small tracked capitals belong only to real cabinet metadata such as language codes, directions, modes, row numbers, and table headings. Do not invent eyebrow copy merely to reuse the style.

## Layout

The app is a mobile-first vertical shell with a safe-area-aware header, flexible main region, and safe-area-aware footer. The paper ground carries a faint vertical rule every `48px`, placed at `24px`, while content stays centered inside `min(1120px, 100%)`. Editor, setup, results, and practice flows narrow to `760px`.

The recurring spatial rhythm is approximately `0.45 / 0.7 / 0.8 / 1 / 1.2 / 1.5rem`, with `2-3px` structural strokes doing as much grouping work as whitespace. Drawer cards use `repeat(auto-fit, minmax(min(100%, 285px), 1fr))` with a `1.4rem` gap. Safe-area insets are included at every screen edge that can meet iPhone chrome.

At `640px` and wider, bilingual word rows and mode choices become two-column layouts, practice actions split into a `0.72fr / 1.28fr` pair, and the specimen gains more padding. At `520px` and narrower, page headings stack, paired result actions collapse to one column, and editor actions become a sticky bottom bar. The supported canvas never shrinks below `320px`; the installed PWA declares portrait orientation.

## Elevation & Depth

Depth is structural and cabinet-like: thick navy outlines define the object, warm tonal layering separates stock from page, and a small family of navy-tinted shadows casts down and right. Flat notices and feedback panels rely on tint plus border rather than elevation.

### Shadow Vocabulary
- **Primary Action Rest** (`0 4px 10px rgba(16, 36, 84, 0.24)`): Every primary button at rest.
- **Primary Action Pressed** (`0 2px 5px rgba(16, 36, 84, 0.2)`): The same button after its `2px` downward press.
- **Specimen Sheet** (`6px 10px 24px rgba(16, 36, 84, 0.16)`): Reused by the setup sheet and live practice specimen.
- **Drawer Stack** (`5px 9px 22px rgba(16, 36, 84, 0.15)`): Repeated on every word-list drawer card.

### Named Rules
**The Cobalt-Cast Rule.** System shadows use Cabinet Navy (`16, 36, 84`) at low opacity and fall down or down-right. Do not introduce neutral-black glows, glass blur, or unrelated shadow colors.

**The Pressed-Drawer Rule.** Primary actions move down `2px` and shorten their shadow when active. The interface communicates pressure, not hover levitation.

## Shapes

The form language deliberately separates objects from controls. Cabinet objects - drawers, sheets, word rows, ledgers, feedback panels, and the practice specimen - have square corners and firm `2-3px` borders. Buttons, text fields, and icon controls use the single `8px` control radius. Circular geometry is limited to the spinner and icon details; there are no pills in the application UI.

Coral top tabs are the recurring silhouette on important trays: `13px` high and approximately `58-72px` wide, attached to a navy top edge. Ruler bars and measurement lines use a `2px` grey rule with alternating `7px` and `12px` ticks. The rounded-square PWA icon is a platform container, not permission to round structural surfaces.

## Components

### Buttons
- **Primary:** Cobalt fill, white text, `2px` navy border, `8px` radius, `0.7rem 1rem` padding, and at least `48px` height. It presses down `2px`, shortens its shadow, receives a `3px` coral focus ring with `3px` offset, and drops to `0.5` opacity when disabled.
- **Secondary:** Clean Stock fill, navy text and `2px` navy border at the same size and radius. It is the paired alternative for cancel, listen, retry, and back-to-list actions.
- **Text / Back:** Transparent with cobalt text and at least `44px` height. Danger text shifts to the shipped dark red literal; icon-only actions remain `44-46px` square.
- **Record / Stop:** The record control is the largest action at `76px`, using Recording Coral and a `3px` navy border. The stop action switches to Specimen Yellow inside a full-cobalt recording state.

### Inputs / Fields
- **Style:** Full-width Clean Stock field, `2px` Ruler Grey border, `8px` radius, `0.72rem 0.85rem` padding, and at least `52px` height.
- **Focus:** The field border becomes cobalt while the shared `3px` coral outline sits `3px` outside it.
- **Large spelling field:** Raises the minimum height to `62px` and type to `1.35rem`; autocorrect and automatic capitalization are disabled for assessment.

### Navigation
- **Cabinet header:** A safe-area-aware cobalt bar with a `7px` navy bottom rail. The product name is white, tightly tracked, and set at `'wght' 780`.
- **Header action:** A transparent `46px` square icon button with an `8px` radius and a translucent white border. Navigation never becomes a dense tab bar.
- **Notices:** Offline uses a yellow strip with navy text; update-ready uses navy with a yellow `44px` action. Both include explicit status copy.

### Drawer Cards
Each reusable word-list drawer is Clean Stock with a `3px` navy frame, square corners, a down-right navy shadow, and a coral top tab. EN/DE metadata and a nine-tick ruler make the cabinet metaphor functional. The card ends with one full-width primary practice action and quiet edit/delete text actions.

### Choice Cards
Mode cards are at least `88px` tall with a `2px` grey border and a hidden native radio. Selected cards switch to Selection Blue with cobalt border and navy text; focus lands on the entire label through `:has(input:focus-visible)`. Direction rows use the same state grammar at a denser `51px` height.

### Practice Specimen
The signature learning surface is a square Clean Stock sheet with a `3px` navy frame, the shared specimen-sheet shadow, and a coral top tab. It combines compact direction/mode metadata, the oversized source word, a revealed or dashed concealed target, and a 17-tick measurement line before the current interaction state.

### Feedback Panels
Feedback panels are square, bordered, icon-led rows with `0.9rem` padding. Neutral speech feedback uses Selection Blue, correct feedback uses Correct Wash and green, minor typo uses the shipped yellow wash and ochre literals, and incorrect/error feedback uses Error Wash with coral. The words state the outcome; color only reinforces it.

## Do's and Don'ts

### Do:
- **Do** keep the Warm Stock page, Clean Stock objects, navy structure, and cobalt actions as distinct layers.
- **Do** use square, thick-bordered trays for content and reserve the `8px` radius for interactive controls.
- **Do** keep touch targets at the shipped `44-76px` minimum heights and preserve iPhone safe-area padding.
- **Do** use coral tabs, ruler ticks, row numbers, ledgers, and stamps only when they identify or measure real content.
- **Do** pair every correctness, warning, and error color with an icon and explicit calm copy.
- **Do** preserve the `640px` expansion and `520px` compact behaviors when adding screens.
- **Do** honor `prefers-reduced-motion` by collapsing animation and transition durations to `0.01ms`.

### Don't:
- **Don't** add points, streaks, trophies, confetti, mascots, or other game chrome to this specimen-cabinet world.
- **Don't** turn tracked specimen metadata into generic marketing kickers or decorative eyebrows.
- **Don't** round drawer cards, sheets, rows, ledgers, or feedback panels; structural objects stay square.
- **Don't** use yellow, coral, or green as free decoration; every use must keep its shipped attention, focus/error, or correctness job.
- **Don't** introduce glassmorphism, blurred panels, neutral-black glows, or hover-only affordances.
- **Don't** add a second font family or a monospace role; the shipped system is intentionally one-face.
