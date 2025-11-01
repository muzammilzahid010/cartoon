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
- **User Management**: Admin panel (`/admin`) for user oversight, plan management (free, basic, premium), API token assignment, and comprehensive video generation analytics.
- **Token Usage Tracking**: Video history now includes `tokenUsed` field to track which API token generated each video, enabling per-token analytics and performance monitoring.

### UI/UX Decisions
- **Multi-step Wizard**: Story Input → Generation → Review/Export.
- **Video History Page (`/history`)**: Grid view of user-generated videos with status, metadata, and player. User-scoped access. Displays today's generation statistics (total, completed, failed, pending).
- **Admin Statistics Dashboard**: Admin panel displays today's video generation statistics (total, completed, failed, pending) and per-token analytics showing total videos, completed count, failed count, and success rate for each API token. All tokens displayed including inactive ones to highlight unused tokens.
- **My Projects Page (`/projects`)**: Grid view of cartoon projects, including title, date, scene count, character count, and video generation status. Detail view displays script, characters, merged video (if any), and scenes. Auto-saves projects after successful AI generation.

### Technical Implementations
- **AI Integration**: Google Gemini AI (`gemini-2.5-flash`) for scene generation, with automatic retry logic (up to 3 times with exponential backoff) and validation for scene count.
- **Video Generation**: VEO 3 API. Prompts prefixed for "Disney Pixar-style 3D animation." Sequential processing with Server-Sent Events (SSE) for progress. Automatic prompt cleaning. Individual and bulk retry mechanisms with concurrency control.
- **Video Merging**: fal.ai FFmpeg API (`fal-ai/ffmpeg-api/merge-videos`) for cloud-based video merging. No local FFmpeg processing required.

## External Dependencies

- **AI Service**: Google Gemini AI (gemini-2.5-flash model)
- **Video Generation**: VEO 3 API
- **Database**: Neon PostgreSQL (via `@neondatabase/serverless`), Drizzle ORM
- **Video Storage**: fal.ai API for merged video hosting (auto-generated URL), Cloudinary for individual scene video storage.
- **System Dependency**: FFmpeg (for video processing)

**Environment Variables**: `GEMINI_API_KEY`, `VEO3_API_KEY`, `VEO3_PROJECT_ID`, `FAL_API_KEY`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `DATABASE_URL`.