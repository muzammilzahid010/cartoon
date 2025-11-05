# Cartoon Story Video Generator

## Overview
This web application transforms written cartoon scripts into detailed animated scene descriptions optimized for AI video generation tools. It leverages Google's Gemini AI to segment narratives into cinematic 8-second scenes, complete with visuals, dialogue, music, sound effects, and transitions. The application aims for a Disney Pixar-style 3D animation aesthetic and guides users through a multi-step wizard for creation, generation, and export. Key capabilities include a standalone VEO 3.1 video generator and a comprehensive video history tracking system, aiming to provide a complete video production suite.

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
- **API**: RESTful, session-based authentication. Includes endpoints for authentication, user management, scene generation, video generation, video status, video merging, token rotation, and video history. Zod for shared client/server validation.
- **Server Organization**: Modular structure for Express setup, routes, AI integration, storage, database setup, and Vite integration.

### Data Storage
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM.
- **Schema**: Drizzle ORM definitions for Users, Character, Story Input, Scene Output, and Video History models.
- **Authentication**: Session-based with bcrypt password hashing and role-based access control.
- **User Management**: Admin panel for user oversight, plan management (free, basic, premium), API token assignment, and comprehensive video generation analytics. Includes bulk token replacement and token usage tracking per video.

### UI/UX Decisions
- **Design System**: Professional dark navy theme with purple accent buttons. Utilizes CSS gradients, icons, and animations (fadeIn, slideUp, scaleIn). Features glass-morphism effects, hover-lift interactions, and full mobile responsiveness. Supports light/dark modes with consistent navy palette.
- **Multi-step Wizard**: Guides users through Story Input → Generation → Review/Export.
- **Hero Section**: Dark navy gradient background with an icon badge, describing the "Complete Video Production Suite" and its tools: Cartoon Story Generator, VEO 3.1 Video Generator, Bulk Video Generator, and Video History & Projects.
- **Navigation**: Hamburger menu providing access to all tools in a logical order.
- **Video History Page (`/history`)**: Grid view of user-generated videos with status, metadata, and player. Includes today's generation statistics, original prompt display, and a regenerate button. Features multi-select for merging up to 19 completed videos using local FFmpeg processing, with a retry mechanism for failed merges.
- **Admin Statistics Dashboard**: Displays daily video generation statistics and per-token analytics, showing total videos, completed, failed counts, and success rates for each API token.
- **My Projects Page (`/projects`)**: Grid view of cartoon projects including title, date, scene/character count, and video generation status. Auto-saves projects after successful AI generation.
- **VEO Generator & Bulk Generator Pages**: Professional card designs with gradient icon badges, enhanced input fields, and mobile responsiveness. The Bulk Generator supports up to 200 videos per batch and displays token labels for real-time processing visibility.

### Technical Implementations
- **AI Integration**: Google Gemini AI (`gemini-2.5-flash`) for scene generation, including automatic retry logic and validation.
- **Video Generation**: VEO 3 API, with prompts prefixed for "Disney Pixar-style 3D animation." Uses sequential processing with Server-Sent Events (SSE) for progress, automatic prompt cleaning, and individual/bulk retry mechanisms with concurrency control. Features per-scene token rotation to distribute load.
- **Video Regeneration**: Background polling with a 4-minute timeout. Smart token rotation attempts different API tokens if videos don't complete within 2 minutes.
- **Bulk Generation**: Backend queue system with configurable batch processing (1-50 videos per batch, 10-120 second delays). Uses round-robin token rotation for videos. Processing continues in the background even if the user leaves the page.
- **Automatic Timeout**: Videos stuck in pending status are marked as failed after 4 minutes, with a cleanup job running every 2 minutes.
- **Daily History Cleanup**: Automatically clears all video history at midnight PKT (UTC+5) and cleans up expired temporary videos.
- **Temporary Video Storage**: Stores merged videos in Replit Object Storage with a 24-hour expiry and hourly cleanup job.
- **Video Merging**: Supports three approaches: fal.ai FFmpeg API for cloud-based merging of cartoon project scenes, local FFmpeg processing for user-selected history videos (uploading to Cloudinary), and temporary local FFmpeg processing to Object Storage. Includes smart migration of videos from Google Cloud Storage to Cloudinary before merging.

## External Dependencies

- **AI Service**: Google Gemini AI (gemini-2.5-flash model)
- **Video Generation**: VEO 3 API
- **Database**: Neon PostgreSQL, Drizzle ORM
- **Video Storage**: Cloudinary for individual scene and merged video storage (unsigned upload preset). VEO-generated videos are initially on Google Cloud Storage but automatically migrated to Cloudinary during merge operations. fal.ai API for cartoon project merging.
- **System Dependency**: FFmpeg (for video processing)