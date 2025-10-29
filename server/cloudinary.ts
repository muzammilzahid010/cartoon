// Cloudinary video upload utility
// Fetches video from VEO URL and uploads to Cloudinary

const CLOUDINARY_CLOUD_NAME = 'dy40igzli';
const CLOUDINARY_UPLOAD_PRESET = 'demo123';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  format: string;
  duration: number;
  width: number;
  height: number;
  url: string;
}

export async function uploadVideoToCloudinary(videoUrl: string): Promise<string> {
  console.log('[Cloudinary] Starting upload from URL:', videoUrl.substring(0, 100));
  
  try {
    // Step 1: Fetch the video from VEO URL
    console.log('[Cloudinary] Fetching video from VEO...');
    const videoResponse = await fetch(videoUrl);
    
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
    }

    const videoBlob = await videoResponse.blob();
    console.log('[Cloudinary] Video fetched, size:', videoBlob.size, 'bytes');

    // Step 2: Create FormData for Cloudinary upload
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // Step 3: Upload to Cloudinary
    console.log('[Cloudinary] Uploading to Cloudinary...');
    const uploadResponse = await fetch(CLOUDINARY_UPLOAD_URL, {
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
