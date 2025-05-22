import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TechImplementation() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Technical Implementation</h1>
      <p className="text-gray-600 mb-8">
        A detailed overview of ShelfScanner's architecture, technologies, and technical features.
      </p>

      {/* Architecture Overview */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Architecture Overview</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4">
              ShelfScanner is a modern web application built with a React.js frontend and Express.js backend. 
              The application follows a layered architecture with clear separation of concerns:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Frontend:</strong> React.js with TypeScript, using Wouter for routing and Tailwind CSS with shadcn/ui for styling</li>
              <li><strong>Backend API:</strong> Express.js REST API with TypeScript</li>
              <li><strong>Database:</strong> PostgreSQL with Drizzle ORM for type-safe database operations</li>
              <li><strong>AI Integrations:</strong> OpenAI API for book descriptions, ratings, and recommendations</li>
              <li><strong>Device Tracking:</strong> Device ID-based user tracking for personalized recommendations</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Frontend Technologies */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Frontend Implementation</h2>
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-3">Core Technologies</h3>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li><strong>React.js + TypeScript:</strong> For type-safe component development</li>
              <li><strong>Wouter:</strong> Lightweight routing library for navigation</li>
              <li><strong>TanStack Query:</strong> Data fetching, caching, and state management</li>
              <li><strong>shadcn/ui + Tailwind CSS:</strong> Accessible and customizable UI components</li>
              <li><strong>React Hook Form + Zod:</strong> Form handling with schema validation</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">Key Frontend Features</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Responsive Design:</strong> Mobile-first approach with responsive layouts for all devices</li>
              <li><strong>Progressive Enhancement:</strong> Core functionality works without JavaScript</li>
              <li><strong>Optimized Bundle Size:</strong> Uses Vite for efficient code splitting and bundling</li>
              <li><strong>Device Fingerprinting:</strong> Tracks user preferences with device ID</li>
              <li><strong>Offline Support:</strong> Caches previously viewed books for offline access</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Backend Technologies */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Backend Implementation</h2>
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-3">Core Technologies</h3>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li><strong>Express.js:</strong> REST API framework</li>
              <li><strong>Drizzle ORM:</strong> Type-safe PostgreSQL database operations</li>
              <li><strong>PostgreSQL:</strong> Relational database for persistent storage</li>
              <li><strong>Winston:</strong> Advanced logging with rotation</li>
              <li><strong>OpenAI SDK:</strong> Integration with GPT models</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">API Endpoints</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>/api/enhanced-books:</strong> Search books with AI-enhanced data</li>
              <li><strong>/api/book-details:</strong> Get details for a specific book</li>
              <li><strong>/api/auth:</strong> Authentication endpoints</li>
              <li><strong>/api/admin:</strong> Administrative monitoring endpoints</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Database Schema */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Database Implementation</h2>
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-3">Schema Design</h3>
            <p className="mb-4">
              The database schema is designed for performance and scalability using Drizzle ORM for type-safe operations:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Users:</strong> Stores user credentials and profile information</li>
              <li><strong>Preferences:</strong> Stores user reading preferences with device ID mapping</li>
              <li><strong>BookCache:</strong> Caches book data from external APIs and AI-generated content</li>
              <li><strong>SavedBooks:</strong> Stores user's saved/favorited books</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Data Flow</h3>
            <p>
              The application uses a caching strategy to minimize external API calls. Book metadata, 
              summaries, and ratings are stored in the BookCache table with expiration timestamps. 
              This approach significantly reduces API costs while maintaining data freshness.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* AI and Machine Learning */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">AI Implementation</h2>
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-3">OpenAI Integration</h3>
            <p className="mb-4">
              The application leverages OpenAI's GPT models for several key features:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li><strong>Book Summaries:</strong> AI-generated concise 3-4 sentence summaries</li>
              <li><strong>Book Ratings:</strong> AI-generated ratings based on literary merit</li>
              <li><strong>Recommendation Engine:</strong> AI-powered personalized book recommendations</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">Rate Limiting and Caching</h3>
            <p className="mb-4">
              To optimize API usage and costs, the application implements:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Intelligent Rate Limiting:</strong> Custom rate limiter prevents API quota exhaustion</li>
              <li><strong>Long-term Caching:</strong> AI-generated content is cached for 90 days</li>
              <li><strong>Fallback Mechanisms:</strong> Static data and approximations when API limits are reached</li>
              <li><strong>Background Processing:</strong> Non-critical AI tasks run in the background</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Performance and Monitoring */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Performance & Monitoring</h2>
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-3">Performance Optimizations</h3>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li><strong>Caching Strategy:</strong> Multi-level caching for database and API results</li>
              <li><strong>Lazy Loading:</strong> Components and images load as needed</li>
              <li><strong>Server-side Pagination:</strong> For efficient loading of large datasets</li>
              <li><strong>Optimized API Calls:</strong> Batching and caching to minimize network requests</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">Monitoring & Logging</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Winston Logger:</strong> Structured logging with rotation for debugging</li>
              <li><strong>API Usage Tracking:</strong> Monitors external API usage and costs</li>
              <li><strong>Admin Dashboard:</strong> Real-time monitoring of system health and API usage</li>
              <li><strong>Alerts:</strong> Automatic notifications for critical events</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Security Measures */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Security Implementation</h2>
        <Card>
          <CardContent className="pt-6">
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Password Hashing:</strong> Secure password storage with modern hashing</li>
              <li><strong>HTTPS Only:</strong> All communications encrypted with TLS</li>
              <li><strong>OAuth Integration:</strong> Secure authentication with Google</li>
              <li><strong>Content Security Policy:</strong> Prevents XSS attacks</li>
              <li><strong>Rate Limiting:</strong> Protection against brute force attacks</li>
              <li><strong>Input Validation:</strong> Zod schema validation for all user inputs</li>
              <li><strong>Environment Variable Isolation:</strong> Secure handling of sensitive configuration</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Deployment Architecture */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Deployment Architecture</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4">
              ShelfScanner is deployed using a modern cloud-native approach:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Replit Infrastructure:</strong> Hosted on Replit's scalable platform</li>
              <li><strong>PostgreSQL Database:</strong> Managed by Neon for serverless scaling</li>
              <li><strong>Static Asset CDN:</strong> Fast global delivery of frontend assets</li>
              <li><strong>Automatic Scaling:</strong> Resources scale based on demand</li>
              <li><strong>CI/CD Pipeline:</strong> Automated testing and deployment workflow</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Future Technical Roadmap */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Technical Roadmap</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4">
              Planned technical enhancements for future releases:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Computer Vision Integration:</strong> Enhanced book cover recognition</li>
              <li><strong>PWA Implementation:</strong> Full offline capabilities</li>
              <li><strong>Serverless Functions:</strong> Microservices architecture for scalability</li>
              <li><strong>GraphQL API:</strong> More efficient data querying</li>
              <li><strong>User Preference Learning:</strong> Enhanced ML models for better recommendations</li>
              <li><strong>WebAssembly Integration:</strong> Client-side ML acceleration</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}