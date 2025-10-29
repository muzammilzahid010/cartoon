# Cartoon Story Video Generator

## Overview

This is a web application that transforms written cartoon scripts into detailed animated scene descriptions optimized for AI video generation tools like VEO 3. Users input their story script and character details, and the application uses Google's Gemini AI to break down the narrative into cinematic 8-second scenes with comprehensive production details including visuals, dialogue, music suggestions, sound effects, and transitions.

The application follows a Disney Pixar-style 3D animation aesthetic and provides a multi-step wizard interface for creating, generating, and exporting scene descriptions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool

**Routing**: Wouter for lightweight client-side routing

**State Management**: 
- TanStack Query (React Query) for server state management and API interactions
- Local component state using React hooks for UI state

**UI Component Library**: 
- Shadcn/ui components built on Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- Design system inspired by creative AI tools (Runway, Midjourney) combined with Material Design principles

**Form Handling**: React Hook Form with Zod for validation, integrated with the shared schema definitions

**Key Design Principles**:
- Progressive disclosure through a multi-step wizard workflow (Story Input → Generation → Review/Export)
- Hybrid design approach balancing playful creativity with professional clarity
- Typography using Inter for UI elements and Quicksand for creative/heading elements
- Generous whitespace and clear information hierarchy

### Backend Architecture

**Runtime**: Node.js with Express.js

**Language**: TypeScript with ES modules

**API Structure**:
- RESTful endpoint architecture
- Authentication endpoints: `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/users`
- Scene generation endpoint: `POST /api/generate-scenes`
- Video generation endpoints: `POST /api/generate-video`, `POST /api/generate-all-videos`
- Video merging endpoint: `POST /api/merge-videos`
- Request validation using Zod schemas shared between client and server
- Error handling with appropriate HTTP status codes
- Session-based authentication with express-session and MemoryStore

**Server Organization**:
- `server/index.ts` - Express server setup and middleware configuration
- `server/routes.ts` - API route definitions
- `server/gemini.ts` - AI integration logic
- `server/storage.ts` - In-memory storage implementation (currently using MemStorage)
- `server/vite.ts` - Vite development server integration

### Data Storage

**Current Implementation**: In-memory storage using a Map-based implementation (MemStorage class)

**Schema Definition**: 
- Drizzle ORM schema definitions in `shared/schema.ts`
- PostgreSQL-compatible schema using Drizzle with Neon serverless driver
- Database prepared but not currently utilized for runtime storage

**Data Models**:
- Users table with id, username, password (hashed with bcrypt), isAdmin fields
- Character schema: id, name, description
- Story input schema: script (min 50 chars), characters array (min 1)
- Scene output schema: scene number, title, description with structured elements

**Authentication System**:
- Session-based authentication using express-session with MemoryStore
- Password hashing with bcrypt (10 salt rounds) for secure storage
- Default admin account: username `muzi`, password `muzi123` (hashed)
- Role-based access control with isAdmin flag
- Protected routes using requireAuth and requireAdmin middleware
- Login, logout, and session management endpoints
- User creation restricted to admin users only

### External Dependencies

**AI Service**: Google Gemini AI (gemini-2.5-flash model)
- Integration via `@google/genai` SDK
- Used for transforming story scripts into detailed scene descriptions
- System prompts optimized for 8-second cinematic scenes with specific output format
- Generates structured JSON with visuals, dialogue, music, sound effects, and transitions
- **Automatic Retry Logic**: 
  - Retries up to 3 times on failure (invisible to users)
  - Validates minimum of 5 scenes are generated
  - Exponential backoff between retry attempts (1s, 2s)
  - Ensures consistent quality without user intervention

**Video Generation**: VEO 3 API
- Integration for generating cartoon-style videos from scene prompts
- Sequential processing of scenes with real-time progress tracking
- Server-Sent Events (SSE) for streaming progress updates
- Automatic prompt cleaning (removes special characters: " * , : ; _ -)
- Each video is approximately 8 seconds matching scene duration
- **Retry Capabilities**:
  - Individual video retry with "Try Again" button
  - Bulk retry for all failed videos
  - Concurrent retry protection using AbortController
  - Automatic cleanup on component unmount/navigation
  - UI-level duplicate request prevention
  - Functional state updates to prevent race conditions

**Database**: 
- Neon PostgreSQL (via `@neondatabase/serverless`)
- Drizzle ORM for schema management and migrations
- Connection configured but storage currently in-memory

**Development Tools**:
- Replit-specific plugins for development banner, error overlay, and cartographer
- Vite for fast development and optimized production builds
- ESBuild for server-side bundling
- FFmpeg for video merging and processing

**Authentication**: Basic session management infrastructure present but not actively used

**Environment Variables Required**:
- `GEMINI_API_KEY` - Google Gemini API authentication
- `VEO3_API_KEY` - VEO 3 API authentication for video generation
- `VEO3_PROJECT_ID` - VEO 3 project identifier (optional, extracted from API response)
- `DATABASE_URL` - PostgreSQL connection string (configured but optional for current in-memory operation)

### Application Flow

**Authentication Pages:**
- **Login Page (`/login`)**: Form with username/password fields, displays default admin credentials
- **Admin Page (`/admin`)**: Protected page for creating new user accounts (admin only)
  - Form to create users with username, password, and admin role toggle
  - Requires admin authentication to access
  - Shows logout and home navigation

**Main Application Flow:**
1. **Landing (Step 0)**: Hero page with call-to-action to start creating
   - Header shows Login button if not authenticated
   - Header shows username, Admin button (if admin), and Logout button if authenticated
2. **Input (Step 1)**: Multi-character form with script textarea and dynamic character inputs
3. **Scene Generation (Step 2)**: Loading state with animated feedback while AI generates scenes
   - Automatic retry logic handles failures transparently
   - Validates scene count and quality
4. **Review Scenes (Step 3)**: Grid display of generated scenes with structured information cards
   - Shows all scene details (visuals, dialogue, music, SFX, transitions)
   - **Regenerate Scenes**: Users can regenerate all scenes with the same story input if not satisfied with results
   - Option to start new story, regenerate scenes, or proceed to video generation
   - Export scenes as JSON for offline use
5. **Generate Videos (Step 4)**: Real-time progress tracking for video generation
   - Sequential processing of each scene
   - Live status updates via Server-Sent Events
   - Progress bar and per-scene status indicators
6. **View Videos (Step 5)**: Final display with video players and download options
   - Watch generated videos inline
   - Download individual videos or all at once
   - **Merge All Videos**: Combine all completed videos into a single video file
   - **Individual Retry**: "Try Again" button on each failed video
   - **Bulk Retry**: "Regenerate Failed Videos" button when failures exist
   - Production-ready retry handling with proper cleanup and concurrency control
   - Video merging uses FFmpeg for seamless concatenation