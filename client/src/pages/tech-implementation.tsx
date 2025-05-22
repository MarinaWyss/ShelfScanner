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
              <li><strong>User Preference System:</strong> Personalized experience based on reading interests</li>
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

            <h3 className="text-xl font-medium mb-3">API Structure</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Book Search:</strong> RESTful endpoints for searching books with AI-enhanced data</li>
              <li><strong>Book Details:</strong> Endpoints for retrieving detailed book information</li>
              <li><strong>Administration:</strong> Secure restricted access for system monitoring</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Database Schema */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Database Implementation</h2>
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-3">Data Storage Approach</h3>
            <p className="mb-4">
              The application uses a well-structured database design for performance and scalability with Drizzle ORM for type-safe operations:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>User Data:</strong> Safe storage of user reading preferences and profile information</li>
              <li><strong>Content Caching:</strong> Efficient storage of book data from external sources and AI-generated content</li>
              <li><strong>User Collections:</strong> System for tracking user's saved and favorite reading materials</li>
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

            <h3 className="text-xl font-medium mb-3">Optimization Strategies</h3>
            <p className="mb-4">
              To deliver a responsive user experience while managing resources efficiently:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Intelligent Resource Management:</strong> Smart allocation of AI resources based on demand</li>
              <li><strong>Content Persistence:</strong> Efficient long-term storage of AI-generated content</li>
              <li><strong>Graceful Degradation:</strong> Ensures consistent user experience under all conditions</li>
              <li><strong>Asynchronous Processing:</strong> Non-critical tasks are handled in the background</li>
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

            <h3 className="text-xl font-medium mb-3">Monitoring & Analytics</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Structured Logging:</strong> Comprehensive system activity tracking</li>
              <li><strong>Resource Optimization:</strong> Monitoring systems to balance performance and costs</li>
              <li><strong>System Health:</strong> Continuous monitoring of application components</li>
              <li><strong>Event Notification:</strong> Automated system for important application events</li>
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
              <li><strong>HTTPS Only:</strong> All communications encrypted with TLS</li>
              <li><strong>Content Security Policy:</strong> Prevents XSS attacks</li>
              <li><strong>Rate Limiting:</strong> Protection against API abuse and DDoS attacks</li>
              <li><strong>Input Validation:</strong> Zod schema validation for all user inputs</li>
              <li><strong>Environment Variable Isolation:</strong> Secure handling of sensitive configuration</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Cloud Architecture */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Cloud Architecture</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4">
              ShelfScanner leverages modern cloud technology for reliability and scalability:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Cloud Hosting:</strong> Modern scalable hosting infrastructure</li>
              <li><strong>Managed Database:</strong> Relational database with serverless capabilities</li>
              <li><strong>Content Delivery:</strong> Global distribution network for fast asset delivery</li>
              <li><strong>Dynamic Scaling:</strong> Resource allocation that adapts to user demand</li>
              <li><strong>Continuous Deployment:</strong> Streamlined release process with automated testing</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}