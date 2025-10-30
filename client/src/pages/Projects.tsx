import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Home, Film, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Character, Scene } from "@shared/schema";

export default function Projects() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ["/api/projects"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiRequest("DELETE", `/api/projects/${projectId}`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project deleted",
        description: "The project has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (projectId: string, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"?`)) {
      deleteMutation.mutate(projectId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSceneCount = (scenesJson: string): number => {
    try {
      const scenes: Scene[] = JSON.parse(scenesJson);
      return scenes.length;
    } catch {
      return 0;
    }
  };

  const getCharacterCount = (charactersJson: string): number => {
    try {
      const characters: Character[] = JSON.parse(charactersJson);
      return characters.length;
    } catch {
      return 0;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <h1 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-white">My Projects</h1>
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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Your Cartoon Story Projects</h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
            View and manage all your cartoon generation projects
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12 sm:py-20">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
          </div>
        ) : data?.projects && data.projects.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((project) => (
              <Card key={project.id} data-testid={`project-card-${project.id}`}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg truncate">{project.title}</CardTitle>
                  <CardDescription className="text-xs">
                    Created {formatDate(project.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Scenes:</span>
                      <span className="font-semibold">{getSceneCount(project.scenes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Characters:</span>
                      <span className="font-semibold">{getCharacterCount(project.characters)}</span>
                    </div>
                    {project.mergedVideoUrl && (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Film className="w-4 h-4" />
                        <span className="text-xs">Video Generated</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Link href={`/projects/${project.id}`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full" data-testid={`button-view-${project.id}`}>
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(project.id, project.title)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${project.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center p-8 sm:p-12">
            <CardContent className="space-y-4">
              <Film className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400" />
              <div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No projects yet</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">
                  Create your first cartoon story project to get started
                </p>
                <Link href="/">
                  <Button data-testid="button-create-first">
                    Create Your First Project
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
