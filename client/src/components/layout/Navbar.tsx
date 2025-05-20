import { Link, useLocation } from "wouter";

interface NavbarProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  toggleChat: () => void;
}

export default function Navbar({ sidebarOpen, toggleSidebar, toggleChat }: NavbarProps) {
  const [location] = useLocation();

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
            <button onClick={toggleChat} className="text-slate-300 hover:text-white">
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
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
                </ul>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-700">
            <div className="bg-slate-700 rounded-lg p-3">
              <p className="text-sm text-slate-300 mb-2">
                Get personalized book recommendations with our AI assistant
              </p>
              <button 
                onClick={toggleChat}
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
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Open Chat</span>
              </button>
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}
