import { Link, useLocation } from "wouter";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import { useAuth } from "@/contexts/AuthContext";

interface NavbarProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  toggleContact: () => void;
}

export default function Navbar({ sidebarOpen, toggleSidebar, toggleContact }: NavbarProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={toggleSidebar} className="lg:hidden mr-4 text-slate-300 hover:text-white">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="h-6 w-6"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-8 w-8 text-primary" 
                viewBox="0 0 24 24" 
                fill="none"
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
              </svg>
              <span className="text-xl font-semibold text-white">ShelfScanner</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:block">
              <GoogleLoginButton 
                variant="outline" 
                size="sm" 
                className="border-slate-700 text-slate-200 hover:bg-slate-800" 
              />
            </div>
            
            <button onClick={toggleContact} className="text-slate-300 hover:text-white flex items-center gap-2">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="h-6 w-6"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span className="hidden md:inline text-sm">Contact</span>
            </button>
          </div>
        </div>
      </header>
      
      {/* Sidebar Navigation */}
      <aside 
        className={`w-64 bg-slate-800 border-r border-slate-700 fixed top-[69px] bottom-0 left-0 z-20 transition-transform duration-300 ease-in-out lg:relative lg:top-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <nav className="h-full flex flex-col">
          <div className="p-4 flex-1 overflow-y-auto scrollbar-hide">
            <div className="space-y-6">
              <div>
                <div className="text-slate-400 uppercase text-xs font-medium tracking-wider px-3 mb-2">
                  Main
                </div>
                <ul className="space-y-1">
                  <li>
                    <Link href="/" className={`flex items-center gap-3 w-full px-3 py-2 rounded-md font-medium transition-colors duration-150 ${
                        location === '/' 
                          ? 'bg-slate-700 text-primary' 
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}>
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="h-5 w-5"
                        >
                          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        <span>Home</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/books" className={`flex items-center gap-3 w-full px-3 py-2 rounded-md font-medium transition-colors duration-150 ${
                        location === '/books' 
                          ? 'bg-slate-700 text-primary' 
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}>
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="h-5 w-5"
                        >
                          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                        </svg>
                        <span>Book Scanner</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/reading-list" className={`flex items-center gap-3 w-full px-3 py-2 rounded-md font-medium transition-colors duration-150 ${
                        location === '/reading-list' 
                          ? 'bg-slate-700 text-primary' 
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}>
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="h-5 w-5"
                        >
                          <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                        </svg>
                        <span>Reading List</span>
                    </Link>
                  </li>

                </ul>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-700">
            <div className="bg-slate-700 rounded-lg p-3 mb-3">
              <p className="text-sm text-slate-300 mb-2">
                Questions or suggestions? Get in touch with our team
              </p>
              <button 
                onClick={toggleContact}
                className="bg-primary text-white text-sm px-3 py-1.5 rounded-md hover:bg-opacity-90 transition-colors w-full flex items-center justify-center gap-2">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="h-4 w-4"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span>Contact Us</span>
              </button>
            </div>
            
            {/* Cross-device access with Google login */}
            <div className="bg-slate-700 rounded-lg p-3">
              <p className="text-sm text-slate-300 mb-2">
                Access your reading list everywhere
              </p>
              <div className="w-full">
                <GoogleLoginButton 
                  variant="default"
                  size="sm"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}
