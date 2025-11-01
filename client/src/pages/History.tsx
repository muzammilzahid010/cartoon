import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { Home, Download, Calendar, Film, Loader2, RefreshCw, Merge, Play, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { VideoHistory, Scene } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface GroupedVideo {
  project?: {
    id: string;
    title: string;
    scenes: Scene[];
    characters: any[];
    mergedVideoUrl?: string;
  };
  videos: VideoHistory[];
}

export default function History() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [mergingProject, setMergingProject] = useState<string | null>(null);
  const [mergedVideoUrls, setMergedVideoUrls] = useState<Record<string, string>>({});

  const { data: session, isLoading: sessionLoading } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
  });

  const { data, isLoading, refetch } = useQuery<{ 
    videos: VideoHistory[]; 
    grouped: Record<string, GroupedVideo>;
  }>({
    queryKey: ["/api/video-history"],
    enabled: session?.authenticated === true,
  });

  const regenerateMutation = useMutation({
    mutationFn: async ({ prompt, sceneNumber, videoId, projectId }: { 
      prompt: string; 
      sceneNumber: number;
      videoId: string;
      projectId?: string;
    }) => {
      // Use the dedicated regenerate endpoint
      const response = await fetch('/api/regenerate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          videoId,
          prompt,
          aspectRatio: "landscape",
          projectId,
          sceneNumber
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to regenerate video');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Video Regeneration Started",
        description: "Your video is being regenerated. This may take a few minutes.",
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Regeneration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!sessionLoading && session && !session.authenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in to view your video history.",
        variant: "destructive",
      });
      setLocation("/login");
    }
  }, [session, sessionLoading, setLocation, toast]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  // Calculate today's statistics
  const getTodayStats = () => {
    if (!data?.videos) return { total: 0, completed: 0, failed: 0, pending: 0 };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayVideos = data.videos.filter(video => {
      const videoDate = new Date(video.createdAt);
      videoDate.setHours(0, 0, 0, 0);
      return videoDate.getTime() === today.getTime();
    });
    
    return {
      total: todayVideos.length,
      completed: todayVideos.filter(v => v.status === 'completed').length,
      failed: todayVideos.filter(v => v.status === 'failed').length,
      pending: todayVideos.filter(v => v.status === 'pending').length,
    };
  };

  const todayStats = getTodayStats();

  const handleDownload = (videoUrl: string) => {
    window.open(videoUrl, '_blank');
  };

  const handleMergeVideos = async (projectKey: string, videos: VideoHistory[], projectId?: string) => {
    try {
      const completedVideos = videos.filter(v => v.status === 'completed' && v.videoUrl);
      
      if (completedVideos.length < 2) {
        toast({
          title: "Cannot Merge",
          description: "You need at least 2 completed videos to merge.",
          variant: "destructive",
        });
        return;
      }

      setMergingProject(projectKey);

      // Sort by scene number (extract from title)
      const sortedVideos = completedVideos.sort((a, b) => {
        const aNum = parseInt(a.title?.match(/Scene (\d+)/)?.[1] || '0');
        const bNum = parseInt(b.title?.match(/Scene (\d+)/)?.[1] || '0');
        return aNum - bNum;
      });

      const payload: any = {
        videos: sortedVideos.map((v, idx) => ({
          sceneNumber: idx + 1,
          videoUrl: v.videoUrl!
        }))
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
      
      setMergedVideoUrls(prev => ({
        ...prev,
        [projectKey]: result.mergedVideoUrl
      }));

      toast({
        title: "Videos Merged!",
        description: "All videos have been successfully merged into one.",
      });

      refetch();
    } catch (error) {
      console.error("Error merging videos:", error);
      toast({
        title: "Merge Failed",
        description: error instanceof Error ? error.message : "Failed to merge videos.",
        variant: "destructive",
      });
    } finally {
      setMergingProject(null);
    }
  };

  const renderVideoCard = (video: VideoHistory, showRegenerateButton = false) => (
    <Card key={video.id} data-testid={`video-card-${video.id}`} className="h-full">
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Film className="w-4 h-4" />
          <span className="truncate">{video.title || `Video ${video.id.slice(0, 8)}`}</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-2 text-xs">
          <Calendar className="w-3 h-3" />
          {formatDate(video.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-4">
        <p className="text-xs sm:text-sm">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            video.status === 'completed' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : video.status === 'failed'
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
          }`}>
            {video.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
            {video.status === 'failed' && <AlertCircle className="w-3 h-3" />}
            {video.status === 'pending' && <Loader2 className="w-3 h-3 animate-spin" />}
            {video.status.charAt(0).toUpperCase() + video.status.slice(1)}
          </span>
        </p>

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

        {video.status === 'failed' && showRegenerateButton && (
          <Button
            onClick={() => regenerateMutation.mutate({ 
              sceneNumber: parseInt(video.title?.match(/Scene (\d+)/)?.[1] || '1'),
              prompt: video.prompt,
              videoId: video.id,
              projectId: video.projectId || undefined
            })}
            variant="outline"
            className="w-full"
            size="sm"
            disabled={regenerateMutation.isPending}
            data-testid={`button-regenerate-${video.id}`}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerate
          </Button>
        )}
      </CardContent>
    </Card>
  );

  const renderProjectGroup = (key: string, group: GroupedVideo) => {
    const completedCount = group.videos.filter(v => v.status === 'completed').length;
    const failedCount = group.videos.filter(v => v.status === 'failed').length;
    const mergedUrl = group.project?.mergedVideoUrl || mergedVideoUrls[key];

    if (group.project) {
      // Cartoon project with scenes
      return (
        <Card key={key} className="mb-6">
          <CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <CardTitle className="text-lg sm:text-xl mb-2">{group.project.title}</CardTitle>
                <CardDescription className="text-sm">
                  {completedCount} of {group.videos.length} scenes completed
                  {failedCount > 0 && ` • ${failedCount} failed`}
                </CardDescription>
              </div>
              {completedCount >= 2 && (
                <Button
                  onClick={() => handleMergeVideos(key, group.videos, group.project?.id)}
                  disabled={mergingProject === key}
                  size="sm"
                  data-testid={`button-merge-${key}`}
                >
                  {mergingProject === key ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Merge className="w-4 h-4 mr-2" />
                  )}
                  Merge Videos
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {mergedUrl && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Merged Video
                </h3>
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-3">
                  <video
                    src={mergedUrl}
                    controls
                    className="w-full h-full"
                    data-testid={`merged-video-${key}`}
                  />
                </div>
                <Button
                  onClick={() => handleDownload(mergedUrl)}
                  className="w-full"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Merged Video
                </Button>
              </div>
            )}

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="scenes">
                <AccordionTrigger className="text-sm sm:text-base">
                  View All Scenes ({group.videos.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                    {group.videos.map(video => renderVideoCard(video, true))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      );
    } else {
      // Standalone videos
      return (
        <div key={key} className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Standalone Videos</h3>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {group.videos.map(video => renderVideoCard(video, false))}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <h1 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-white">Video History</h1>
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="link-home">
              <Home className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Your Generated Videos</h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
            View, download, regenerate, and merge your cartoon videos
          </p>
        </div>

        {/* Today's Statistics Card */}
        {todayStats.total > 0 && (
          <Card className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800">
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Today's Generation Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{todayStats.total}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total Videos</div>
                </div>
                <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <div className="flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">{todayStats.completed}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Successful</div>
                </div>
                <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <div className="flex items-center justify-center gap-1">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="text-2xl font-bold text-red-600 dark:text-red-400">{todayStats.failed}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Failed</div>
                </div>
                <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <div className="flex items-center justify-center gap-1">
                    <Loader2 className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{todayStats.pending}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Pending</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-12 sm:py-20">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
          </div>
        ) : data?.grouped && Object.keys(data.grouped).length > 0 ? (
          <div>
            {Object.entries(data.grouped).map(([key, group]) => renderProjectGroup(key, group))}
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
