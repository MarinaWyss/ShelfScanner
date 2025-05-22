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

// Load Google API script
const loadGoogleScript = () => {
  const id = 'google-script';
  // Return early if script is already loaded
  if (document.getElementById(id)) return;
  
  const script = document.createElement('script');
  script.id = id;
  script.src = 'https://apis.google.com/js/platform.js';
  script.async = true;
  script.defer = true;
  document.body.appendChild(script);
};

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

  // Initialize device ID and load Google scripts on app load
  useEffect(() => {
    // Ensure device ID is set and synced with cookies
    syncDeviceIdCookie();
    
    // Load Google API script for authentication
    loadGoogleScript();
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
              {/* Overlay when sidebar is open (all devices) */}
              {sidebarOpen && (
                <div 
                  onClick={() => setSidebarOpen(false)}
                  className="fixed inset-0 bg-black bg-opacity-50 z-10"
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
