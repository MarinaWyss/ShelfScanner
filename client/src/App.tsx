import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Books from "@/pages/books";
import SavedBooks from "@/pages/saved-books";
import Navbar from "@/components/layout/Navbar";
import ContactForm from "@/components/contact/ContactForm";
import { AuthProvider } from "./contexts/AuthContext";
import { syncDeviceIdCookie } from "./lib/deviceId";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/books" component={Books} />
      <Route path="/reading-list" component={SavedBooks} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleContact = () => setContactOpen(!contactOpen);

  // Initialize device ID on app load
  useEffect(() => {
    // Ensure device ID is set and synced with cookies
    syncDeviceIdCookie();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <div className="min-h-screen flex flex-col bg-background text-foreground">
            <Navbar 
              sidebarOpen={sidebarOpen} 
              toggleSidebar={toggleSidebar} 
              toggleContact={toggleContact} 
            />
            <div className="flex flex-1">
              {/* Overlay for mobile when sidebar is open */}
              {sidebarOpen && (
                <div 
                  onClick={() => setSidebarOpen(false)}
                  className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden"
                />
              )}
              
              <main className="flex-1 overflow-x-hidden overflow-y-auto">
                <Router />
              </main>
              
              <ContactForm isOpen={contactOpen} onClose={() => setContactOpen(false)} />
            </div>
          </div>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
