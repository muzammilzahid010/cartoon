# Design Guidelines: Cartoon Story Video Generation Tool

## Design Approach

**Selected Approach:** Hybrid - Design System Foundation with Creative Flourish

Drawing inspiration from creative AI tools (Runway, Midjourney) and streamlined form wizards (Typeform, Linear), balanced with Material Design principles for structural consistency. The interface should feel professional yet playful, reflecting the creative nature of cartoon storytelling while maintaining utility-focused clarity.

**Core Principles:**
- Progressive disclosure through clear multi-step workflow
- Playful professionalism - creative without being childish
- Information hierarchy that guides users naturally through the process
- Generous whitespace to reduce cognitive load during complex inputs

---

## Typography

**Font Families:**
- Primary: Inter (via Google Fonts) - Clean, readable for UI and forms
- Accent: Quicksand (via Google Fonts) - Playful, rounded for headings and creative elements

**Hierarchy:**
- Hero/Page Titles: text-5xl/6xl, font-bold, Quicksand
- Section Headings: text-3xl/4xl, font-semibold, Quicksand
- Step Titles: text-2xl, font-semibold, Inter
- Body Text: text-base, font-normal, Inter
- Labels: text-sm, font-medium, Inter
- Scene Cards Title: text-lg, font-semibold, Inter
- Scene Metadata: text-xs, font-medium, Inter

---

## Layout System

**Spacing Scale:** Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24

**Container Structure:**
- Max width: max-w-7xl for main content
- Form containers: max-w-3xl centered
- Scene grid container: max-w-6xl
- Padding: px-4 md:px-6 lg:px-8

**Grid Systems:**
- Scene cards: grid grid-cols-1 md:grid-cols-2 gap-6
- Character input fields: grid grid-cols-1 md:grid-cols-2 gap-4
- Progress steps: flex horizontal layout with connectors

---

## Component Library

### Navigation
- Fixed header with logo left, minimal navigation right
- Transparent overlay on hero, solid background on scroll
- Height: h-16 md:h-20

### Hero Section
- Full-width, height: min-h-[500px] md:min-h-[600px]
- Large hero image showing vibrant cartoon/animation workspace scene
- Centered content with semi-transparent overlay card
- CTA button: "Start Creating Stories" with blurred background backdrop
- Supporting text describing the 3-step process below main headline

### Multi-Step Progress Indicator
- Horizontal stepper component
- Active step: larger, emphasized
- Completed steps: checkmark icon
- Upcoming steps: outlined, muted
- Connector lines between steps
- Labels: "1. Story & Characters" → "2. Generate Scenes" → "3. Review & Export"
- Position: sticky top-20, background with subtle border-b

### Form Components

**Input Fields:**
- Height: h-12 for text inputs
- Border: border-2, rounded-lg
- Focus state with ring effect
- Label above input with required indicator
- Helper text below: text-sm, muted

**Text Area (Script Input):**
- Min height: min-h-[300px]
- Rounded-lg border
- Character counter in bottom-right corner
- Placeholder with example script snippet

**Character Details Cards:**
- Bordered cards with rounded-xl
- Grid layout for multiple characters
- Each card contains: Name input + Description textarea
- Add/Remove character buttons
- Visual separator between characters

**Submit Button:**
- Large, prominent: h-14 px-12
- Rounded-full with shadow
- Disabled state when fields incomplete
- Loading spinner when processing

### Scene Generation Display

**Scene Cards:**
- Bordered cards with rounded-xl
- Padding: p-6
- Header: Scene number badge + Title
- Content sections clearly separated:
  - Visuals description
  - Dialogue/Action
  - Music notes
  - Sound effects
  - Transition details
- Each section with small icon prefix (use Heroicons)
- Subtle background variation for each section type

**Scene Grid:**
- Masonry-style or standard grid
- Gap: gap-6
- Smooth fade-in animation on load
- Numbered badges prominent in top-left

### Loading States
- Skeleton screens for scene generation
- Animated pulse effect
- Progress percentage display
- Status messages: "Analyzing script...", "Generating scenes...", "Almost done..."

### Empty States
- Illustration or icon
- Helpful message and next action
- Centered in container

---

## Page Structure

### Landing/Home Page
1. **Hero Section**: Large image, value proposition, primary CTA
2. **How It Works**: 3-column feature grid showing the process steps with icons
3. **Example Output**: Sample scene cards showcasing output quality
4. **Features Grid**: 4-column grid of key features (AI-powered, Disney Pixar style, detailed scenes, export ready)
5. **CTA Section**: Final conversion section with secondary background
6. **Footer**: Links, social, contact info in 3-column layout

### Tool Interface Page
1. **Progress Indicator**: Sticky at top
2. **Step Container**: Centered, max-w-3xl
3. **Step 1 - Input Form**: 
   - Script textarea (large)
   - Character cards section (dynamic, can add multiple)
   - Navigation: Next button (bottom-right)
4. **Step 2 - Processing**:
   - Loading animation
   - Status updates
   - Cancel button option
5. **Step 3 - Results**:
   - Scene cards grid
   - Export/Download options
   - Edit/Regenerate actions
   - Start new project button

---

## Interactions & Animations

**Micro-interactions (Minimal):**
- Button hover: slight scale and shadow increase
- Card hover: subtle lift with shadow
- Form focus: border pulse effect
- Scene card entrance: staggered fade-in (100ms delay between cards)

**Loading Animations:**
- Spinner for primary loading
- Skeleton screens for content loading
- Progress bar for generation process

**Transitions:**
- Step changes: smooth content fade
- Card animations: transform with ease-in-out
- Duration: 200-300ms for most interactions

---

## Images

**Hero Image:**
- Large, full-width background image
- Scene: Bright, colorful animation studio workspace or cartoon characters in creative process
- Style: Modern, vibrant, professional
- Treatment: Subtle gradient overlay for text readability
- Position: Background, cover

**How It Works Section:**
- Icon-based visuals (Heroicons) rather than images
- Simple, clear iconography for each step

**Example Output Section:**
- 2-3 sample scene illustrations showing cartoon/animation style
- Arranged in card format with descriptions

**Feature Grid:**
- Icon-based (Heroicons), no images needed

---

## Accessibility & Responsiveness

- Form inputs with proper labels and ARIA attributes
- Progress indicator announces current step to screen readers
- Keyboard navigation throughout multi-step form
- Focus indicators visible on all interactive elements
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Mobile: Single column, stacked layout, touch-friendly button sizes (min-h-12)
- Scene cards: Single column on mobile, 2 columns on tablet, 2-3 columns on desktop