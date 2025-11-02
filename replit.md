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
- **Design System**: Professional dark navy theme (hue 218-220, #1a2332 background) with purple accent buttons (#7C3AED / hsl(262 83% 58%)), NO images used - all visuals are CSS gradients, icons, and animations. Smooth CSS animations (fadeIn, slideUp, scaleIn) with staggered delays. Glass-morphism effects and hover-lift interactions throughout. Fully mobile-responsive with Tailwind breakpoints. Light/dark modes both use navy palette with proper contrast.
- **Multi-step Wizard**: Story Input → Generation → Review/Export.
- **Hero Section**: Dark navy gradient background (#1a2332 to #242d3f) with icon badge, comprehensive "Complete Video Production Suite" description featuring all 4 tools (Cartoon Story Generator, VEO 3.1 Video Generator, Bulk Video Generator, Video History & Projects), feature cards showcasing AI Scene Generation, VEO 3.1, and Pixar-Style Animation capabilities. Purple accent CTA button with smooth animations.
- **Navigation**: Hamburger menu includes all tools in logical order - Cartoon Story Generator (first), VEO 3.1 Video Generator, Bulk Video Generator, My Projects, Video History.
- **Video History Page (`/history`)**: Grid view of user-generated videos with status, metadata, and player. User-scoped access. Displays today's generation statistics (total, completed, failed, pending, queued). Each video card shows the original prompt text. Regenerate button available for all videos (disabled only for queued videos). Auto-refreshes every 3 seconds when processing videos exist. **Multi-Select Merge Feature**: Users can select up to 19 completed videos via checkboxes and merge them using local FFmpeg processing. Selected videos show purple ring highlight. Merge button appears in header showing selection count. Backend verifies video ownership and validates Cloudinary URLs before merging. **Merge Retry**: Failed merge operations appear as video history entries with a "Retry Merge" button that attempts the merge again using the stored original video IDs.
- **Admin Statistics Dashboard**: Admin panel displays today's video generation statistics (total, completed, failed, pending, queued) and per-token analytics showing total videos, completed count, failed count, and success rate for each API token. All tokens displayed including inactive ones to highlight unused tokens.
- **My Projects Page (`/projects`)**: Grid view of cartoon projects, including title, date, scene count, character count, and video generation status. Detail view displays script, characters, merged video (if any), and scenes. Auto-saves projects after successful AI generation.
- **VEO Generator Page**: Professional card design with gradient icon badges, enhanced input fields with focus rings, improved aspect ratio selection with hover states, gradient buttons with animations. Fully mobile-responsive.
- **Bulk Generator Page**: Professional gradient design with icon badges, progress tracking with visual indicators, "Ready" status badge, enhanced mobile responsiveness. Supports up to 200 videos per batch. **Token Label Display**: Each video card shows which API token is processing it (e.g., "Token 1", "Token 2") as a purple badge next to the video number for real-time visibility into token distribution.

### Technical Implementations
- **AI Integration**: Google Gemini AI (`gemini-2.5-flash`) for scene generation, with automatic retry logic (up to 3 times with exponential backoff) and validation for scene count.
- **Video Generation**: VEO 3 API. Prompts prefixed for "Disney Pixar-style 3D animation." Sequential processing with Server-Sent Events (SSE) for progress. Automatic prompt cleaning. Individual and bulk retry mechanisms with concurrency control. **Per-Scene Token Rotation**: Cartoon story generation now uses a different API token for each scene (Scene 1 → Token A, Scene 2 → Token B, etc.), distributing load across multiple tokens instead of using one token for all scenes.
- **Video Regeneration**: Background polling with 4-minute timeout. Regenerate button triggers new VEO generation, polls asynchronously every 2 seconds (max 120 attempts), updates video URL on success, marks as failed on VEO error or timeout. **Smart Token Rotation**: If video doesn't complete in 2 minutes, automatically tries next API token; if still not completed after 4 minutes total, marks as failed.
- **Bulk Generation**: Backend queue system for maximum reliability. All videos saved to database immediately when user clicks generate. **Backend Queue Worker**: Processes videos in background with 20-second delays between requests. **Round-Robin Token Rotation**: Each video uses a different API token (Video 1 → Token 1, Video 2 → Token 2, etc.) to prevent overloading a single token. **User Can Leave**: Videos continue generating even if user closes browser or navigates away - check progress in Video History. Background polling with 4-minute timeout and automatic token rotation on failures.
- **Automatic Timeout**: Videos stuck in pending status are automatically marked as failed after 4 minutes to prevent indefinite waiting. Cleanup runs every 2 minutes via background job.
- **Daily History Cleanup**: Automatically clears all video history at midnight Pakistan time (PKT - UTC+5) every day. Job runs every minute to check for midnight, prevents duplicate runs on same date, and works correctly even after server restarts. Also cleans up expired temporary videos.
- **Temporary Video Storage**: New feature for storing merged videos with 24-hour expiry in Replit Object Storage. Uses `createWriteStream` for efficient file uploads. Includes hourly cleanup job to delete expired videos automatically. Ideal for preview generation without consuming permanent storage.
- **Video Merging**: Three approaches - (1) **Cartoon Projects**: fal.ai FFmpeg API for cloud-based merging of project scenes. (2) **History Selection (Permanent)**: Local FFmpeg processing for user-selected videos (up to 19), uploads to Cloudinary using unsigned upload preset. (3) **History Selection (Temporary)**: Local FFmpeg processing with temporary storage in Object Storage, auto-expires in 24 hours. Downloads videos, merges using FFmpeg concat demuxer, and cleans up temp files. Security enforced via video ID verification and ownership checks. **Smart Migration**: Videos from Google Cloud Storage are automatically migrated to Cloudinary before merging to ensure permanent availability (GCS URLs expire).

## External Dependencies

- **AI Service**: Google Gemini AI (gemini-2.5-flash model)
- **Video Generation**: VEO 3 API
- **Database**: Neon PostgreSQL (via `@neondatabase/serverless`), Drizzle ORM
- **Video Storage**: Cloudinary for individual scene and merged video storage (unsigned upload with preset `demo123` on cloud `dy40igzli`). VEO-generated videos initially stored on Google Cloud Storage, automatically migrated to Cloudinary during merge operations. fal.ai API for cartoon project merging.
- **System Dependency**: FFmpeg (for video processing)

**Environment Variables**: `GEMINI_API_KEY`, `VEO3_API_KEY`, `VEO3_PROJECT_ID`, `FAL_API_KEY`, `DATABASE_URL`. Note: Cloudinary API keys no longer required due to unsigned upload preset.

## Recent Updates (November 2, 2025)

### Automatic Cloudinary Upload for All Videos
All VEO-generated videos now automatically upload to Cloudinary for permanent storage:
- **Universal Upload**: ALL videos (VEO single, cartoon scenes, bulk, regenerated) now upload to Cloudinary immediately after VEO generation
- **Permanent Storage**: Videos stored on Cloudinary never expire, unlike temporary Google Cloud Storage URLs
- **Fallback Handling**: If Cloudinary upload fails, system falls back to original VEO URL
- **Regenerate Endpoint**: Updated to upload to Cloudinary before saving video URL to database

### Backend Queue System for Bulk Generation (FIXED)
Implemented backend queue worker that continues processing even after user leaves the page:
- **Backend Queue Worker**: New `bulkQueue.ts` module processes videos in background with dedicated worker
- **Persistent Processing**: Videos continue generating even if user closes browser, reloads page, or navigates away
- **Single API Call**: Frontend calls `/api/bulk-generate` once with all prompts, returns immediately
- **Database-First**: All videos saved to database before processing starts
- **True Round-Robin Token Rotation**: Uses `getNextRotationToken()` which wraps around for unlimited videos (Video 1 → Token 1, Video 8 → Token 1, Video 115 → Token 3, etc.)
- **Fixed Critical Bug**: Previously used `getTokenByIndex(sceneNumber - 1)` which failed after exhausting tokens (only first 7-9 videos got tokens). Now uses proper rotation that wraps around automatically.
- **20-Second Delays**: Queue worker sends VEO requests every 20 seconds to avoid rate limits
- **Background Polling**: Each video has its own 4-minute timeout with automatic token retry after 2 minutes
- **Auto-Upload to Cloudinary**: Videos uploaded to permanent storage immediately upon completion
- **Check Anywhere**: Users can monitor progress in Video History page - no need to stay on bulk generator page

### Fixed Video Merge Cloudinary Upload
Fixed critical bug in FFmpeg video merge that prevented Cloudinary uploads:
- **Root Cause**: Using npm `form-data` package which doesn't work correctly with native fetch API
- **Fix**: Switched to native web FormData API with Blob for video upload
- **Impact**: Video merge now successfully uploads to Cloudinary with unsigned upload preset

### Video Storage Migration & Cloudinary Integration
Enhanced video merging with automatic migration from Google Cloud Storage to Cloudinary:
- **Unsigned Upload**: Switched to Cloudinary unsigned upload preset (`demo123`) - no API keys required
- **Automatic Migration**: All three merge endpoints (permanent, retry, temporary) now automatically detect Google Cloud Storage videos and migrate them to Cloudinary before merging
- **Permanent URLs**: Ensures merged videos use permanent Cloudinary URLs instead of expiring Google Cloud Storage URLs
- **Database Updates**: Video history entries automatically updated with new Cloudinary URLs after migration
- **Multi-Source Support**: Accepts videos from both Google Cloud Storage (VEO-generated) and Cloudinary (previously merged)
- **Smart Detection**: Uses URL prefix matching to identify video source and trigger migration when needed

### Previous Updates (November 1, 2025)
- **Temporary Video Storage System**: Object Storage integration with 24-hour expiry, efficient uploads using `createWriteStream`
- **Frontend Improvements**: Enhanced button visibility (solid backgrounds), helpful SSE connection loss tip directing users to Video History