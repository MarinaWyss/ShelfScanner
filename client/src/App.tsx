import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Books from "@/pages/books";
import Navbar from "@/components/layout/Navbar";
import ChatOverlay from "@/components/chat/ChatOverlay";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/books" component={Books} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleChat = () => setChatOpen(!chatOpen);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen flex flex-col">
          <Navbar 
            sidebarOpen={sidebarOpen} 
            toggleSidebar={toggleSidebar} 
            toggleChat={toggleChat} 
          />
          <div className="flex flex-1">
            {/* Overlay for mobile when sidebar is open */}
            {sidebarOpen && (
              <div 
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-neutral-900 bg-opacity-50 z-10 lg:hidden"
              />
            )}
            
            <main className="flex-1 overflow-x-hidden overflow-y-auto bg-neutral-50">
              <Router />
            </main>
            
            <ChatOverlay isOpen={chatOpen} onClose={() => setChatOpen(false)} />
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
