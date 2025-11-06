# AI Video Generator

## Overview
This web application provides AI-powered video generation tools. It features VEO 3.1 for single and batch video creation, OpenAI GPT-5 for script generation, and comprehensive video history tracking. The application aims for a Disney Pixar-style 3D animation aesthetic and provides a complete video production suite with bulk processing capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript (Vite)
- **Routing**: Wouter
- **State Management**: TanStack Query for server state; React hooks for UI state
- **UI**: Shadcn/ui (Radix UI, Tailwind CSS); Design inspired by creative AI tools and Material Design.
- **Form Handling**: React Hook Form with Zod.
- **Design Principles**: Professional dark navy theme with purple accents, glass-morphism effects, hover-lift interactions, and full mobile responsiveness.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ES modules)
- **API**: RESTful, session-based authentication. Includes endpoints for authentication, user management, video generation, video status, video merging, token rotation, and video history. Zod for shared client/server validation.
- **Server Organization**: Modular structure for Express setup, routes, AI integration, storage, database setup, and Vite integration.

### Data Storage
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM.
- **Schema**: Drizzle ORM definitions for Users, API Tokens, Token Settings, and Video History models.
- **Authentication**: Session-based with bcrypt password hashing and role-based access control.
- **User Management**: Admin panel for user oversight, plan management (free, scale, empire), API token assignment, user deletion, and comprehensive video and image generation analytics. Includes bulk token replacement and token usage tracking per video/image. API tokens are shared between VEO video generation and Google AI image generation with automatic rotation. Plan system tracks start date, expiry (10 days), daily video count, and enforces tool access restrictions.
- **Plan System**:
  - **Free Plan**: Access to VEO 3 video generation only
  - **Scale Plan** (900 PKR, 10 days): VEO + Bulk generation (batch=7, delay=30s, 1000 videos/day limit)
  - **Empire Plan** (1500 PKR, 10 days): All tools - VEO + Bulk (batch=20, delay=15s, 2000 videos/day) + Script Generator + Text-to-Image + Image-to-Video
  - Daily video counts reset automatically at midnight PKT
  - Expired plans are automatically blocked from premium tools
  - Admin users bypass all plan restrictions

### UI/UX Decisions
- **Design System**: Professional dark navy theme with purple accent buttons. Utilizes CSS gradients, icons, and animations (fadeIn, slideUp, scaleIn). Features glass-morphism effects, hover-lift interactions, and full mobile responsiveness. Supports light/dark modes with consistent navy palette.
- **Home Page**: Tool selector dashboard with cards for each available tool: VEO 3.1 Video Generator, Bulk Video Generator, Text to Image Generator, Image to Video, Script Creator, and Video History. Includes plan information card showing current plan, expiry date, and daily usage progress with visual indicators.
- **Navigation**: Header navigation with user authentication status and admin access.
- **Text to Image Page (`/text-to-image`)**: AI-powered image generation using Google AI Sandbox Whisk API with IMAGEN_3_5 model. Users enter a description, select aspect ratio (landscape/portrait/square), and receive AI-generated images. Handles base64 encoded images from the API and converts them to displayable data URLs. Features image preview and download capabilities.
- **Image to Video Page (`/image-to-video`)**: Transform static images into animated videos using VEO 3.1. Users upload an image and provide a motion prompt to generate videos. The 3-step process includes: (1) uploading the image to Google AI, (2) generating video with reference image, and (3) polling for completion. Supports both landscape (16:9) and portrait (9:16) formats with automatic token rotation.
- **Script Creator Page (`/script-creator`)**: Standalone tool using OpenAI (GPT-5) to generate detailed animated storyboards. Takes user inputs for story subject, number of steps (1-39), and final step description. Outputs complete storyboard with character descriptions repeated in each scene for AI video generation consistency.
- **Video History Page (`/history`)**: Grid view of user's last 100 generated videos with status, metadata, and player. Includes today's generation statistics, original prompt display, and a regenerate button. Features multi-select for merging up to 18 completed videos using local FFmpeg processing, with a retry mechanism for failed merges.
- **Admin Statistics Dashboard**: Displays daily video generation statistics and per-token analytics, showing total videos, completed, failed counts, and success rates for each API token.
- **VEO Generator & Bulk Generator Pages**: Professional card designs with gradient icon badges, enhanced input fields, and mobile responsiveness. The Bulk Generator supports up to 100 videos per batch and displays token labels for real-time processing visibility.

