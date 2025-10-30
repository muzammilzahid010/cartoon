// Google Drive video upload utility
// Uploads large merged videos to Google Drive

import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';

interface UploadResult {
  id: string;
  webViewLink: string;
  webContentLink: string;
}

/**
 * Upload a video file to Google Drive
 * @param filePath Local path to the video file
 * @param fileName Name for the file in Google Drive
 * @returns Object containing file ID and shareable link
 */
export async function uploadVideoToGoogleDrive(
  filePath: string,
  fileName: string = 'merged-video.mp4'
): Promise<UploadResult> {
  try {
    console.log('[Google Drive] Starting upload from local file:', filePath);
    
    // Parse Google Drive credentials from environment
    const credentials = process.env.GOOGLE_DRIVE_CREDENTIALS;
    if (!credentials) {
      throw new Error('GOOGLE_DRIVE_CREDENTIALS environment variable is not set');
    }

    let credentialsJson;
    try {
      credentialsJson = JSON.parse(credentials);
    } catch (error) {
      throw new Error(`Failed to parse Google Drive credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials: credentialsJson,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Get file stats
    const fileBuffer = await readFile(filePath);
    console.log('[Google Drive] File size:', fileBuffer.byteLength, 'bytes');

    // Create file metadata
    const fileMetadata = {
      name: fileName,
      mimeType: 'video/mp4',
    };

    // Upload the file
    console.log('[Google Drive] Uploading to Google Drive...');
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'video/mp4',
        body: createReadStream(filePath),
      },
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = response.data.id;
    if (!fileId) {
      throw new Error('Failed to get file ID from Google Drive');
    }

    console.log('[Google Drive] Upload successful! File ID:', fileId);

    // Make the file publicly accessible
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    console.log('[Google Drive] File set to public access');

    // Get the direct download link
    const file = await drive.files.get({
      fileId,
      fields: 'webViewLink, webContentLink',
    });

    return {
      id: fileId,
      webViewLink: file.data.webViewLink || '',
      webContentLink: file.data.webContentLink || '',
    };
  } catch (error) {
    console.error('[Google Drive] Upload error:', error);
    throw new Error(
      `Failed to upload video to Google Drive: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get a direct download link for a Google Drive file
 * @param fileId Google Drive file ID
 * @returns Direct download URL
 */
export function getDirectDownloadLink(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
