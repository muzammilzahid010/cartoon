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
      <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error || !data?.project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] flex items-center justify-center">
        <Card className="p-8 text-center bg-[#1e2838] border-white/10">
          <p className="text-red-400 mb-4">Project not found</p>
          <Link href="/projects">
            <Button className="bg-purple-600 hover:bg-purple-700">Back to Projects</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const project = data.project;
  const characters = parseJSON<Character[]>(project.characters, []);
  const scenes = parseJSON<Scene[]>(project.scenes, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      <header className="border-b border-white/10 bg-[#1c2534]/80 dark:bg-[#161c28]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <h1 className="text-sm sm:text-base md:text-lg font-semibold text-white truncate">{project.title}</h1>
          <div className="flex gap-2">
            <Link href="/projects">
              <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" data-testid="link-back">
                <ArrowLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" data-testid="link-home">
                <Home className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Home</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="space-y-6">
          <Card className="bg-[#1e2838] dark:bg-[#181e2a] border border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Story Script</CardTitle>
              <CardDescription className="text-gray-300">The original story script for this project</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm sm:text-base whitespace-pre-wrap text-gray-200">{project.script}</p>
            </CardContent>
          </Card>

          <Card className="bg-[#1e2838] dark:bg-[#181e2a] border border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Characters ({characters.length})</CardTitle>
              <CardDescription className="text-gray-300">Characters in this story</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {characters.map((char, idx) => (
                <div key={idx} className="border-l-4 border-purple-500 pl-4">
                  <h4 className="font-semibold text-white">{char.name}</h4>
                  <p className="text-sm text-gray-300">{char.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {project.mergedVideoUrl && (
            <Card className="bg-[#1e2838] dark:bg-[#181e2a] border border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Merged Video</CardTitle>
                <CardDescription className="text-gray-300">The complete story video combining all scenes</CardDescription>
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
                      className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
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
            <h2 className="text-2xl font-bold mb-4 text-white">Generated Scenes ({scenes.length})</h2>
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