### Technical Implementations
- **AI Integration**: OpenAI GPT-5 for script generation with automatic retry logic. Google AI Sandbox Whisk API (IMAGEN_3_5) for text-to-image generation with configurable aspect ratios, base64-to-file conversion, Cloudinary upload, and automatic token rotation from admin panel.
- **Video Generation**: VEO 3.1 API, with prompts prefixed for "Disney Pixar-style 3D animation." Supports both landscape (16:9) and portrait (9:16) video formats. Uses sequential processing with Server-Sent Events (SSE) for progress, automatic prompt cleaning, and individual/bulk retry mechanisms with concurrency control. Features per-scene token rotation to distribute load.
- **Image to Video Generation**: VEO 3.1 API with reference image support. Three-step process: (1) Upload image to Google AI (uploadUserImage endpoint), (2) Generate video using batchAsyncGenerateVideoReferenceImages with mediaGenerationId, (3) Poll for completion using existing video status check with **same token** that created the video (critical for avoiding "Video not found" errors). Stores reference image URL in video history for display. Uses UUID-based scene IDs and veo_3_0_r2v_fast_ultra model for reference-to-video generation.
- **Video Regeneration**: Background polling with a 4-minute timeout. Smart token rotation attempts different API tokens if videos don't complete within 2 minutes. Supports regenerating both text-to-video and image-to-video entries from history. Image-to-video regeneration fetches the reference image from Cloudinary, re-uploads to Google AI, and generates a new video with the same prompt and aspect ratio.
- **Bulk Generation**: Backend queue system with configurable batch processing (1-50 videos per batch, 10-120 second delays). Maximum 100 prompts per bulk generation. Uses round-robin token rotation for videos. Processing continues in the background even if the user leaves the page. Batch size and delay are enforced based on user plan (Scale: 7/30s, Empire: 20/15s).
- **Plan Enforcement**: Comprehensive access control system that checks plan expiry, daily video limits, and tool access before each generation request. Automatically increments daily video count after video creation. Daily counts reset at midnight PKT. All enforcement happens at the API level to prevent bypass attempts.
- **Status Polling**: All video generation status checks (VEO, Bulk, Image-to-Video, History) occur every 15 seconds to reduce server load and improve scalability for 100+ users.
- **Automatic Timeout**: Videos stuck in pending status are marked as failed after 4 minutes, with a cleanup job running every 2 minutes.
- **Daily History Cleanup**: Automatically clears all video history at midnight PKT (UTC+5) and cleans up expired temporary videos.
- **Temporary Video Storage**: Stores merged videos in Replit Object Storage with a 24-hour expiry and hourly cleanup job.
- **Video Merging**: Local FFmpeg processing for user-selected history videos (uploading to Cloudinary) and fal.ai FFmpeg API for cloud-based merging. Includes smart migration of videos from Google Cloud Storage to Cloudinary before merging.

## External Dependencies

- **AI Services**: 
  - OpenAI GPT-5 (script generation)
  - Google AI Sandbox Whisk API with IMAGEN_3_5 model (text-to-image generation)
- **Video Generation**: VEO 3.1 API
- **Database**: Neon PostgreSQL, Drizzle ORM
- **Video Storage**: Cloudinary for individual video and merged video storage (unsigned upload preset). VEO-generated videos are initially on Google Cloud Storage but automatically migrated to Cloudinary during merge operations. fal.ai API for video merging.
- **System Dependency**: FFmpeg (for video processing)
