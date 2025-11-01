import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { Home, Download, Calendar, Film, Loader2, RefreshCw, Merge, Play, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { VideoHistory, Scene } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [isMergingSelected, setIsMergingSelected] = useState(false);

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
    refetchInterval: (query) => {
      // Auto-refresh every 3 seconds if there are pending or queued videos
      const videos = query.state.data?.videos;
      if (!videos) return false;
      
      const hasProcessingVideos = videos.some(
        video => video.status === 'pending' || video.status === 'queued'
      );
      
      return hasProcessingVideos ? 3000 : false;
    },
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

  const retryMergeMutation = useMutation({
    mutationFn: async (videoId: string) => {
      const response = await fetch(`/api/retry-merge/${videoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to retry merge');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Merge Retry Started",
        description: "Your videos are being merged again. This may take a few minutes.",
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Retry Failed",
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
    if (!data?.videos) return { total: 0, completed: 0, failed: 0, pending: 0, queued: 0 };
    
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
      queued: todayVideos.filter(v => v.status === 'queued').length,
    };
  };

  const todayStats = getTodayStats();

  const handleDownload = (videoUrl: string) => {
    window.open(videoUrl, '_blank');
  };

  const handleVideoSelect = (videoId: string, isCompleted: boolean) => {
    if (!isCompleted) {
      toast({
        title: "Cannot Select",
        description: "Only completed videos can be selected for merging.",
        variant: "destructive",
      });
      return;
    }

    setSelectedVideos(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(videoId)) {
        newSelection.delete(videoId);
      } else {
        if (newSelection.size >= 19) {
          toast({
            title: "Maximum Selection Reached",
            description: "You can select maximum 19 videos at a time.",
            variant: "destructive",
          });
          return prev;
        }
        newSelection.add(videoId);
      }
      return newSelection;
    });
  };

  const handleMergeSelected = async () => {
    if (selectedVideos.size < 2) {
      toast({
        title: "Select More Videos",
        description: "Please select at least 2 videos to merge.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsMergingSelected(true);

      // Send video IDs (not URLs) for security - backend will verify ownership
      const videoIds = Array.from(selectedVideos);

      const response = await fetch('/api/merge-selected-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          videoIds: videoIds,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to merge videos');
      }

      const result = await response.json();

      toast({
        title: "Videos Merged Successfully!",
        description: `${selectedVideos.size} videos have been merged.`,
      });

      // Clear selection
      setSelectedVideos(new Set());

      // Show the merged video in a new window or download
      if (result.mergedVideoUrl) {
        window.open(result.mergedVideoUrl, '_blank');
      }

      refetch();
    } catch (error) {
      console.error("Error merging selected videos:", error);
      toast({
        title: "Merge Failed",
        description: error instanceof Error ? error.message : "Failed to merge selected videos.",
        variant: "destructive",
      });
    } finally {
      setIsMergingSelected(false);
    }
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

  const renderVideoCard = (video: VideoHistory, showRegenerateButton = false) => {
    const isSelected = selectedVideos.has(video.id);
    const isCompleted = video.status === 'completed';
    
    return (
      <Card key={video.id} data-testid={`video-card-${video.id}`} className={`h-full bg-[#1e2838] dark:bg-[#181e2a] border transition-all ${
        isSelected ? 'border-purple-500 ring-2 ring-purple-500/50' : 'border-white/10'
      }`}>
        <CardHeader className="p-3 sm:p-4">
          <div className="flex items-start gap-2 mb-2">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => handleVideoSelect(video.id, isCompleted)}
              disabled={!isCompleted}
              className="mt-0.5 border-white/30 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              data-testid={`checkbox-select-${video.id}`}
            />
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-white">
                <Film className="w-4 h-4" />
                <span className="truncate">{video.title || `Video ${video.id.slice(0, 8)}`}</span>
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-xs text-gray-300 mt-1">
                <Calendar className="w-3 h-3" />
                {formatDate(video.createdAt)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-4">
        <p className="text-xs sm:text-sm">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            video.status === 'completed' 
              ? 'bg-green-600/20 border border-green-500/30 text-green-300'
              : video.status === 'failed'
              ? 'bg-red-600/20 border border-red-500/30 text-red-300'
              : video.status === 'queued'
              ? 'bg-purple-600/20 border border-purple-500/30 text-purple-300'
              : 'bg-yellow-600/20 border border-yellow-500/30 text-yellow-300'
          }`}>
            {video.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
            {video.status === 'failed' && <AlertCircle className="w-3 h-3" />}
            {video.status === 'pending' && <Loader2 className="w-3 h-3 animate-spin" />}
            {video.status === 'queued' && <Clock className="w-3 h-3" />}
            {video.status.charAt(0).toUpperCase() + video.status.slice(1)}
          </span>
        </p>

        {/* Display the original prompt */}
        {video.prompt && (
          <div className="bg-white/5 border border-white/10 rounded-lg p-2 sm:p-3">
            <p className="text-xs text-gray-300 font-medium mb-1">Prompt:</p>
            <p className="text-xs sm:text-sm text-white line-clamp-3" data-testid={`text-prompt-${video.id}`}>
              {video.prompt}
            </p>
          </div>
        )}

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

        {/* Check if this is a merged video (has metadata with mergedVideoIds) */}
        {(() => {
          try {
            const metadata = video.metadata ? JSON.parse(video.metadata) : null;
            const isMergedVideo = metadata?.mergedVideoIds && Array.isArray(metadata.mergedVideoIds);
            
            // Show retry button for failed merged videos
            if (isMergedVideo && video.status === 'failed') {
              return (
                <Button
                  onClick={() => retryMergeMutation.mutate(video.id)}
                  variant="outline"
                  className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
                  size="sm"
                  disabled={retryMergeMutation.isPending}
                  data-testid={`button-retry-merge-${video.id}`}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Merge
                </Button>
              );
            }
            
            // Show regenerate button for regular videos when enabled
            if (showRegenerateButton && !isMergedVideo) {
              return (
                <Button
                  onClick={() => regenerateMutation.mutate({ 
                    sceneNumber: parseInt(video.title?.match(/Scene (\d+)/)?.[1] || '1'),
                    prompt: video.prompt,
                    videoId: video.id,
                    projectId: video.projectId || undefined
                  })}
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10"
                  size="sm"
                  disabled={regenerateMutation.isPending || video.status === 'queued'}
                  data-testid={`button-regenerate-${video.id}`}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
              );
            }
          } catch (e) {
            // If metadata parsing fails, show normal regenerate button
            if (showRegenerateButton) {
              return (
                <Button
                  onClick={() => regenerateMutation.mutate({ 
                    sceneNumber: parseInt(video.title?.match(/Scene (\d+)/)?.[1] || '1'),
                    prompt: video.prompt,
                    videoId: video.id,
                    projectId: video.projectId || undefined
                  })}
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10"
                  size="sm"
                  disabled={regenerateMutation.isPending || video.status === 'queued'}
                  data-testid={`button-regenerate-${video.id}`}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
              );
            }
          }
          return null;
        })()}
      </CardContent>
    </Card>
  );
  };

  const renderProjectGroup = (key: string, group: GroupedVideo) => {
    const completedCount = group.videos.filter(v => v.status === 'completed').length;
    const failedCount = group.videos.filter(v => v.status === 'failed').length;
    const mergedUrl = group.project?.mergedVideoUrl || mergedVideoUrls[key];

    if (group.project) {
      // Cartoon project with scenes
      return (
        <Card key={key} className="mb-6 bg-[#1e2838] dark:bg-[#181e2a] border border-white/10">
          <CardHeader className="p-4 sm:p-6 bg-purple-600/10 border-b border-white/10">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <CardTitle className="text-lg sm:text-xl mb-2 text-white">{group.project.title}</CardTitle>
                <CardDescription className="text-sm text-gray-300">
                  {completedCount} of {group.videos.length} scenes completed
                  {failedCount > 0 && ` • ${failedCount} failed`}
                </CardDescription>
              </div>
              {completedCount >= 2 && (
                <Button
                  onClick={() => handleMergeVideos(key, group.videos, group.project?.id)}
                  disabled={mergingProject === key}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 border-0"
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
              <div className="mb-6 p-4 bg-green-600/10 border border-green-500/30 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-white">
                  <Play className="w-5 h-5 text-green-400" />
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
                  className="w-full bg-purple-600 hover:bg-purple-700 border-0"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Merged Video
                </Button>
              </div>
            )}

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="scenes" className="border-white/10">
                <AccordionTrigger className="text-sm sm:text-base text-white hover:text-white">
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
          <h3 className="text-lg font-semibold mb-4 text-white">Standalone Videos</h3>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {group.videos.map(video => renderVideoCard(video, true))}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      <header className="border-b border-white/10 bg-[#1c2534]/80 dark:bg-[#161c28]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <h1 className="text-sm sm:text-base md:text-lg font-semibold text-white">Video History</h1>
          <Link href="/">
            <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" data-testid="link-home">
              <Home className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Your Generated Videos</h2>
              <p className="text-sm sm:text-base text-gray-300 mt-1">
                View, download, regenerate, and merge your cartoon videos
              </p>
            </div>
            
            {/* Merge Selected Button */}
            {selectedVideos.size > 0 && (
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-300">
                  {selectedVideos.size} selected (max 19)
                </div>
                <Button
                  onClick={handleMergeSelected}
                  disabled={selectedVideos.size < 2 || isMergingSelected}
                  className="bg-purple-600 hover:bg-purple-700 border-0 shrink-0"
                  data-testid="button-merge-selected"
                >
                  {isMergingSelected ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Merge className="w-4 h-4 mr-2" />
                  )}
                  Merge Selected ({selectedVideos.size})
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Today's Statistics Card */}
        {todayStats.total > 0 && (
          <Card className="mb-6 bg-[#1e2838] dark:bg-[#181e2a] border border-white/10">
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Calendar className="w-5 h-5 text-purple-400" />
                Today's Generation Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg">
                  <div className="text-2xl font-bold text-white">{todayStats.total}</div>
                  <div className="text-xs text-gray-300 mt-1">Total</div>
                </div>
                <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <span className="text-2xl font-bold text-green-400">{todayStats.completed}</span>
                  </div>
                  <div className="text-xs text-gray-300 mt-1">Completed</div>
                </div>
                <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center justify-center gap-1">
                    <Loader2 className="w-5 h-5 text-yellow-400" />
                    <span className="text-2xl font-bold text-yellow-400">{todayStats.pending}</span>
                  </div>
                  <div className="text-xs text-gray-300 mt-1">Processing</div>
                </div>
                <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-5 h-5 text-purple-400" />
                    <span className="text-2xl font-bold text-purple-400">{todayStats.queued}</span>
                  </div>
                  <div className="text-xs text-gray-300 mt-1">Queued</div>
                </div>
                <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center justify-center gap-1">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-2xl font-bold text-red-400">{todayStats.failed}</span>
                  </div>
                  <div className="text-xs text-gray-300 mt-1">Failed</div>
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
