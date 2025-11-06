import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import VeoGenerator from "@/pages/VeoGenerator";
import BulkGenerator from "@/pages/BulkGenerator";
import ScriptCreator from "@/pages/ScriptCreator";
import History from "@/pages/History";
import TextToImage from "@/pages/TextToImage";
import ImageToVideo from "@/pages/ImageToVideo";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route path="/veo-generator" component={VeoGenerator} />
      <Route path="/bulk-generator" component={BulkGenerator} />
      <Route path="/script-creator" component={ScriptCreator} />
      <Route path="/history" component={History} />
      <Route path="/text-to-image" component={TextToImage} />
      <Route path="/image-to-video" component={ImageToVideo} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
