# Temporary Video Storage System

This document explains the new temporary video storage feature that allows you to merge videos and store them temporarily for preview without permanent storage in Cloudinary.

## Overview

The system now supports two types of video merging:
1. **Permanent Storage** (existing): Merges videos and uploads to Cloudinary permanently
2. **Temporary Storage** (new): Merges videos and stores in Replit Object Storage with 24-hour expiry

## Use Case

Temporary storage is ideal for:
- Quick video previews before committing to permanent storage
- Testing video merges without consuming Cloudinary storage
- Temporary sharing with automatic cleanup
- Cost-effective preview generation

## Architecture

### Storage Flow
```
Individual Videos (Cloudinary) → FFmpeg Merge → Temporary Storage (24h expiry)
                                                ↓
                                        Automatic Cleanup (Hourly)
```

### Components

1. **ObjectStorageService** (`server/objectStorage.ts`)
   - Manages temporary video uploads to Replit Object Storage
   - Stores expiry metadata with each video
   - Provides cleanup functionality for expired videos

2. **FFmpeg Merger** (`server/videoMergerFFmpeg.ts`)
   - `mergeVideosWithFFmpegTemporary()`: New function for temporary storage
   - Downloads videos, merges them, uploads to temporary storage
   - Returns video path and expiry timestamp

3. **API Endpoints** (`server/routes.ts`)
   - POST `/api/merge-videos-temporary`: Merge and store temporarily
   - GET `/api/temp-video-info`: Get video expiry information
   - POST `/api/cleanup-expired-videos`: Manual cleanup (admin only)

4. **Cleanup Mechanism** (`server/index.ts`)
   - Hourly cleanup: Runs every hour to delete expired videos
   - Daily cleanup: Runs at midnight PKT along with video history cleanup
   - Automatic and manual cleanup options available

## API Usage

### 1. Merge Videos Temporarily

**Endpoint:** `POST /api/merge-videos-temporary`

**Request Body:**
```json
{
  "videoIds": ["video-id-1", "video-id-2", "video-id-3"],
  "expiryHours": 24
}
```

**Response:**
```json
{
  "success": true,
  "videoPath": "object_storage://replit/temp-videos/merged-12345.mp4",
  "expiresAt": "2025-11-02T12:00:00.000Z",
  "previewUrl": "object_storage://replit/temp-videos/merged-12345.mp4",
  "message": "Video will be available for 24 hours"
}
```

**Parameters:**
- `videoIds`: Array of video IDs to merge (2-19 videos)
- `expiryHours`: Optional, defaults to 24 hours

**Requirements:**
- User must be authenticated
- All videos must exist and be completed
- Videos must be from Cloudinary (verified)
- Minimum 2 videos, maximum 19 videos

### 2. Get Video Expiry Info

**Endpoint:** `GET /api/temp-video-info?videoPath=<path>`

**Response:**
```json
{
  "success": true,
  "expiresAt": "2025-11-02T12:00:00.000Z",
  "isExpired": false
}
```

### 3. Manual Cleanup (Admin Only)

**Endpoint:** `POST /api/cleanup-expired-videos`

**Response:**
```json
{
  "success": true,
  "deletedCount": 5,
  "message": "Deleted 5 expired videos"
}
```

## Automatic Cleanup

The system runs two cleanup mechanisms:

### Hourly Cleanup
- Runs every 60 minutes
- Deletes expired temporary videos
- Logs deletion count if any videos were removed

### Daily Cleanup (Midnight PKT)
- Runs at midnight Pakistan Time (UTC+5)
- Clears all video history
- Deletes expired temporary videos
- Comprehensive system cleanup

## Object Storage Structure

Temporary videos are stored in Replit Object Storage:

```
Bucket: replit
Path: temp-videos/merged-{timestamp}-{uuid}.mp4
Metadata: {
  "expiresAt": "2025-11-02T12:00:00.000Z"
}
```

## Video Preview

Once a video is merged temporarily, you can:
1. Use the `videoPath` or `previewUrl` from the response
2. Stream the video directly from Object Storage
3. Check expiry status using the info endpoint
4. Preview expires automatically after 24 hours (or custom duration)

## Implementation Details

### mergeVideosWithFFmpegTemporary Function

```typescript
export async function mergeVideosWithFFmpegTemporary(
  videoUrls: string[], 
  expiryHours: number = 24
): Promise<{ videoPath: string; expiresAt: string }>
```

**Process:**
1. Downloads videos from Cloudinary URLs
2. Creates FFmpeg concat file
3. Merges videos using `ffmpeg -f concat`
4. Uploads to Replit Object Storage with expiry metadata
5. Cleans up temporary files
6. Returns video path and expiry timestamp

### Error Handling

- Failed downloads: Returns detailed error about which video failed
- FFmpeg errors: Logs stderr output for debugging
- Storage errors: Gracefully handles upload failures
- Cleanup errors: Logs but doesn't throw to prevent blocking

## Comparison: Permanent vs Temporary Storage

| Feature | Permanent (Cloudinary) | Temporary (Object Storage) |
|---------|----------------------|---------------------------|
| Duration | Unlimited | 24 hours (configurable) |
| API | `/api/merge-selected-videos` | `/api/merge-videos-temporary` |
| Storage | Cloudinary CDN | Replit Object Storage |
| Cleanup | Manual | Automatic (hourly) |
| Cost | Uses Cloudinary quota | Uses Replit storage |
| Use Case | Final videos | Preview & testing |

## Frontend Integration

To use the temporary video feature in the frontend:

```typescript
// Merge videos temporarily
const response = await fetch('/api/merge-videos-temporary', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    videoIds: selectedVideoIds,
    expiryHours: 24
  })
});

const { videoPath, expiresAt, previewUrl } = await response.json();

// Show video preview with expiry notice
<video src={previewUrl} controls />
<p>Expires at: {new Date(expiresAt).toLocaleString()}</p>

// Check if video is still available
const infoResponse = await fetch(
  `/api/temp-video-info?videoPath=${encodeURIComponent(videoPath)}`
);
const { isExpired } = await infoResponse.json();
```

## Monitoring

Check server logs for cleanup activity:

```
[Hourly Cleanup] Deleted 3 expired temporary videos
[Daily Cleanup] Running cleanup tasks at midnight PKT (11/2/2025)
[Daily Cleanup] Deleted 5 expired temporary videos
[Object Storage] Cleanup complete. Deleted 5 expired videos
```

## Security

- All endpoints require authentication
- Manual cleanup requires admin privileges
- Videos are scoped to authenticated users
- Automatic expiry prevents storage bloat

## Troubleshooting

### Video Not Found
- Check if video has expired (24 hours default)
- Verify the videoPath is correct
- Check cleanup logs for deletion activity

### Cleanup Not Running
- Verify server is running continuously
- Check server logs for cleanup initialization
- Hourly cleanup: runs every 60 minutes
- Daily cleanup: runs at midnight PKT

### Storage Errors
- Verify Object Storage integration is configured
- Check REPLIT_DEPLOYMENT environment variable
- Ensure proper bucket permissions

## Future Enhancements

Potential improvements:
- Custom expiry times per video
- Email notification before expiry
- Extension of expiry time
- Multiple quality options for previews
- Bandwidth monitoring and limits
