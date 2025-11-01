# Cartoon Story Video Generator

## Overview
This web application transforms written cartoon scripts into detailed animated scene descriptions optimized for AI video generation tools. It uses Google's Gemini AI to break narratives into cinematic 8-second scenes, complete with visuals, dialogue, music, sound effects, and transitions. The application features a Disney Pixar-style 3D animation aesthetic and guides users through a multi-step wizard for creation, generation, and export. Key capabilities include a standalone VEO 3.1 video generator and a comprehensive video history tracking system.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript (Vite)
- **Routing**: Wouter
- **State Management**: TanStack Query for server state; React hooks for UI state
- **UI**: Shadcn/ui (Radix UI, Tailwind CSS); Design inspired by creative AI tools and Material Design.
- **Form Handling**: React Hook Form with Zod.
- **Design Principles**: Multi-step wizard (progressive disclosure), hybrid playful/professional aesthetic, Inter and Quicksand typography, generous whitespace.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ES modules)
- **API**: RESTful, session-based authentication (`express-session`, MemoryStore). Includes endpoints for authentication, user management, scene generation, video generation, video status, video merging, token rotation, and video history. Zod for shared client/server validation.
- **Server Organization**: Modular structure for Express setup, routes, AI integration (`gemini.ts`), storage (`storage.ts`), database setup (`db.ts`), and Vite integration.

### Data Storage
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM.
- **Schema**: Drizzle ORM definitions, includes Users, Character, Story Input, Scene Output, and Video History models.
- **Authentication**: Session-based with bcrypt password hashing. Role-based access control (`isAdmin`). Default admin account `muzi`/`muzi123`.
- **User Management**: Admin panel (`/admin`) for user oversight, plan management (free, basic, premium), API token assignment, and comprehensive video generation analytics. **Bulk Token Replacement**: Admin can replace all API tokens at once by pasting new tokens (one per line), with automatic handling of foreign key constraints by nullifying video history references before deletion.
- **Token Usage Tracking**: Video history now includes `tokenUsed` field to track which API token generated each video, enabling per-token analytics and performance monitoring.

### UI/UX Decisions
- **Design System**: Professional dark navy gradient theme (`bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f]`) with purple accent buttons (#7C3AED / hsl(262 83% 58%)), NO images used - all visuals are CSS gradients, icons, and animations. Smooth CSS animations (fadeIn, slideUp, scaleIn) with staggered delays. Glass-morphism effects and hover-lift interactions throughout. Fully mobile-responsive with Tailwind breakpoints. **Consistent styling across all pages**: All pages (Home, VEO Generator, Bulk Generator, History, Projects, Cartoon Wizard) use the same navy gradient background with consistent header design featuring sticky navigation and "Home" button for easy navigation.
- **Multi-step Wizard**: Story Input → Generation → Review/Export.
- **Hero Section**: Dark navy gradient background (#1a2332 to #242d3f) with icon badge, comprehensive "Complete Video Production Suite" description featuring all 4 tools (Cartoon Story Generator, VEO 3.1 Video Generator, Bulk Video Generator, Video History & Projects), feature cards showcasing AI Scene Generation, VEO 3.1, and Pixar-Style Animation capabilities. Purple accent CTA button with smooth animations.
- **Navigation**: Hamburger menu includes all tools in logical order - Cartoon Story Generator (first), VEO 3.1 Video Generator, Bulk Video Generator, My Projects, Video History.
- **Video History Page (`/history`)**: Grid view of user-generated videos with status, metadata, and player. User-scoped access. Displays today's generation statistics (total, completed, failed, pending, queued). Each video card shows the original prompt text. Regenerate button available for all videos (disabled only for queued videos). Auto-refreshes every 3 seconds when processing videos exist. **Multi-Select Merge Feature**: Users can select up to 19 completed videos via checkboxes and merge them using local FFmpeg processing. Selected videos show purple ring highlight. Merge button appears in header showing selection count. Backend verifies video ownership and validates Cloudinary URLs before merging. **Merge Retry**: Failed merge operations appear as video history entries with a "Retry Merge" button that attempts the merge again using the stored original video IDs.
- **Admin Statistics Dashboard**: Admin panel displays today's video generation statistics (total, completed, failed, pending, queued) and per-token analytics showing total videos, completed count, failed count, and success rate for each API token. All tokens displayed including inactive ones to highlight unused tokens.
- **My Projects Page (`/projects`)**: Grid view of cartoon projects, including title, date, scene count, character count, and video generation status. Detail view displays script, characters, merged video (if any), and scenes. Auto-saves projects after successful AI generation.
- **VEO Generator Page**: Professional card design with gradient icon badges, enhanced input fields with focus rings, improved aspect ratio selection with hover states, gradient buttons with animations. Fully mobile-responsive.
- **Bulk Generator Page**: Professional gradient design with icon badges, progress tracking with visual indicators, "Ready" status badge, enhanced mobile responsiveness. **Token Label Display**: Each video card shows which API token is processing it (e.g., "Token 1", "Token 2") as a purple badge next to the video number for real-time visibility into token distribution.

### Technical Implementations
- **AI Integration**: Google Gemini AI (`gemini-2.5-flash`) for scene generation, with automatic retry logic (up to 3 times with exponential backoff) and validation for scene count.
- **Video Generation**: VEO 3 API. Prompts prefixed for "Disney Pixar-style 3D animation." Sequential processing with Server-Sent Events (SSE) for progress. Automatic prompt cleaning. Individual and bulk retry mechanisms with concurrency control. **Per-Scene Token Rotation**: Cartoon story generation now uses a different API token for each scene (Scene 1 → Token A, Scene 2 → Token B, etc.), distributing load across multiple tokens instead of using one token for all scenes.
- **Video Regeneration**: Background polling with 4-minute timeout. Regenerate button triggers new VEO generation, polls asynchronously every 2 seconds (max 120 attempts), updates video URL on success, marks as failed on VEO error or timeout. **Smart Token Rotation**: If video doesn't complete in 2 minutes, automatically tries next API token; if still not completed after 4 minutes total, marks as failed.
- **Bulk Generation**: All videos saved to history immediately with "queued" status before processing starts. Videos start with 20-second staggered delays (not sequential - all process in parallel). Uses regenerate endpoint with background polling. UI polls history every 2 seconds for progress updates. Ensures all videos appear in history even if user reloads page during generation.
- **Automatic Timeout**: Videos stuck in pending status are automatically marked as failed after 4 minutes to prevent indefinite waiting.
- **Daily History Cleanup**: Automatically clears all video history at midnight Pakistan time (PKT - UTC+5) every day. Job runs every minute to check for midnight, prevents duplicate runs on same date, and works correctly even after server restarts.
- **Video Merging**: Uses local FFmpeg processing for all video merging operations: (1) **Cartoon Projects**: Downloads project scenes, merges using FFmpeg concat demuxer, uploads to Cloudinary. (2) **History Selection**: User-selected videos (up to 19). Both approaches download videos, merge using FFmpeg concat demuxer, upload result to Cloudinary, and clean up temp files. Security enforced via video ID verification and ownership checks.

## External Dependencies

- **AI Service**: Google Gemini AI (gemini-2.5-flash model)
- **Video Generation**: VEO 3 API
- **Database**: Neon PostgreSQL (via `@neondatabase/serverless`), Drizzle ORM
- **Video Storage**: Cloudinary for all video storage (individual scenes and merged videos).
- **System Dependency**: FFmpeg (for video processing and merging)

**Environment Variables**: `GEMINI_API_KEY`, `VEO3_API_KEY`, `VEO3_PROJECT_ID`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `DATABASE_URL`.