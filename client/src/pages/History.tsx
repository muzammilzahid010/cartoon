import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Home, Download, Calendar, Film, Loader2 } from "lucide-react";
import type { VideoHistory } from "@shared/schema";

export default function History() {
  const { data, isLoading } = useQuery<{ videos: VideoHistory[] }>({
    queryKey: ["/api/video-history"],
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const getAspectRatioLabel = (aspectRatio: string) => {
    return aspectRatio === "landscape" ? "Landscape (16:9)" : "Portrait (9:16)";
  };

  const handleDownload = (videoUrl: string) => {
    window.open(videoUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Video History</h1>
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="link-home">
              <Home className="w-4 h-4 mr-1" />
              Home
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Generated Videos</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View and download all your previously generated videos
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : data?.videos && data.videos.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.videos.map((video) => (
              <Card key={video.id} data-testid={`video-card-${video.id}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="w-5 h-5" />
                    {video.title || `Video ${video.id.slice(0, 8)}`}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 text-xs">
                    <Calendar className="w-3 h-3" />
                    {formatDate(video.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <strong>Prompt:</strong> {video.prompt}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <strong>Aspect Ratio:</strong> {getAspectRatioLabel(video.aspectRatio)}
                    </p>
                    <p className="text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        video.status === 'completed' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : video.status === 'failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      }`}>
                        {video.status.charAt(0).toUpperCase() + video.status.slice(1)}
                      </span>
                    </p>
                  </div>

                  {video.videoUrl && video.status === 'completed' && (
                    <>
                      <div className="aspect-video bg-black rounded-lg overflow-hidden">
                        <video
                          src={video.videoUrl}
                          controls
                          className="w-full h-full"
                          data-testid={`video-player-${video.id}`}
                        />
                      </div>
                      <Button
                        onClick={() => handleDownload(video.videoUrl!)}
                        className="w-full"
                        size="sm"
                        data-testid={`button-download-${video.id}`}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </>
                  )}

                  {video.status === 'pending' && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg text-center">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        Video is being generated...
                      </p>
                    </div>
                  )}

                  {video.status === 'failed' && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-center">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        Video generation failed
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Film className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No videos yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Start generating videos to build your collection
            </p>
            <Link href="/veo-generator">
              <Button data-testid="button-generate-first">
                <Film className="w-4 h-4 mr-2" />
                Generate Your First Video
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
