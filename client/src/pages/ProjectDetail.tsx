import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Home, ArrowLeft, Download } from "lucide-react";
import type { Project, Character, Scene } from "@shared/schema";
import SceneCard from "@/components/SceneCard";

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;

  const { data, isLoading, error } = useQuery<{ project: Project }>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  const parseJSON = <T,>(jsonString: string, fallback: T): T => {
    try {
      return JSON.parse(jsonString);
    } catch {
      return fallback;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data?.project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-red-600 mb-4">Project not found</p>
          <Link href="/projects">
            <Button>Back to Projects</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const project = data.project;
  const characters = parseJSON<Character[]>(project.characters, []);
  const scenes = parseJSON<Scene[]>(project.scenes, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <h1 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate">{project.title}</h1>
          <div className="flex gap-2">
            <Link href="/projects">
              <Button variant="outline" size="sm" data-testid="link-back">
                <ArrowLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="link-home">
                <Home className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Home</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Story Script</CardTitle>
              <CardDescription>The original story script for this project</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm sm:text-base whitespace-pre-wrap">{project.script}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Characters ({characters.length})</CardTitle>
              <CardDescription>Characters in this story</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {characters.map((char, idx) => (
                <div key={idx} className="border-l-4 border-primary pl-4">
                  <h4 className="font-semibold">{char.name}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{char.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {project.mergedVideoUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Merged Video</CardTitle>
                <CardDescription>The complete story video combining all scenes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full">
                  <video 
                    key={project.mergedVideoUrl}
                    controls 
                    className="w-full rounded-lg shadow-lg"
                    data-testid="video-merged"
                  >
                    <source src={project.mergedVideoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = project.mergedVideoUrl!;
                        link.download = `${project.title}-merged.mp4`;
                        link.click();
                      }}
                      data-testid="button-download-merged"
                      className="w-full sm:w-auto"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Merged Video
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <h2 className="text-2xl font-bold mb-4">Generated Scenes ({scenes.length})</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {scenes.map((scene) => (
                <SceneCard key={scene.scene} scene={scene} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
