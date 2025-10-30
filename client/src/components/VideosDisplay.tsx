import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Download, Play, RefreshCw, Film } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface GeneratedVideo {
  sceneNumber: number;
  sceneTitle: string;
  videoUrl?: string;
  status: string;
  error?: string;
}

interface VideosDisplayProps {
  videos: GeneratedVideo[];
  projectId: string | null;
  onStartNew: () => void;
  onRetryVideo: (sceneNumber: number) => Promise<void>;
  onRetryAllFailed: () => Promise<void>;
}

export default function VideosDisplay({ videos, projectId, onStartNew, onRetryVideo, onRetryAllFailed }: VideosDisplayProps) {
  const [retryingScenes, setRetryingScenes] = useState<Set<number>>(new Set());
  const [retryingAll, setRetryingAll] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergingStatus, setMergingStatus] = useState<string>('');
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const completedVideos = videos.filter(v => v.status === 'completed');
  const failedVideos = videos.filter(v => v.status === 'failed');

  const handleDownloadAll = () => {
    completedVideos.forEach(video => {
      if (video.videoUrl) {
        const link = document.createElement('a');
        link.href = video.videoUrl;
        link.download = `scene-${video.sceneNumber}-${video.sceneTitle}.mp4`;
        link.click();
      }
    });
  };

  const handleRetryVideo = async (sceneNumber: number) => {
    // Prevent duplicate retries
    if (retryingScenes.has(sceneNumber)) {
      return;
    }
    
    setRetryingScenes(prev => new Set(prev).add(sceneNumber));
    try {
      await onRetryVideo(sceneNumber);
    } finally {
      setRetryingScenes(prev => {
        const next = new Set(prev);
        next.delete(sceneNumber);
        return next;
      });
    }
  };

  const handleRetryAllFailed = async () => {
    setRetryingAll(true);
    try {
      await onRetryAllFailed();
    } finally {
      setRetryingAll(false);
    }
  };

  const handleMergeVideos = async () => {
    if (completedVideos.length < 2) {
      toast({
        title: "Cannot Merge",
        description: "You need at least 2 completed videos to merge.",
        variant: "destructive",
      });
      return;
    }

    setMerging(true);
    setMergedVideoUrl(null); // Clear previous merged video
    setMergingStatus('Sending request...');
    
    try {
      const videosToMerge = completedVideos
        .sort((a, b) => a.sceneNumber - b.sceneNumber)
        .map(v => ({
          sceneNumber: v.sceneNumber,
          videoUrl: v.videoUrl!
        }));

      setMergingStatus('Executed - Processing videos...');
      
      // Only include projectId in payload if it exists
      const payload: { videos: typeof videosToMerge; projectId?: string } = {
        videos: videosToMerge
      };
      if (projectId) {
        payload.projectId = projectId;
      }
      
      const response = await fetch('/api/merge-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to merge videos');
      }

      const result = await response.json();
      
      setMergingStatus('Complete!');
      setMergedVideoUrl(result.mergedVideoUrl);
      
      toast({
        title: "Videos Merged!",
        description: "All videos have been successfully merged into one.",
      });
    } catch (error) {
      console.error("Error merging videos:", error);
      toast({
        title: "Merge Failed",
        description: error instanceof Error ? error.message : "Failed to merge videos.",
        variant: "destructive",
      });
      setMergingStatus('');
    } finally {
      setMerging(false);
      setTimeout(() => setMergingStatus(''), 2000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">Generated Videos</h2>
          <p className="text-muted-foreground">
            {completedVideos.length} of {videos.length} videos completed
            {failedVideos.length > 0 && ` (${failedVideos.length} failed)`}
          </p>
        </div>
        
        <div className="flex gap-3 flex-wrap">
          {failedVideos.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleRetryAllFailed}
              disabled={retryingAll}
              data-testid="button-retry-all-failed"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${retryingAll ? 'animate-spin' : ''}`} />
              Regenerate Failed Videos ({failedVideos.length})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onStartNew}
            data-testid="button-start-new-story"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Start New Story
          </Button>
          {completedVideos.length > 0 && (
            <>
              <Button
                onClick={handleMergeVideos}
                disabled={merging || completedVideos.length < 2}
                data-testid="button-merge-videos"
                variant="default"
              >
                <Film className={`w-4 h-4 mr-2 ${merging ? 'animate-pulse' : ''}`} />
                {merging ? mergingStatus : 'Merge All Videos'}
              </Button>
              <Button
                onClick={handleDownloadAll}
                data-testid="button-download-all"
              >
                <Download className="w-4 h-4 mr-2" />
                Download All
              </Button>
            </>
          )}
        </div>
      </div>

      {merging && !mergedVideoUrl && (
        <Card className="mb-8 p-8" data-testid="merging-progress-card">
          <div className="flex flex-col items-center justify-center gap-4">
            <Film className="w-12 h-12 animate-pulse text-primary" />
            <div className="text-center">
              <h3 className="font-semibold text-lg mb-2">{mergingStatus}</h3>
              <p className="text-sm text-muted-foreground">
                Merging {completedVideos.length} videos into one...
              </p>
            </div>
          </div>
        </Card>
      )}

      {mergedVideoUrl && (
        <Card className="mb-8 overflow-hidden" data-testid="merged-video-card">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="default">
                    <Film className="w-3 h-3 mr-1" />
                    Merged Video
                  </Badge>
                  <Badge variant="default">All {completedVideos.length} scenes</Badge>
                </div>
                <h3 className="font-semibold">Complete Story</h3>
              </div>
            </div>
          </div>
          <div className="relative aspect-video bg-black">
            <video
              key={mergedVideoUrl}
              controls
              className="w-full h-full"
              data-testid="merged-video-player"
            >
              <source src={mergedVideoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            <div className="absolute bottom-4 right-4 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = mergedVideoUrl;
                  link.download = 'merged-story.mp4';
                  link.click();
                }}
                data-testid="button-download-merged"
                title="Download Video"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {videos.map((video) => (
          <Card 
            key={video.sceneNumber} 
            className="overflow-hidden"
            data-testid={`video-card-${video.sceneNumber}`}
          >
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="default">Scene {video.sceneNumber}</Badge>
                    <Badge variant={
                      video.status === 'completed' ? 'default' :
                      video.status === 'failed' ? 'destructive' : 'secondary'
                    }>
                      {video.status}
                    </Badge>
                  </div>
                  <h3 className="font-semibold">{video.sceneTitle}</h3>
                </div>
              </div>
            </div>

            {video.videoUrl ? (
              <div className="relative aspect-video bg-black">
                <video
                  key={video.videoUrl}
                  controls
                  className="w-full h-full"
                  data-testid={`video-player-${video.sceneNumber}`}
                >
                  <source src={video.videoUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRetryVideo(video.sceneNumber)}
                    disabled={retryingScenes.has(video.sceneNumber)}
                    data-testid={`button-regenerate-${video.sceneNumber}`}
                    title="Regenerate this video"
                  >
                    <RefreshCw className={`w-4 h-4 ${retryingScenes.has(video.sceneNumber) ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = video.videoUrl!;
                      link.download = `scene-${video.sceneNumber}.mp4`;
                      link.click();
                    }}
                    data-testid={`button-download-${video.sceneNumber}`}
                    title="Download this video"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : video.error ? (
              <div className="aspect-video bg-destructive/10 flex flex-col items-center justify-center p-6">
                <div className="text-center mb-4">
                  <p className="text-destructive font-medium mb-2">
                    Failed to generate video
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">{video.error}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleRetryVideo(video.sceneNumber)}
                  disabled={retryingScenes.has(video.sceneNumber)}
                  data-testid={`button-retry-${video.sceneNumber}`}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${retryingScenes.has(video.sceneNumber) ? 'animate-spin' : ''}`} />
                  {retryingScenes.has(video.sceneNumber) ? 'Regenerating...' : 'Try Again'}
                </Button>
              </div>
            ) : (
              <div className="aspect-video bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Video not available</p>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
