// Video merger utility using FFmpeg
// Downloads videos from URLs, merges them sequentially into a local temporary file
// Note: The merged file should be uploaded to Cloudinary by the caller for persistent storage

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

interface VideoToMerge {
  sceneNumber: number;
  videoUrl: string;
}

export async function mergeVideos(videos: VideoToMerge[]): Promise<string> {
  // Sort videos by scene number to ensure correct sequence
  const sortedVideos = [...videos].sort((a, b) => a.sceneNumber - b.sceneNumber);
  
  // Create unique temp directory for this merge operation
  const uniqueId = randomUUID();
  const tempDir = path.join('/tmp', `video-merge-${uniqueId}`);
  const listFile = path.join(tempDir, 'filelist.txt');
  const outputFile = path.join(tempDir, 'merged-output.mp4');

  try {
    // Create temp directory if it doesn't exist
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    console.log(`[Video Merger] Starting merge of ${sortedVideos.length} videos in ${tempDir}`);

    // Step 1: Download all videos to temp directory
    const downloadedFiles: string[] = [];
    for (const video of sortedVideos) {
      const filename = path.join(tempDir, `scene-${video.sceneNumber}.mp4`);
      console.log(`[Video Merger] Downloading scene ${video.sceneNumber}...`);
      
      const response = await fetch(video.videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video ${video.sceneNumber}: ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      await writeFile(filename, Buffer.from(buffer));
      downloadedFiles.push(filename);
      console.log(`[Video Merger] Downloaded scene ${video.sceneNumber} (${buffer.byteLength} bytes)`);
    }

    // Step 2: Create file list for FFmpeg concat
    const fileListContent = downloadedFiles
      .map(file => `file '${file}'`)
      .join('\n');
    await writeFile(listFile, fileListContent);
    console.log(`[Video Merger] Created file list with ${downloadedFiles.length} videos`);

    // Step 3: Merge videos using FFmpeg concat demuxer
    console.log(`[Video Merger] Running FFmpeg to merge videos...`);
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}"`;
    
    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand);
      console.log(`[Video Merger] FFmpeg completed successfully`);
      if (stderr) {
        console.log(`[Video Merger] FFmpeg stderr:`, stderr.substring(0, 500));
      }
    } catch (ffmpegError: any) {
      console.error(`[Video Merger] FFmpeg error:`, ffmpegError.stderr || ffmpegError.message);
      throw new Error(`FFmpeg failed: ${ffmpegError.message}`);
    }

    // Step 4: Return the local merged video file path
    console.log(`[Video Merger] Merge complete, returning local file path`);
    
    // Note: Caller is responsible for uploading to Cloudinary and cleaning up temp files
    return outputFile;
  } catch (error) {
    console.error(`[Video Merger] Error during merge process:`, error);
    
    // Clean up on error - remove entire temp directory
    try {
      if (existsSync(tempDir)) {
        await rm(tempDir, { recursive: true, force: true });
        console.log(`[Video Merger] Error cleanup successful`);
      }
    } catch (cleanupError) {
      console.error(`[Video Merger] Error cleanup failed:`, cleanupError);
    }
    
    throw new Error(`Failed to merge videos: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
