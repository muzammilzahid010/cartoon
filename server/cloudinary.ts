// Cloudinary upload utility for videos and images
// Fetches video from VEO URL and uploads to Cloudinary
// Converts base64 images and uploads to Cloudinary

import { readFile } from 'fs/promises';

const CLOUDINARY_CLOUD_NAME = 'dy40igzli';
const CLOUDINARY_UPLOAD_PRESET = 'demo123';
const CLOUDINARY_VIDEO_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
const CLOUDINARY_IMAGE_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  format: string;
  duration: number;
  width: number;
  height: number;
  url: string;
}

export async function uploadVideoToCloudinary(videoUrlOrPath: string): Promise<string> {
  try {
    let videoBlob: Blob;
    
    // Check if it's a local file path or URL
    if (videoUrlOrPath.startsWith('http://') || videoUrlOrPath.startsWith('https://')) {
      // It's a URL - fetch from remote
      console.log('[Cloudinary] Starting upload from URL:', videoUrlOrPath.substring(0, 100));
      console.log('[Cloudinary] Fetching video from URL...');
      const videoResponse = await fetch(videoUrlOrPath);
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
      }

      videoBlob = await videoResponse.blob();
      console.log('[Cloudinary] Video fetched, size:', videoBlob.size, 'bytes');
    } else {
      // It's a local file path - read from disk and convert to Blob
      console.log('[Cloudinary] Starting upload from local file:', videoUrlOrPath);
      const fileBuffer = await readFile(videoUrlOrPath);
      videoBlob = new Blob([fileBuffer], { type: 'video/mp4' });
      console.log('[Cloudinary] File read, size:', videoBlob.size, 'bytes');
    }

    // Create FormData for Cloudinary upload
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // Upload to Cloudinary
    console.log('[Cloudinary] Uploading to Cloudinary...');
    const uploadResponse = await fetch(CLOUDINARY_VIDEO_UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Cloudinary upload failed: ${uploadResponse.statusText} - ${errorText}`);
    }

    const result: CloudinaryUploadResponse = await uploadResponse.json();
    console.log('[Cloudinary] Upload successful! URL:', result.secure_url);
    
    return result.secure_url;
  } catch (error) {
    console.error('[Cloudinary] Upload error:', error);
    throw new Error(`Failed to upload video to Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function uploadImageToCloudinary(base64Data: string, extension: string = 'png'): Promise<string> {
  try {
    console.log(`[Cloudinary] Converting base64 to ${extension} image...`);
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log(`[Cloudinary] Image size: ${imageBuffer.length} bytes`);
    
    // Create blob from buffer
    const imageBlob = new Blob([imageBuffer], { 
      type: extension === 'jpg' ? 'image/jpeg' : `image/${extension}` 
    });

    // Create FormData for Cloudinary upload
    const formData = new FormData();
    formData.append('file', imageBlob, `image.${extension}`);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'ai-images');

    // Upload to Cloudinary
    console.log('[Cloudinary] Uploading image to Cloudinary...');
    const uploadResponse = await fetch(CLOUDINARY_IMAGE_UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Cloudinary upload failed: ${uploadResponse.statusText} - ${errorText}`);
    }

    const result: CloudinaryUploadResponse = await uploadResponse.json();
    console.log('[Cloudinary] Image upload successful! URL:', result.secure_url);
    
    return result.secure_url;
  } catch (error) {
    console.error('[Cloudinary] Image upload error:', error);
    throw new Error(`Failed to upload image to Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
