import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Download, Play } from "lucide-react";

interface GeneratedVideo {
  sceneNumber: number;
  sceneTitle: string;
  videoUrl?: string;
  status: string;
  error?: string;
}

interface VideosDisplayProps {
  videos: GeneratedVideo[];
  onStartNew: () => void;
}

export default function VideosDisplay({ videos, onStartNew }: VideosDisplayProps) {
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
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onStartNew}
            data-testid="button-start-new-story"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Start New Story
          </Button>
          {completedVideos.length > 0 && (
            <Button
              onClick={handleDownloadAll}
              data-testid="button-download-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Download All
            </Button>
          )}
        </div>
      </div>

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
                  controls
                  className="w-full h-full"
                  data-testid={`video-player-${video.sceneNumber}`}
                >
                  <source src={video.videoUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute bottom-4 right-4">
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
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : video.error ? (
              <div className="aspect-video bg-destructive/10 flex items-center justify-center p-6">
                <div className="text-center">
                  <p className="text-destructive font-medium mb-2">
                    Failed to generate video
                  </p>
                  <p className="text-sm text-muted-foreground">{video.error}</p>
                </div>
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
